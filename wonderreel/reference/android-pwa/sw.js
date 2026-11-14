/* WonderReel web preview: static shell cache, never cache user uploads or private content. */
const CACHE='wonderreel-android-preview-v1';
const SHELL=['/','/index.html','/styles.css','/app.js','/android-preview.js','/manifest.webmanifest','/assets/favicon.svg','/assets/icon-192.png','/assets/icon-512.png','/assets/hero.svg','/assets/space.svg','/assets/santa.svg','/assets/fantasy.svg','/assets/pirate.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||!new URL(req.url).origin.includes(self.location.origin)||req.url.includes('/api/'))return;
 event.respondWith(fetch(req).then(response=>{if(response.ok && SHELL.includes(new URL(req.url).pathname)){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{})}return response}).catch(()=>caches.match(req)));
});
