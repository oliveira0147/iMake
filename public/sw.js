const CACHE_NAME = "imake-pwa-v2";
const ASSETS = ["/", "/index.html", "/app.css", "/app.js", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isNav = req.mode === "navigate";

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      if (isNav) {
        try {
          const res = await fetch(req);
          return res;
        } catch {
          const cached = await cache.match("/index.html");
          if (cached) return cached;
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      }

      const cached = await cache.match(req);
      if (cached) return cached;

      const res = await fetch(req);
      if (res.ok) {
        await cache.put(req, res.clone());
      }
      return res;
    })()
  );
});
