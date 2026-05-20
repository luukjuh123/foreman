const CACHE_NAME = "foreman-v1";
const SHELL_URLS = ["/dashboard"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.url.includes("/api/")) {
    // Network-first for API
    e.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  } else if (request.mode === "navigate") {
    // Network-first for navigation, fallback to cache
    e.respondWith(
      fetch(request).catch(() => caches.match("/dashboard"))
    );
  }
});
