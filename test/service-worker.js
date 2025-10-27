// Enkel app shell-cache för / (test)
const NS_CACHE = "ns-test-v1";
const NS_ASSETS = [
  "/", "/index.html",
  "/styles.css", "/script.js", "/sessions.js",
  "/offline.html"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(NS_CACHE).then(c=>c.addAll(NS_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==NS_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  e.respondWith((async ()=>{
    try {
      const net = await fetch(req);
      return net;
    } catch {
      const cache = await caches.match(req);
      return cache || caches.match("/offline.html");
    }
  })());
});
