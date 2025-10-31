// service-worker.js (consolidated)
// Notestream PWA — unified cache & offline fallback
const NS_CACHE = 'ns-appshell-v1-2025-10-27';
const NS_ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/offline.html',
  '/icon.png', '/icon-maskable.png', '/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(NS_CACHE).then(cache => cache.addAll(NS_ASSETS))
  );
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

  // HTML navigations: go network first, fall back to offline.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // For other GETs: stale-while-revalidate
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      const copy = res.clone();
      caches.open(NS_CACHE).then(cache => cache.put(req, copy));
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
