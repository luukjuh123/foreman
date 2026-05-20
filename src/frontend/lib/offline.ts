const QUEUE_KEY = "foreman_offline_queue";

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: string | null;
  timestamp: number;
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function onOnlineStatusChange(
  callback: (online: boolean) => void
): () => void {
  const onOnline = () => callback(true);
  const onOffline = () => callback(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

export function queueOfflineRequest(
  url: string,
  method: string,
  body: string | null
): void {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    url,
    method,
    body,
    timestamp: Date.now(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue(): QueuedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export async function flushOfflineQueue(): Promise<void> {
  const queue = getQueue();
  if (queue.length === 0) return;

  const token = localStorage.getItem("foreman_access_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const remaining: QueuedRequest[] = [];
  for (const req of queue) {
    try {
      await fetch(req.url, { method: req.method, headers, body: req.body });
    } catch {
      remaining.push(req);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}
