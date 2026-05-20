"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  ChevronDown,
  Bot,
  User,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { chatWithAI, speakText } from "@/lib/voice";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
  reasoning?: string;
}

function ReasoningToggle({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        aria-label="Redenering tonen"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        />
        Redenering
      </button>
      {open && (
        <p className="mt-1 rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground leading-relaxed">
          {reasoning}
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="voice-empty-state"
      className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center"
    >
      <div className="rounded-full bg-primary/10 p-5">
        <MessageSquare className="h-10 w-10 text-primary opacity-70" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Spraakassistent</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Stel vragen, maak taken aan of zoek projectinformatie op via tekst of spraak.
        </p>
      </div>
    </div>
  );
}

export default function VoicePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [recording, setRecording] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMsg: ChatMessage = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.content,
        }));

        const res = await chatWithAI(history);
        const aiMsg: ChatMessage = {
          role: "ai",
          content: res.text,
          reasoning: res.reasoning,
        };
        setMessages((prev) => [...prev, aiMsg]);

        if (ttsEnabled && res.text) {
          try {
            const audioBlob = await speakText(res.text);
            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            audio.play().catch(() => {});
            audio.addEventListener("ended", () => URL.revokeObjectURL(url));
          } catch {
            // TTS failure is non-fatal
          }
        }
      } catch (err) {
        const errMsg: ChatMessage = {
          role: "ai",
          content: `Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`,
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [messages, ttsEnabled]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  async function toggleRecording() {
    if (recording) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      setRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });

          try {
            const { transcribeAudio } = await import("@/lib/voice");
            const { text } = await transcribeAudio(blob);
            if (text) {
              sendMessage(text);
            }
          } catch {
            // Transcription failure — swallow silently
          }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setRecording(true);
      } catch {
        // Microphone access denied — ignore
      }
    }
  }

  const userMessages = messages.filter((m) => m.role === "user");
  const aiMessages = messages.filter((m) => m.role === "ai");

  // Index counters per role for data-testid
  const userIndexMap = new Map<number, number>();
  const aiIndexMap = new Map<number, number>();
  let ui = 0;
  let ai = 0;
  messages.forEach((m, idx) => {
    if (m.role === "user") {
      userIndexMap.set(idx, ui++);
    } else {
      aiIndexMap.set(idx, ai++);
    }
  });

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Spraakassistent</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI-gestuurde assistent voor uw bouwprojecten
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={ttsEnabled ? "Geluid uitschakelen" : "Geluid inschakelen"}
          onClick={() => setTtsEnabled((v) => !v)}
          className={cn(ttsEnabled && "text-primary")}
        >
          {ttsEnabled ? (
            <Volume2 className="h-5 w-5" />
          ) : (
            <VolumeX className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto rounded-lg border bg-card p-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            const testIdx = isUser ? userIndexMap.get(idx)! : aiIndexMap.get(idx)!;
            const testId = isUser ? `message-user-${testIdx}` : `message-ai-${testIdx}`;

            return (
              <div
                key={idx}
                className={cn(
                  "flex gap-2",
                  isUser ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isUser ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  data-testid={testId}
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    isUser
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm bg-muted text-foreground"
                  )}
                >
                  {msg.content}
                  {!isUser && msg.reasoning && (
                    <ReasoningToggle reasoning={msg.reasoning} />
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="mt-4 flex items-center gap-2"
      >
        <Button
          type="button"
          variant={recording ? "destructive" : "outline"}
          size="icon"
          aria-label={recording ? "Opname stoppen" : "Microfoon starten"}
          onClick={toggleRecording}
        >
          {recording ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Typ een bericht..."
          disabled={loading || recording}
          className="flex-1"
          aria-label="Berichtinvoer"
        />

        <Button
          type="submit"
          aria-label="Verstuur bericht"
          disabled={loading || !input.trim()}
        >
          <Send className="h-4 w-4 mr-1.5" />
          Verstuur
        </Button>
      </form>
    </div>
  );
}
