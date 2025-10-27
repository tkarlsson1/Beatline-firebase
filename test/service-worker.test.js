// /test/service-worker.test.js — scoped SW for /test
const NS_CACHE = 'ns-test-appshell-v0-001';
const NS_ASSETS = [
  '/test/',
  '/test/index.html',
  '/test/offline.html',
  '/manifest.json',
  '/icon.png',
  '/icon-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(NS_CACHE).then(c => c.addAll(NS_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== NS_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigate requests: network first with offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/test/offline.html')));
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(res => {
      const copy = res.clone();
      caches.open(NS_CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => cached);
    return cached || net;
  })());
});
