import { apiFetch } from "@/lib/api";

export interface VoiceCommandResponse {
  intent: string;
  slots: Record<string, unknown>;
  confidence: number;
  source?: string;
  reasoning: string;
}

export async function transcribeAudio(
  blob: Blob
): Promise<{ text: string; language: string | null }> {
  const form = new FormData();
  form.append("file", blob, "audio.webm");

  return apiFetch<{ text: string; language: string | null }>("/voice/transcribe", {
    method: "POST",
    body: form,
  });
}

export async function sendVoiceCommand(
  text: string
): Promise<VoiceCommandResponse> {
  return apiFetch<VoiceCommandResponse>("/voice/command", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export const sendCommand = sendVoiceCommand;

export async function chatWithAI(
  messages: Array<{ role: string; content: string }>
): Promise<{ text: string; reasoning: string }> {
  return apiFetch<{ text: string; reasoning: string }>("/voice/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

export async function speakText(text: string, voice?: string): Promise<Blob> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  const token =
    typeof window !== "undefined" ? localStorage.getItem("foreman_access_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice/speak`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, ...(voice ? { voice } : {}) }),
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }

  return res.blob();
}
