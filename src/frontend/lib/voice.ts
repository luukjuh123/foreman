const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const ACCESS_TOKEN_KEY = "foreman_access_token";

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function transcribeAudio(
  blob: Blob
): Promise<{ text: string; language: string | null }> {
  const form = new FormData();
  form.append("file", blob, "audio.webm");

  const res = await fetch(`${API_BASE}/voice/transcribe`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `API error ${res.status}`);
  }

  return res.json() as Promise<{ text: string; language: string | null }>;
}

export async function sendCommand(
  text: string
): Promise<{ intent: string; slots: Record<string, unknown>; confidence: number; reasoning: string }> {
  const res = await fetch(`${API_BASE}/voice/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `API error ${res.status}`);
  }

  return res.json() as Promise<{
    intent: string;
    slots: Record<string, unknown>;
    confidence: number;
    reasoning: string;
  }>;
}

export async function chatWithAI(
  messages: Array<{ role: string; content: string }>
): Promise<{ text: string; reasoning: string }> {
  const res = await fetch(`${API_BASE}/voice/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `API error ${res.status}`);
  }

  return res.json() as Promise<{ text: string; reasoning: string }>;
}

export async function speakText(text: string, voice?: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/voice/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text, ...(voice ? { voice } : {}) }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `API error ${res.status}`);
  }

  return res.blob();
}
