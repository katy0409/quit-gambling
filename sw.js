const CACHE = 'restart-v13.28-receipt-fix-1';
const VER = '13.28';
const FILES = [
  './','index.html','manifest.webmanifest','icon-192.png','icon-512.png','coin-icon.png',
  `css/app.css?v=${VER}`,`js/supabase-config.js?v=${VER}`,`js/core-v14.js?v=${VER}`,`js/cloud-settings.js?v=${VER}`,
  `js/auth.js?v=${VER}`,`js/sos-quotes.js?v=${VER}`,`js/app.js?v=${VER}`,`js/avatar-v123.js?v=${VER}`,`js/square-v13.js?v=${VER}`,`js/feedback-v133.js?v=${VER}`,`js/admin-v134.js?v=${VER}`,`js/square-chat-v1315.js?v=${VER}`,`js/wallet-v135.js?v=${VER}`,`js/daily-v135.js?v=${VER}`,
  'assets/avatar/base/base_front.png','assets/avatar/base/base_left.png','assets/avatar/base/base_right.png',
  'assets/avatar/expression/default/default_front.png','assets/avatar/expression/default/default_left.png','assets/avatar/expression/default/default_right.png',
  'assets/avatar/hair/male/male_hair_001_front.png','assets/avatar/hair/male/male_hair_001_left.png','assets/avatar/hair/male/male_hair_001_right.png','assets/avatar/hair/female/female_hair_001_front.png','assets/avatar/hair/female/female_hair_001_left.png','assets/avatar/hair/female/female_hair_001_right.png',
  'assets/avatar/top/default/default_front.png','assets/avatar/top/default/default_left.png','assets/avatar/top/default/default_right.png',
  'assets/avatar/top/white-t/white-t_front.png','assets/avatar/top/white-t/white-t_left.png','assets/avatar/top/white-t/white-t_right.png',
  'assets/avatar/top/male-top-1/male-top-1_front.png','assets/avatar/top/male-top-1/male-top-1_left.png','assets/avatar/top/male-top-1/male-top-1_right.png',
  'assets/avatar/bottom/default/default_front.png','assets/avatar/bottom/default/default_left.png','assets/avatar/bottom/default/default_right.png',
  'assets/avatar/bottom/black-shorts/black-shorts_front.png','assets/avatar/bottom/black-shorts/black-shorts_left.png','assets/avatar/bottom/black-shorts/black-shorts_right.png',
  'assets/avatar/bottom/male-bottom-1/male-bottom-1_front.png',
  'assets/avatar/shoes/default/default_front.png','assets/avatar/shoes/default/default_left.png','assets/avatar/shoes/default/default_right.png'
];

// V13.27：外部程式庫也要快取，否則離線時 Supabase 程式庫載不進來，
// 使用者會卡在登入頁、連 SOS 都按不到。
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
];
const CDN_HOSTS = ['cdn.jsdelivr.net','cdn.sheetjs.com'];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE)
    .then(cache => cache.addAll(FILES).then(() =>
      // 外部檔案抓不到時不要讓安裝失敗。
      Promise.all(CDN_FILES.map(url => cache.add(new Request(url, { mode: 'cors' })).catch(e => console.warn('CDN 快取失敗', url, e))))
    ))
    .then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // 同網域：維持網路優先，順便更新快取；離線時退回快取。
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(hit =>
          hit || (event.request.mode === 'navigate' ? caches.match('index.html') : undefined)
        ))
    );
    return;
  }

  // 外部程式庫：快取優先，載入快又能離線使用。Supabase API 等其他網域不介入。
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(event.request).then(hit => {
        if (hit) return hit;
        return fetch(event.request).then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        });
      })
    );
  }
});
