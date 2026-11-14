/**
 * WonderReel V2 development server.
 * Local-only proof of API integration. NOT a public/production server.
 * Secrets stay on the server; no auth, durable queue, video-frame moderation,
 * or cloud storage yet. Do not expose its port to the internet.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const MAX_BODY = 5_800_000;
const MAX_MEDIA_BYTES = 3_300_000;
const MAX_OUTPUT_BYTES = 75_000_000;
const TTL = 60 * 60 * 1000;
const AI_ORIGIN = 'https://api.openai.com/v1';
const RUNWAY_ORIGIN = 'https://api.dev.runwayml.com/v1';
const access = {'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"};
const fail=(status, message)=>Object.assign(new Error(message),{status});
const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8',...access});res.end(JSON.stringify(value))};

async function readJSON(req){
 let buffers=[],size=0;
 for await(const buffer of req){size+=buffer.length;if(size>MAX_BODY)throw fail(413,'Media too large. Select an image or short clip under 3 MB.');buffers.push(buffer)}
 try{return JSON.parse(Buffer.concat(buffers).toString('utf8'))}catch{throw fail(400,'Invalid JSON input')}
}
function parseMedia(data, type){
 if(typeof data!=='string'||data.length<28)throw fail(400,'Select a valid photo or short video');
 const match=/^data:(image\/(?:png|jpeg|webp)|video\/mp4);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
 if(!match)throw fail(400,'Supported formats: PNG, JPG, WEBP, MP4. MOV and other files need conversion first.');
 if(match[1].split('/')[0]!==type)throw fail(400,`Expected ${type} media`);
 const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>MAX_MEDIA_BYTES)throw fail(413,'Select media under 3 MB');
 const b=bytes;
 const valid=match[1]==='image/png'?b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
 match[1]==='image/jpeg'?b[0]===0xff&&b[1]===0xd8&&b[2]===0xff:
 match[1]==='image/webp'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP':
 b.toString('ascii',4,8)==='ftyp';
 if(!valid)throw fail(400,'File type does not match its contents');
 return {data,mime:match[1],bytes};
}
function checkInput(body, needsMedia=false){
 if(typeof body!=='object'||!body)throw fail(400,'Invalid request');
 const prompt=String(body.prompt||'').trim();
 if(prompt.length<15||prompt.length>1500)throw fail(400,'Describe a scene using 15–1500 characters');
 const style=['Cinematic','Animated','Fantasy'].includes(body.style)?body.style:'Cinematic';
 if(body.familyMode)throw fail(403,'Cloud AI is not enabled for Family Mode. Parent consent and child-safety checks are required first.');
 if(body.adultConfirmed!==true)throw fail(403,'Confirm you are an adult and the media features adults only.');
 if(needsMedia&&!body.mediaData)throw fail(400,'Upload a photo or short video for this generation');
 if(body.mediaData&&body.rightsConfirmed!==true)throw fail(403,'Confirm rights and permissions for everyone in the uploaded media.');
 return {prompt,style};
}
function withStyle(prompt,style){return `${prompt}\n\nVisual direction: ${style.toLowerCase()} style, coherent continuity, carefully framed vertical composition, family-friendly, no celebrity impersonation, no trademarks.`}
function safeApiError(data,status){return data?.error?.message||data?.message||`AI provider returned ${status}`}
async function requestJSON(fetchImpl,url,{method='GET',headers={},body,timeout=45000}={}){
 const res=await fetchImpl(url,{method,headers:{...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw fail(res.status===429?429:502,safeApiError(data,res.status));
 return data;
}
export function createWonderReelServer({env=process.env,fetchImpl=fetch,outputDir,clock=Date.now}={}){
 const openaiKey=env.OPENAI_API_KEY||'';
 const runwayKey=env.RUNWAYML_API_SECRET||env.RUNWAY_API_KEY||'';
 const videoModel=env.RUNWAY_IMAGE_MODEL||'gen4_turbo';
 const videoEditModel=env.RUNWAY_VIDEO_MODEL||'aleph2';
 const imageModel=env.OPENAI_IMAGE_MODEL||'gpt-image-2.5-flare';
 const directorModel=env.OPENAI_MODEL||'gpt-4.1-mini';
 const outputs=outputDir||path.join(os.tmpdir(),'wonderreel-generated-'+process.pid);
 const items=new Map();
 const allowance=[];
 const counters={images:0,videos:0};
 const aiHeaders=()=>({'authorization':`Bearer ${openaiKey}`,'content-type':'application/json'});
 const runwayHeaders=()=>({'authorization':`Bearer ${runwayKey}`,'content-type':'application/json','X-Runway-Version':'2024-11-06'});
 function needKeys(...keys){for(const [value,name] of keys){if(!value)throw fail(503,`${name} is not configured on the server. See README.md.`)}}
 function limit(kind){const now=clock();for(let i=allowance.length-1;i>=0;i--)if(now-allowance[i].at>3600000)allowance.splice(i,1);const max=kind==='image'?8:3;if(allowance.filter(x=>x.kind===kind).length>=max)throw fail(429,`Local hourly limit reached for ${kind} generation. Try later.`);if(kind==='video'&&[...items.values()].some(x=>x.type==='video'&&['PENDING','RUNNING','THROTTLED'].includes(x.status)))throw fail(429,'One video is already rendering. Finish it before starting another.');allowance.push({kind,at:now});}
 async function moderate(prompt,source){
  needKeys([openaiKey,'OPENAI_API_KEY']);
  const input=[{type:'text',text:prompt}];if(source?.mime.startsWith('image/'))input.push({type:'image_url',image_url:{url:source.data}});
  const result=await requestJSON(fetchImpl,AI_ORIGIN+'/moderations',{method:'POST',headers:aiHeaders(),body:{model:'omni-moderation-latest',input},timeout:30000});
  if(result.results?.some(x=>x.flagged))throw fail(422,'This request cannot be generated. Please try a different, safe scene.');
 }
 async function saveMedia(binary,ext){const id=crypto.randomUUID();await fs.mkdir(outputs,{recursive:true,mode:0o700});const filename=path.join(outputs,id+'.'+ext);await fs.writeFile(filename,binary,{mode:0o600});items.set(id,{type:'file',filename,created:clock(),ext});return '/api/generated/'+id;}
 async function imageGeneration(body){
  needKeys([openaiKey,'OPENAI_API_KEY']);const {prompt,style}=checkInput(body);const source=body.mediaData?parseMedia(body.mediaData,'image'):null;
  await moderate(prompt,source);limit('image');
  const route=source?'/images/edits':'/images/generations';
  const payload={model:imageModel,prompt:withStyle(prompt,style),size:'1024x1536',n:1,output_format:'png',quality:'medium'};
  if(source)payload.images=[{image_url:source.data}];
  const result=await requestJSON(fetchImpl,AI_ORIGIN+route,{method:'POST',headers:aiHeaders(),body:payload,timeout:180000});
  const b64=result.data?.[0]?.b64_json;
  if(!b64)throw fail(502,'Image provider returned no image');
  const bytes=Buffer.from(b64,'base64');if(!bytes.length||bytes.length>20_000_000)throw fail(502,'Image output was invalid');
  await moderate('Generated image safety check',{mime:'image/png',data:'data:image/png;base64,'+b64});
  const url=await saveMedia(bytes,'png');counters.images++;return {status:'SUCCEEDED',url,format:'png',mode:source?'image-edit':'text-to-image',note:'Development-only result; available locally for about one hour.'};
 }
 async function director(body){needKeys([openaiKey,'OPENAI_API_KEY']);const {prompt,style}=checkInput(body);await moderate(prompt);
 const response=await requestJSON(fetchImpl,AI_ORIGIN+'/responses',{method:'POST',headers:aiHeaders(),body:{model:directorModel,store:false,instructions:'You create safe, four-scene movie storyboards for adults. Never impersonate a real person without permission. Return ONLY valid JSON with title and scenes array containing precisely four objects {number,title,description}, titles <100 chars, descriptions <220 chars.',input:`Visual style: ${style}\nStory: ${prompt}`},timeout:80000});
 const output=response.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')||response.output_text||'';
 let parsed;try{parsed=JSON.parse(output)}catch{throw fail(502,'AI Director returned an invalid storyboard')}
 if(!Array.isArray(parsed.scenes)||parsed.scenes.length!==4)throw fail(502,'AI Director did not return four scenes');return {title:String(parsed.title||'Your adventure').slice(0,160),scenes:parsed.scenes.map((s,i)=>({number:i+1,title:String(s.title||'Scene').slice(0,100),description:String(s.description||'').slice(0,220)})),prompt,style};
 }
 async function startVideo(body){needKeys([openaiKey,'OPENAI_API_KEY'],[runwayKey,'RUNWAYML_API_SECRET']);const {prompt,style}=checkInput(body,true);
  const kind=body.kind==='video'?'video':'image';const source=parseMedia(body.mediaData,kind);await moderate(prompt,kind==='image'?source:null);limit('video');
  const endpoint=kind==='image'?'/image_to_video':'/video_to_video';
  const request=kind==='image'?{model:videoModel,promptImage:source.data,promptText:withStyle(prompt,style).slice(0,1000),ratio:'720:1280',duration:5}:{model:videoEditModel,videoUri:source.data,promptText:withStyle(prompt,style).slice(0,1000)};
  const data=await requestJSON(fetchImpl,RUNWAY_ORIGIN+endpoint,{method:'POST',headers:runwayHeaders(),body:request,timeout:60000});
  if(!/^[a-z0-9-]{10,100}$/i.test(String(data.id||'')))throw fail(502,'Video provider did not return a job ID');
  const id=crypto.randomUUID();items.set(id,{type:'video',providerId:data.id,kind,status:'PENDING',created:clock(),updated:clock(),checked:0,result:null,error:null});counters.videos++;
  return {id,status:'PENDING',kind,note:'Video rendering has begun. Keep the local server running. This does not create a public post.'};
 }
 async function storeVideoFromProvider(url){
   const parsed=new URL(url);if(parsed.protocol!=='https:'||!(/(^|\.)cloudfront\.net$|(^|\.)runwayml\.com$/.test(parsed.hostname)))throw fail(502,'Unexpected video download host from provider');
   const res=await fetchImpl(url,{signal:AbortSignal.timeout(90000)});if(!res.ok)throw fail(502,'Video download from provider failed');
   const reader=res.body?.getReader();let total=0;const chunks=[];
   if(reader){while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_OUTPUT_BYTES){await reader.cancel();throw fail(502,'Generated video exceeds the 75 MB limit')}chunks.push(Buffer.from(value))}}
   else {const bytes=Buffer.from(await res.arrayBuffer());total=bytes.length;chunks.push(bytes)}
   if(total<1||total>MAX_OUTPUT_BYTES)throw fail(502,'Generated video has an invalid size');
   return saveMedia(Buffer.concat(chunks,total),'mp4');
 }
 async function pollVideo(id){const item=items.get(id);if(!item||item.type!=='video')throw fail(404,'Video job not found');
   if(['SUCCEEDED','FAILED','CANCELED'].includes(item.status))return {id,status:item.status,url:item.result,error:item.error};
   if(clock()-item.checked<4000)return {id,status:item.status,note:'Still generating'};
   item.checked=clock();const result=await requestJSON(fetchImpl,RUNWAY_ORIGIN+'/tasks/'+encodeURIComponent(item.providerId),{headers:runwayHeaders(),timeout:25000});
   item.updated=clock();item.status=result.status||'RUNNING';
   if(item.status==='SUCCEEDED'){
    try{const url=result.output?.find(x=>typeof x==='string'&&x.startsWith('https://'));if(!url)throw fail(502,'Video job succeeded but no video file was returned');item.result=await storeVideoFromProvider(url)}catch(e){item.status='FAILED';item.error=e.message}
   }else if(['FAILED','CANCELED'].includes(item.status))item.error=String(result.failure||result.failureCode||'Rendering could not complete').slice(0,200);
   return {id,status:item.status,url:item.result,error:item.error};
 }
 async function cleanExpired(){for(const [id,item] of items){if(clock()-item.created>TTL){items.delete(id);if(item.type==='file')await fs.unlink(item.filename).catch(()=>{})}}}
 const cleanupInterval=setInterval(()=>cleanExpired().catch(()=>{}),5*60*1000);cleanupInterval.unref();
 const handler=async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');const pathname=url.pathname;
   if(pathname==='/api/health'&&req.method==='GET')return reply(res,200,{status:'ok',environment:'LOCAL DEVELOPMENT ONLY',aiConfigured:!!openaiKey,imageConfigured:!!openaiKey,videoConfigured:!!(openaiKey&&runwayKey),videoToVideoConfigured:!!(openaiKey&&runwayKey),familyCloudEnabled:false,limits:{imagePerHour:8,videoPerHour:3}});
   if(pathname==='/api/director'&&req.method==='POST')return reply(res,200,await director(await readJSON(req)));
   if(pathname==='/api/generate/image'&&req.method==='POST')return reply(res,200,await imageGeneration(await readJSON(req)));
   if(pathname==='/api/generate/video'&&req.method==='POST')return reply(res,202,await startVideo(await readJSON(req)));
   if(pathname.startsWith('/api/generate/video/')&&req.method==='GET')return reply(res,200,await pollVideo(pathname.split('/').at(-1)));
   if(pathname.startsWith('/api/generated/')&&req.method==='GET'){
    const id=pathname.split('/').at(-1);const item=items.get(id);if(!item||item.type!=='file')throw fail(404,'Generated file no longer available');
    if(clock()-item.created>TTL){await cleanExpired();throw fail(410,'Generated file has expired')}
    const file=await fs.readFile(item.filename);res.writeHead(200,{'content-type':item.ext==='mp4'?'video/mp4':'image/png','content-length':file.length,'content-disposition':`inline; filename="wonderreel-${id}.${item.ext}"`,...access});return res.end(file);
   }
   if(pathname.startsWith('/api/'))throw fail(404,'API route not found');
   if(req.method!=='GET'&&req.method!=='HEAD')throw fail(405,'Method not allowed');
   const filename=decodeURIComponent(pathname);
   if(filename.startsWith('/backend/')||filename.startsWith('/supabase/')||filename.includes('/.')||filename.includes('\\'))throw fail(403,'Forbidden');
   const target=path.resolve(root,'.'+(filename==='/'?'/index.html':filename));
   if(!target.startsWith(root+path.sep))throw fail(403,'Forbidden');
   const stat=await fs.stat(target).catch(()=>null);if(!stat?.isFile())throw fail(404,'Not found');
   const data=await fs.readFile(target);res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream',...access});return res.end(req.method==='HEAD'?undefined:data);
  }catch(err){return reply(res,err.status||500,{error:err.status?err.message:'Request failed; see local server logs'})}
 };
 return http.createServer(handler);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||3000);
 createWonderReelServer().listen(port,'127.0.0.1',()=>console.log(`WonderReel V2 local-only server: http://127.0.0.1:${port}`));
}
