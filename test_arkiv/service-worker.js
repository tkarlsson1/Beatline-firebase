// NOTESTREAM – Service Worker v1.1
const NS_CACHE = "ns-v1";
const NS_ASSETS = [
  "./",
  "./index.html",
  "./lobby.html",
  "./game.html",
  "./join.html",
  "./offline.html"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async() => {
    try {
      const cache = await caches.open(NS_CACHE);
      await cache.addAll(NS_ASSETS);
    } catch (err) {
      console.warn("SW: cache.addAll misslyckades", err);
    }
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async() => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== NS_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.mode === "navigate") {
    e.respondWith((async() => {
      try { return await fetch(req); }
      catch (err) { return (await caches.match("./index.html")) || (await caches.match("./offline.html")) || new Response("Offline",{status:503}); }
    })());
    return;
  }
  e.respondWith((async() => {
    try { return await fetch(req); }
    catch (err) { const cached = await caches.match(req); if (cached) return cached; return (await caches.match("./offline.html")) || new Response("Offline",{status:503}); }
  })());
});
