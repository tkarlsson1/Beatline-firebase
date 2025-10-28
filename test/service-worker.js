/* service-worker.js (refactor) */
const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `notestream-static-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  OFFLINE_URL,
  '/assets/css/style.css',
  '/assets/js/main.js',
  '/assets/js/menus.js',
  '/assets/js/ui.js',
  '/assets/js/util.js',
  '/assets/js/qr.js',
  '/assets/js/spotify.js',
  '/assets/js/data.js',
  '/assets/js/sw-init.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => { if(k !== STATIC_CACHE) return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass caching for APIs (Firebase/Spotify)
  if (/googleapis\.com|firebaseio\.com|spotify\.com/.test(url.host)) {
    return; // network-only
  }

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        const net = await fetch(event.request);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(event.request, net.clone());
        return net;
      } catch (e) {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(OFFLINE_URL);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Cache-first for static assets
  if (STATIC_ASSETS.some(p => url.pathname === p)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const net = await fetch(event.request);
      cache.put(event.request, net.clone());
      return net;
    })());
  }
});
