// service-worker.js

// Vid "install" behöver vi inte cacha något – vi hoppar direkt över vänteläget.
self.addEventListener("install", event => {
  console.log("Service Worker installed");
  self.skipWaiting();
});

// Vid "activate" säkerställer vi att vi kontrollerar våra klienter direkt.
self.addEventListener("activate", event => {
  console.log("Service Worker activated");
  event.waitUntil(clients.claim());
});

// Vid varje "fetch" anrop, hämtar vi alltid direkt från nätverket.
// Ingen cache används alls, ingen fallback.
self.addEventListener("fetch", event => {
  event.respondWith(fetch(event.request));
});


// --- NOTESTREAM app-shell cache (added v0.509) ---
const NS_CACHE = 'ns-appshell-v0-509';
const NS_ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(NS_CACHE).then(cache => cache.addAll(NS_ASSETS)));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        const copy = res.clone();
        caches.open(NS_CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});


self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate'){
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );
  }
});
