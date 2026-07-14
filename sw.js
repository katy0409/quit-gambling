const CACHE = 'restart-v12-1';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'coin-icon.png',
  'assets/characters/male-1.png',
  'assets/characters/male-2.png',
  'assets/characters/male-3.png',
  'assets/characters/male-4.png',
  'assets/characters/male-5.png',
  'assets/characters/female-1.png',
  'assets/characters/female-2.png',
  'assets/characters/female-3.png',
  'assets/characters/female-4.png',
  'assets/characters/female-5.png',
  'css/app.css?v=12.1',
  'js/supabase-config.js?v=12.1',
  'js/cloud-settings.js?v=12.1',
  'js/auth.js?v=12.1',
  'js/app.js?v=12.1'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAppAsset = url.origin === self.location.origin;

  if (!isAppAsset) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
