// NOTESTREAM – Service Worker v1.1
const NS_CACHE = "ns-v1"; // Uppdatera vid releaser
const NS_ASSETS = [
  "./",
  "./index.html",
  "./lobby.html",
  "./game.html",
  "./join.html",
  "./offline.html",
  "./styles.css",
  "./script.js",
  "./sessions.js"
];

// Install: cachea app shell, men hantera fel
self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(NS_CACHE);
        await cache.addAll(NS_ASSETS);
      } catch (err) {
        // Om någon fil saknas eller nätverk felar, logga men fortsätt
        console.warn("SW: cache.addAll misslyckades", err);
      }
    })()
  );
  self.skipWaiting();
});

// Activate: rensa gamla cache-versioner
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== NS_CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// Fetch: nätverk först för begäran, fallback till cache, och specialfall för navigation
self.addEventListener("fetch", (e) => {
  const req = e.request;

  // För navigation-begäran (HTML) försök nätverk först, fallback till index/offline
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(req);
          return networkResponse;
        } catch (err) {
          const cacheRes = await caches.match("./index.html") || await caches.match("./offline.html");
          return cacheRes || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // För andra resurser: nätverk, annars cache, annars offline fallback
  e.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(req);
        return networkResponse;
      } catch (err) {
        const cacheResponse = await caches.match(req);
        if (cacheResponse) return cacheResponse;
        const offlineRes = await caches.match("./offline.html");
        return offlineRes || new Response("Offline", { status: 503 });
      }
    })()
  );
});
