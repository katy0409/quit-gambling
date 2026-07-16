const CACHE = 'restart-v13.11';
const FILES = [
  './','index.html','manifest.webmanifest','icon-192.png','icon-512.png','coin-icon.png',
  'css/app.css?v=13.11','js/supabase-config.js?v=13.11','js/cloud-settings.js?v=13.11',
  'js/auth.js?v=13.11','js/app.js?v=13.11','js/avatar-v123.js?v=13.11','js/square-v13.js?v=13.11','js/feedback-v133.js?v=13.11','js/admin-v134.js?v=13.11','js/wallet-v135.js?v=13.11','js/daily-v135.js?v=13.11',
  'assets/avatar/base/base_front.png','assets/avatar/base/base_left.png','assets/avatar/base/base_right.png',
  'assets/avatar/face/male_face_default.png','assets/avatar/face/female_face_default.png',
  'assets/avatar/hair/male/male_hair_001_front.png','assets/avatar/hair/male/male_hair_001_left.png','assets/avatar/hair/male/male_hair_001_right.png','assets/avatar/hair/female/female_hair_001_front.png','assets/avatar/hair/female/female_hair_001_left.png','assets/avatar/hair/female/female_hair_001_right.png'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response => { const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,copy)); return response; }).catch(()=>caches.match(event.request)));
});
