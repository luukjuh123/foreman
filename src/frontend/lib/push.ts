/**
 * Web Push / VAPID helpers for the foreman PWA.
 *
 * Usage:
 *   const token = getAccessToken();
 *   await subscribeToPush(token);
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Convert a URL-safe base64 string to a Uint8Array (for applicationServerKey). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** Fetch the VAPID public key from the backend (no auth required). */
export async function fetchVapidKey(): Promise<string> {
  const res = await fetch(`${API_BASE}/push/vapid-key`);
  if (!res.ok) throw new Error("Failed to fetch VAPID key");
  const data = await res.json();
  return data.public_key as string;
}

/**
 * Request push permission, get a PushSubscription, and register it with the backend.
 * Returns false if the user denied permission or the browser does not support push.
 */
export async function subscribeToPush(token: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const publicKey = await fetchVapidKey();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = subscription.toJSON();
  const keys = json.keys as { p256dh: string; auth: string };

  const res = await fetch(`${API_BASE}/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    }),
  });

  return res.ok;
}

/**
 * Unsubscribe from push: removes from the browser PushManager and tells the backend.
 */
export async function unsubscribeFromPush(token: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  await fetch(`${API_BASE}/push/unsubscribe`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ endpoint }),
  });
}
