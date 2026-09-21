/* Only cache the public local planner and versioned assets. Never cache API or authenticated pages. */
const CACHE_NAME = "foreman-planner-v2";
const PLANNER_ROUTES = [
  "/dashboard",
  "/jobs",
  "/crew",
  "/materials",
  "/safety",
  "/settings",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([
        "/offline.html",
        "/manifest.json",
        "/icons/icon-192x192.png",
        "/icons/icon-512x512.png",
      ]);
      // Cache route documents and their assets, including on the first visit before control is claimed.
      await Promise.all(
        PLANNER_ROUTES.map(async (route) => {
          try {
            const response = await fetch(route);
            if (!response.ok) return;
            const html = await response.clone().text();
            await cache.put(route, response);
            const assets = [
              ...new Set(
                Array.from(
                  html.matchAll(/(?:src|href)="([^" ]+)"/g),
                  (match) => match[1],
                ).filter((url) => url.startsWith("/_next/static/")),
              ),
            ];
            await Promise.allSettled(
              assets.map((url) => cache.add(url.replaceAll("&amp;", "&"))),
            );
          } catch {
            /* A later visit will cache routes that were temporarily unavailable. */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("foreman-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const document =
    request.mode === "navigate" && PLANNER_ROUTES.includes(url.pathname);
  const asset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/");
  if (!document && !asset) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const key = document ? url.pathname : request;
      const cached = await cache.match(key);
      if (asset && cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && !response.redirected)
          await cache.put(key, response.clone());
        if (!response.ok && cached) return cached;
        return response;
      } catch {
        return (
          cached ||
          (document ? await cache.match("/offline.html") : null) ||
          new Response("Offline", { status: 503 })
        );
      }
    })(),
  );
});

// ---------------------------------------------------------------------------
// Push — show notification from payload
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = { title: "Foreman", body: "", type: "", data: {} };
  try {
    data = event.data ? event.data.json() : data;
  } catch {
    data.body = event.data ? event.data.text() : "";
  }

  const { title, body, type, data: extraData } = data;

  const options = {
    body: body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: type || "foreman-notification",
    data: extraData || {},
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title || "Foreman", options),
  );
});

// ---------------------------------------------------------------------------
// Notification click — navigate to relevant page
// ---------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const extraData = event.notification.data || {};
  let url = "/dashboard";

  if (extraData.project_id) {
    url = `/dashboard/projects/${extraData.project_id}`;
  } else if (extraData.invoice_id) {
    url = `/dashboard/invoices/${extraData.invoice_id}`;
  } else if (extraData.report_id) {
    url = `/dashboard/reports/${extraData.report_id}`;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
