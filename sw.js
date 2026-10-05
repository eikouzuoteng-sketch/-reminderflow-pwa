const CACHE='reminderflow-pwa-v0.2.1';
const CORE=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp}).catch(()=>caches.match('./index.html'))))});
self.addEventListener('push',event=>{
  let data={title:'ReminderFlow',body:'リマインダーがあります。'};
  try{data={...data,...event.data.json()}}catch(_){ }
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',data:data.url||'./'}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow(event.notification.data||'./'))});
