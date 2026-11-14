import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWonderReelServer} from '../server.mjs';

const tinyPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
const imageData='data:image/png;base64,'+tinyPng;
const base={prompt:'Make my character explore Mars with a friendly robot.',style:'Cinematic',adultConfirmed:true,rightsConfirmed:true,mediaData:imageData};
const asJson=(data)=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});

async function runServer(server,run){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 try{await run(url)}finally{await new Promise(resolve=>server.close(resolve))}
}
const post=(url,body)=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('health and static files load without credentials; private files cannot be served', async()=>{
 const server=createWonderReelServer({env:{}});
 await runServer(server,async url=>{
  let r=await fetch(url+'/api/health');assert.equal(r.status,200);
  const d=await r.json();assert.equal(d.imageConfigured,false);assert.equal(d.videoConfigured,false);
  r=await fetch(url+'/');assert.equal(r.status,200);assert.match(await r.text(),/WonderReel/);
  r=await fetch(url+'/backend/server.mjs');assert.equal(r.status,403);
  r=await fetch(url+'/.env.example');assert.equal(r.status,403);
 });
});
test('missing credentials and adult/family safeguards fail closed',async()=>{
 const server=createWonderReelServer({env:{}});
 await runServer(server,async url=>{
  let r=await post(url+'/api/generate/image',base);assert.equal(r.status,503);
  r=await post(url+'/api/generate/image',{...base,adultConfirmed:false});assert.equal(r.status,503);
  r=await post(url+'/api/generate/video',{...base,familyMode:true});assert.equal(r.status,503);
 });
});
test('image generation, image edits, moderation, and video provider jobs work with mocked providers',async()=>{
 const calls=[];
 const mockedFetch=async(url,options={})=>{
  const address=String(url);calls.push({url:address,body:options.body?JSON.parse(options.body):null});
  if(address.endsWith('/moderations'))return asJson({results:[{flagged:false}]});
  if(address.endsWith('/images/edits')||address.endsWith('/images/generations'))return asJson({data:[{b64_json:tinyPng}]});
  if(address.endsWith('/image_to_video'))return asJson({id:'497f6eca-6276-4993-bfeb-53cbbbba6f08'});
  if(address.endsWith('/video_to_video'))return asJson({id:'897f6eca-6276-4993-bfeb-53cbbbba6f09'});
  if(address.includes('/tasks/'))return asJson({status:'SUCCEEDED',output:['https://cdn.cloudfront.net/output.mp4']});
  if(address==='https://cdn.cloudfront.net/output.mp4')return new Response(Buffer.from('fake-mp4-buffer'),{status:200,headers:{'content-type':'video/mp4'}});
  throw Error('Unknown mocked request: '+address);
 };
 const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'wr-test-'));
 const server=createWonderReelServer({env:{OPENAI_API_KEY:'mock-key',RUNWAY_API_KEY:'mock-runway'},fetchImpl:mockedFetch,outputDir});
 try{
 await runServer(server,async url=>{
  let r=await post(url+'/api/generate/image',base);assert.equal(r.status,200);let d=await r.json();assert.equal(d.mode,'image-edit');
  let asset=await fetch(url+d.url);assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/png');
  r=await post(url+'/api/generate/image',{prompt:base.prompt,style:'Fantasy',adultConfirmed:true});assert.equal(r.status,200);
  r=await post(url+'/api/generate/video',{...base,kind:'image'});assert.equal(r.status,202);d=await r.json();assert.equal(d.status,'PENDING');
  const job=await fetch(url+'/api/generate/video/'+d.id);const j=await job.json();assert.equal(j.status,'SUCCEEDED');assert.ok(j.url?.startsWith('/api/generated/'));
  asset=await fetch(url+j.url);assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'video/mp4');
  const smallMp4='data:video/mp4;base64,'+Buffer.from('000000186674797069736f6d00000000','hex').toString('base64');
  r=await post(url+'/api/generate/video',{...base,kind:'video',mediaData:smallMp4});assert.equal(r.status,202);
  const videoJob=await r.json();const editedJob=await fetch(url+'/api/generate/video/'+videoJob.id);
  assert.equal((await editedJob.json()).status,'SUCCEEDED');
  assert.ok(calls.some(c=>c.url.endsWith('/video_to_video')));
  assert.ok(calls.some(c=>c.url.endsWith('/images/edits')));
  assert.ok(calls.some(c=>c.url.endsWith('/images/generations')));
  assert.ok(calls.some(c=>c.url.endsWith('/image_to_video')));
  assert.ok(calls.filter(c=>c.url.endsWith('/moderations')).length>=4);
 });
 }finally{await fs.rm(outputDir,{recursive:true,force:true})}
});
test('configured backend rejects Family Mode and non-adult media before calling provider',async()=>{
 let called=false;
 const server=createWonderReelServer({env:{OPENAI_API_KEY:'test',RUNWAY_API_KEY:'test'},fetchImpl:async()=>{called=true;throw Error('Unexpected provider call')}});
 await runServer(server,async url=>{
  let r=await post(url+'/api/generate/image',{...base,familyMode:true});assert.equal(r.status,403);
  r=await post(url+'/api/generate/video',{...base,kind:'image',adultConfirmed:false});assert.equal(r.status,403);
  r=await post(url+'/api/generate/image',{...base,rightsConfirmed:false});assert.equal(r.status,403);
  assert.equal(called,false);
 });
});
