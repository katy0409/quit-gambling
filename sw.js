const CACHE = 'restart-v12.4.1';
const FILES = [
  './','index.html','manifest.webmanifest','icon-192.png','icon-512.png','coin-icon.png',
  'css/app.css?v=12.4.1','js/supabase-config.js?v=12.4.1','js/cloud-settings.js?v=12.4.1',
  'js/auth.js?v=12.4.1','js/app.js?v=12.4.1','js/avatar-v123.js?v=12.4.1','js/square-v13.js?v=12.4.1',
  'assets/avatar/body/body_front.png','assets/avatar/body/body_left.png','assets/avatar/body/body_right.png',
  'assets/avatar/body/body_back_left.png','assets/avatar/body/body_back.png','assets/avatar/body/body_back_right.png',
  'assets/avatar/head/head_base.png','assets/avatar/face/male_face_default.png','assets/avatar/face/female_face_default.png',
  'assets/avatar/hair/male/male_hair_001_front.png','assets/avatar/hair/male/male_hair_001_back.png',
  'assets/avatar/hair/female/female_hair_001_front.png','assets/avatar/hair/female/female_hair_001_back.png'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response => { const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,copy)); return response; }).catch(()=>caches.match(event.request)));
});
