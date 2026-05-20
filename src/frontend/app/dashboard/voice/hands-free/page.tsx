"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = "idle" | "listening" | "processing" | "speaking";

interface TranscribeResult {
  text: string;
  language: string;
}

interface CommandResult {
  intent: string;
  slots: Record<string, unknown>;
  confidence: number;
  source: string;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Voice API helpers (raw fetch — FormData for audio upload)
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("foreman_access_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function transcribeAudio(blob: Blob): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("file", blob, "recording.webm");
  const res = await fetch(`${API_BASE}/voice/transcribe`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
  return res.json() as Promise<TranscribeResult>;
}

async function parseCommand(text: string): Promise<CommandResult> {
  const res = await fetch(`${API_BASE}/voice/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Command failed: ${res.status}`);
  return res.json() as Promise<CommandResult>;
}

async function speakText(text: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_BASE}/voice/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Speak failed: ${res.status}`);
  return res.arrayBuffer();
}

async function playAudioBuffer(buffer: ArrayBuffer): Promise<void> {
  if (typeof window === "undefined") return;
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buffer);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  source.connect(ctx.destination);
  return new Promise((resolve) => {
    source.onended = () => resolve();
    source.start();
  });
}

// ---------------------------------------------------------------------------
// Wake Lock helper
// ---------------------------------------------------------------------------

async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (typeof navigator !== "undefined" && navigator.wakeLock) {
      return await navigator.wakeLock.request("screen");
    }
  } catch {
    // Wake Lock API unavailable or permission denied — silently ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HandsFreeMode() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("idle");
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastResponseRef = useRef("");

  // Keep ref in sync with state for use inside callbacks
  useEffect(() => {
    lastResponseRef.current = lastResponse;
  }, [lastResponse]);

  // Request wake lock on mount
  useEffect(() => {
    let mounted = true;
    requestWakeLock().then((sentinel) => {
      if (mounted) wakeLockRef.current = sentinel;
    });
    return () => {
      mounted = false;
      wakeLockRef.current?.release();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Stop current recording (if any) and clean up stream
  // ---------------------------------------------------------------------------
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Full voice pipeline: record → transcribe → command → speak
  // ---------------------------------------------------------------------------
  const startRecording = useCallback(async () => {
    setError("");
    setMode("listening");
    setTranscript("");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microfoon niet toegankelijk");
      setMode("idle");
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e: { data: Blob }) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });

      setMode("processing");
      setTranscript("Verwerken...");

      try {
        const { text } = await transcribeAudio(blob);
        setTranscript(text);

        const cmd = await parseCommand(text);
        const commandLabel = `${cmd.intent} (${Math.round(cmd.confidence * 100)}%)`;
        setLastCommand(commandLabel);

        // Speak the reasoning as the AI response
        const responseText = cmd.reasoning ?? "Opdracht verwerkt";
        setLastResponse(responseText);

        setMode("speaking");
        try {
          const audioBuffer = await speakText(responseText);
          await playAudioBuffer(audioBuffer);
        } catch {
          // TTS failure is non-fatal
        }

        // Auto-restart continuous listening
        setMode("idle");
        setTranscript("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fout bij verwerking");
        setMode("idle");
        setTranscript("");
      }
    };

    recorder.start();
  }, []);

  const handleMicClick = useCallback(() => {
    if (mode === "listening") {
      stopRecording();
    } else if (mode === "idle") {
      startRecording();
    }
  }, [mode, startRecording, stopRecording]);

  const handleStop = useCallback(() => {
    stopRecording();
    setMode("idle");
    setTranscript("");
  }, [stopRecording]);

  const handleRepeat = useCallback(async () => {
    const text = lastResponseRef.current;
    if (!text) return;
    setMode("speaking");
    try {
      const audioBuffer = await speakText(text);
      await playAudioBuffer(audioBuffer);
    } catch {
      // non-fatal
    }
    setMode("idle");
  }, []);

  const handleBack = useCallback(() => {
    stopRecording();
    router.push("/dashboard");
  }, [router, stopRecording]);

  // ---------------------------------------------------------------------------
  // Derived UI state
  // ---------------------------------------------------------------------------
  const isListening = mode === "listening";
  const isProcessing = mode === "processing";
  const isSpeaking = mode === "speaking";

  const micLabel =
    isListening ? "Stop opname" : isProcessing ? "Verwerken..." : "Tik om te spreken";

  const statusText =
    isProcessing
      ? "Verwerken..."
      : isSpeaking
        ? "Antwoord..."
        : "Luisteren...";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className={cn(
        "fixed inset-0 flex flex-col bg-gray-950 text-white select-none overflow-hidden"
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-safe-top py-4">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Handsfree Modus
        </h1>
        <span className="flex items-center gap-1.5 text-sm font-medium text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          {statusText}
        </span>
      </header>

      {/* Central mic area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {/* Transcript / response display */}
        <div className="w-full max-w-md text-center space-y-2 min-h-[5rem]">
          {transcript && !isProcessing && (
            <p className="text-lg text-gray-200 leading-relaxed">{transcript}</p>
          )}
          {isProcessing && (
            <p className="text-lg text-yellow-300 animate-pulse">Verwerken...</p>
          )}
          {lastResponse && !isListening && !isProcessing && (
            <p className="text-base text-blue-300 leading-relaxed">{lastResponse}</p>
          )}
          {lastCommand && !isListening && !isProcessing && (
            <p className="text-xs text-gray-500 uppercase tracking-wider">{lastCommand}</p>
          )}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Big mic button */}
        <button
          aria-label={micLabel}
          onClick={handleMicClick}
          disabled={isProcessing || isSpeaking}
          className={cn(
            "relative flex items-center justify-center rounded-full transition-all duration-200",
            "w-48 h-48 md:w-56 md:h-56",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30",
            isListening
              ? "bg-green-600 shadow-[0_0_60px_rgba(34,197,94,0.5)] scale-110"
              : isProcessing
                ? "bg-yellow-600 cursor-not-allowed"
                : isSpeaking
                  ? "bg-blue-600 cursor-not-allowed"
                  : "bg-gray-700 hover:bg-gray-600 active:scale-95"
          )}
        >
          {/* Pulse ring when listening */}
          {isListening && (
            <span className="absolute inset-0 rounded-full bg-green-500 opacity-30 animate-ping" />
          )}
          {isProcessing ? (
            <Loader2 className="w-20 h-20 text-white animate-spin" />
          ) : isSpeaking ? (
            <Volume2 className="w-20 h-20 text-white" />
          ) : isListening ? (
            <MicOff className="w-20 h-20 text-white" />
          ) : (
            <Mic className="w-20 h-20 text-white" />
          )}
        </button>

        {/* Label below mic */}
        <p className="text-sm text-gray-400 font-medium tracking-wide">
          {isListening
            ? "Luisteren..."
            : isProcessing
              ? "Verwerken..."
              : isSpeaking
                ? "Spreken..."
                : "Tik om te spreken"}
        </p>
      </div>

      {/* Quick action buttons */}
      <footer className="flex items-center justify-center gap-4 px-4 pb-safe-bottom py-6">
        <button
          aria-label="Stop"
          onClick={handleStop}
          className={cn(
            "flex flex-col items-center gap-1.5 px-6 py-3 rounded-2xl",
            "bg-gray-800 hover:bg-gray-700 active:bg-gray-900 transition-colors",
            "text-sm font-semibold text-white min-w-[80px]"
          )}
        >
          <Square className="w-5 h-5" />
          Stop
        </button>

        <button
          aria-label="Herhaal"
          onClick={handleRepeat}
          disabled={!lastResponse}
          className={cn(
            "flex flex-col items-center gap-1.5 px-6 py-3 rounded-2xl",
            "bg-gray-800 hover:bg-gray-700 active:bg-gray-900 transition-colors",
            "text-sm font-semibold text-white min-w-[80px]",
            !lastResponse && "opacity-40 cursor-not-allowed"
          )}
        >
          <RotateCcw className="w-5 h-5" />
          Herhaal
        </button>

        <button
          aria-label="Terug"
          onClick={handleBack}
          className={cn(
            "flex flex-col items-center gap-1.5 px-6 py-3 rounded-2xl",
            "bg-gray-800 hover:bg-gray-700 active:bg-gray-900 transition-colors",
            "text-sm font-semibold text-white min-w-[80px]"
          )}
        >
          <ArrowLeft className="w-5 h-5" />
          Terug
        </button>
      </footer>
    </div>
  );
}
