"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!installPrompt || dismissed) return null;

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") {
      setInstallPrompt(null);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-primary/10 px-4 py-2 text-sm md:hidden">
      <span className="text-foreground">Installeer Foreman als app</span>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleInstall}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Installeren
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Sluiten"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
