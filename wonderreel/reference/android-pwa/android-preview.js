/* Static public Android preview. Never send real media or prompts to unauthenticated AI endpoints. */
(() => {
  'use strict';
  const generationIds=['askAiDirector','generateImage','generateVideo'];
  for(const id of generationIds){const btn=document.getElementById(id);if(btn){btn.disabled=true;btn.title='Requires the private WonderReel AI backend. This Android preview does not transmit media to AI providers.';btn.setAttribute('aria-label',id==='askAiDirector'?'AI Director unavailable in this preview':'AI generation unavailable in this preview');}}
  const aiStatus=document.getElementById('aiStatusText');
  if(aiStatus)aiStatus.textContent='Android preview: storyboard creation and remixing work locally. AI image and video rendering will be enabled when the secure backend is deployed.';
  const pill=document.querySelector('.preview-badge');
  if(pill)pill.innerHTML='<span class="pulse-dot"></span> ANDROID APP PREVIEW';
  const text=document.querySelector('.under-button');
  if(text)text.textContent='App preview only. No AI generation, public posting, or account login yet. Family stories remain private on this device.';
  const button=document.getElementById('installAppButton');
  let deferred;
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();deferred=event;
    if(button)button.hidden=false;
  });
  if(button){
    button.addEventListener('click',async()=>{
      if(deferred){const p=deferred;deferred=null;p.prompt();await p.userChoice.catch(()=>{});button.hidden=true;return;}
      if(typeof window.openModal==='function')window.openModal('Install WonderReel','On Android Chrome, tap ⋮ (menu) → Install app or Add to Home screen. You can then open WonderReel from your Android home screen.');
      else alert('On Android Chrome, tap the ⋮ menu, then Install app or Add to Home screen.');
    });
  }
  window.addEventListener('appinstalled',()=>{if(button)button.hidden=true});
  if('serviceWorker' in navigator&&window.isSecureContext){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
})();
