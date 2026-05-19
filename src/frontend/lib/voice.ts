import { apiFetch } from "@/lib/api";

export interface TranscribeResponse {
  text: string;
  language: string;
}

export interface VoiceCommandResponse {
  intent: string;
  slots: Record<string, unknown>;
  confidence: number;
  source: string;
  reasoning: string;
}

/**
 * Send an audio blob to /voice/transcribe.
 * Do NOT set Content-Type — let the browser set the multipart boundary.
 */
export async function transcribeAudio(blob: Blob): Promise<TranscribeResponse> {
  const form = new FormData();
  form.append("file", blob, "recording.webm");

  return apiFetch<TranscribeResponse>("/voice/transcribe", {
    method: "POST",
    body: form,
    // Override the default Content-Type so apiFetch doesn't set application/json
    headers: {} as Record<string, string>,
  });
}

/**
 * Send transcribed text to /voice/command.
 */
export async function sendVoiceCommand(text: string): Promise<VoiceCommandResponse> {
  return apiFetch<VoiceCommandResponse>("/voice/command", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
