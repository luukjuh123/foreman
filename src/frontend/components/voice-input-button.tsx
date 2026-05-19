"use client";

import * as React from "react";
import { Mic, MicOff, Square, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { transcribeAudio, sendVoiceCommand, type VoiceCommandResponse } from "@/lib/voice";

type Mode = "push-to-talk" | "continuous";

interface VoiceState {
  recording: boolean;
  permissionDenied: boolean;
  transcript: string | null;
  command: VoiceCommandResponse | null;
  processing: boolean;
}

export default function VoiceInputButton() {
  const [mode, setMode] = React.useState<Mode>("push-to-talk");
  const [state, setState] = React.useState<VoiceState>({
    recording: false,
    permissionDenied: false,
    transcript: null,
    command: null,
    processing: false,
  });

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stopTracks();
        await processAudio(blob);
      };

      recorder.start();
      setState((s) => ({ ...s, recording: true, permissionDenied: false }));
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setState((s) => ({ ...s, permissionDenied: true, recording: false }));
      }
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setState((s) => ({ ...s, recording: false }));
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function processAudio(blob: Blob) {
    setState((s) => ({ ...s, processing: true }));
    try {
      const { text } = await transcribeAudio(blob);
      const cmd = await sendVoiceCommand(text);
      setState((s) => ({ ...s, transcript: text, command: cmd, processing: false }));
    } catch {
      setState((s) => ({ ...s, processing: false }));
    }
  }

  // Push-to-talk handlers
  function handleMouseDown() {
    if (mode !== "push-to-talk") return;
    startRecording();
  }

  function handleMouseUp() {
    if (mode !== "push-to-talk") return;
    stopRecording();
  }

  // Mobile touch for push-to-talk
  function handleTouchStart(e: React.TouchEvent) {
    if (mode !== "push-to-talk") return;
    e.preventDefault();
    startRecording();
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (mode !== "push-to-talk") return;
    e.preventDefault();
    stopRecording();
  }

  // Continuous mode toggle
  function handleClick() {
    if (mode !== "continuous") return;
    if (state.recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function toggleMode() {
    // Stop any active recording when switching modes
    if (state.recording) stopRecording();
    setMode((m) => (m === "push-to-talk" ? "continuous" : "push-to-talk"));
  }

  const isContinuous = mode === "continuous";
  const isRecording = state.recording;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Mode hint */}
      <p className="text-xs text-muted-foreground select-none">
        {isContinuous
          ? isRecording
            ? "Luisteren..."
            : "Continu luisteren — klik om te stoppen"
          : "Ingedrukt houden om te spreken"}
      </p>

      <div className="flex items-center gap-2">
        {/* Main mic button */}
        <button
          aria-label="Spraak"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-200 select-none touch-none",
            isRecording
              ? "border-red-500 bg-red-50 text-red-600 shadow-lg shadow-red-200"
              : "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {isRecording ? (
            isContinuous ? (
              <Square className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5 animate-pulse" />
            )
          ) : (
            <Mic className="h-5 w-5" />
          )}

          {/* Pulsing ring when recording */}
          {isRecording && (
            <span
              data-testid="recording-indicator"
              className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-75"
            />
          )}
        </button>

        {/* Mode toggle */}
        <button
          data-testid="voice-mode-toggle"
          onClick={toggleMode}
          title={isContinuous ? "Wissel naar ingedrukt houden" : "Wissel naar continu luisteren"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
            isContinuous
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent"
          )}
        >
          {isContinuous ? <Radio className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>
      </div>

      {/* Processing indicator */}
      {state.processing && (
        <p className="text-xs text-muted-foreground animate-pulse">Verwerken...</p>
      )}

      {/* Permission error */}
      {state.permissionDenied && (
        <p
          data-testid="permission-error"
          className="text-xs text-destructive text-center max-w-[200px]"
        >
          Microfoon toegang geweigerd. Sta toegang toe in de browserinstellingen.
        </p>
      )}

      {/* Results */}
      {state.transcript && (
        <div className="w-full max-w-xs rounded-lg border bg-card p-3 text-sm space-y-2">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Tekst
          </p>
          <p data-testid="transcript-text" className="text-foreground">
            {state.transcript}
          </p>

          {state.command && (
            <>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide pt-1">
                Opdracht
              </p>
              <p data-testid="command-intent" className="text-foreground font-medium">
                {state.command.intent}
              </p>
              <p className="text-muted-foreground text-xs">
                Zekerheid: {Math.round(state.command.confidence * 100)}%
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
