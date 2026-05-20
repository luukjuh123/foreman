"use client";

/**
 * PushPermission — prompts the user to enable Web Push notifications.
 * Renders a banner that can be dismissed. Handles the denied state gracefully.
 */

import { useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { subscribeToPush } from "@/lib/push";

interface Props {
  /** JWT access token for the authenticated user. */
  token: string;
}

type State = "idle" | "loading" | "granted" | "denied";

export function PushPermission({ token }: Props) {
  const [state, setState] = useState<State>("idle");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || state === "granted") return null;
  if (typeof window === "undefined") return null;
  if (!("PushManager" in window)) return null;

  async function handleEnable() {
    setState("loading");
    try {
      const ok = await subscribeToPush(token);
      setState(ok ? "granted" : "denied");
    } catch {
      setState("denied");
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {state === "denied" ? (
        <BellOff className="h-4 w-4 shrink-0 text-blue-400" />
      ) : (
        <Bell className="h-4 w-4 shrink-0 text-blue-500" />
      )}

      <span className="flex-1">
        {state === "denied"
          ? "Pushmeldingen zijn geblokkeerd. Pas de browserinstellingen aan om ze in te schakelen."
          : "Schakel pushmeldingen in om op de hoogte te blijven van projectupdates."}
      </span>

      {state !== "denied" && (
        <button
          onClick={handleEnable}
          disabled={state === "loading"}
          className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {state === "loading" ? "Bezig…" : "Inschakelen"}
        </button>
      )}

      <button
        onClick={() => setDismissed(true)}
        aria-label="Sluiten"
        className="ml-1 text-blue-400 hover:text-blue-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
