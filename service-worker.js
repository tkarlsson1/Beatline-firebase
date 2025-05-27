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
