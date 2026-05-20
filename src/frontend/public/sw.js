/**
 * Foreman service worker — offline caching + Web Push event handling.
 */

const CACHE_NAME = "foreman-v1";
const PRECACHE_URLS = ["/", "/dashboard"];

// ---------------------------------------------------------------------------
// Install — precache shell
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — clean up old caches
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch — network-first with cache fallback
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
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
    icon: "/icon-192.png",
    badge: "/icon-96.png",
    tag: type || "foreman-notification",
    data: extraData || {},
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title || "Foreman", options));
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
      })
  );
});
