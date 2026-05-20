"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { isOnline, onOnlineStatusChange, flushOfflineQueue } from "@/lib/offline";

export default function OfflineIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(isOnline());
    const cleanup = onOnlineStatusChange((status) => {
      setOnline(status);
      if (status) flushOfflineQueue();
    });
    return cleanup;
  }, []);

  if (online) return null;

  return (
    <div
      className="flex items-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-sm text-amber-600 dark:text-amber-400"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Je bent offline — wijzigingen worden opgeslagen</span>
    </div>
  );
}
