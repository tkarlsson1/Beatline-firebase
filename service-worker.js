// service-worker.js (consolidated)
// Notestream PWA — unified cache & offline fallback
const NS_CACHE = 'ns-appshell-v1-2026-06-25-v27';
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

  // Ignorera cross-origin-anrop (som iTunes API)
  if (!req.url.startsWith(self.location.origin)) {
    return;
  }

  // HTML navigations: go network first, fall back to offline.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const offlineMatch = await caches.match('/offline.html');
        return offlineMatch || new Response('Offline. Vänligen anslut till internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      })
    );
    return;
  }

  // For other GETs: stale-while-revalidate
  event.respondWith((async () => {
    try {
      const cached = await caches.match(req);
      if (cached) {
        // Uppdatera cachen i bakgrunden
        fetch(req).then(res => {
          if (res && res.ok) {
            caches.open(NS_CACHE).then(cache => cache.put(req, res.clone()));
          }
        }).catch(() => {}); // Ignorera nätverksfel vid bakgrundsuppdatering
        return cached;
      }
      
      const networkRes = await fetch(req);
      if (networkRes && networkRes.ok) {
        const copy = networkRes.clone();
        caches.open(NS_CACHE).then(cache => cache.put(req, copy));
      }
      return networkRes;
    } catch (error) {
      // Om nätverket är nere och resursen inte finns i cachen
      return new Response('', { status: 503, statusText: 'Service Unavailable' });
    }
  })());
});
