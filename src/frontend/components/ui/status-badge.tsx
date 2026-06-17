import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Token map — translucent bg + colored text for dark theme
// ---------------------------------------------------------------------------

export type StatusKey =
  // Project statuses
  | "draft"
  | "active"
  | "completed"
  | "archived"
  // Task statuses
  | "todo"
  | "in_progress"
  | "done"
  | "blocked"
  // Invoice statuses
  | "sent"
  | "paid"
  | "overdue"
  // Document categories
  | "contract"
  | "permit"
  | "drawing"
  | "photo"
  | "other";

export const STATUS_CLASSES: Record<StatusKey, string> = {
  // Projects
  draft: "bg-zinc-500/15 text-zinc-400",
  active: "bg-blue-500/15 text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  archived: "bg-yellow-500/15 text-yellow-400",
  // Tasks
  todo: "bg-zinc-500/15 text-zinc-400",
  in_progress: "bg-blue-500/15 text-blue-400",
  done: "bg-emerald-500/15 text-emerald-400",
  blocked: "bg-red-500/15 text-red-400",
  // Invoices
  sent: "bg-violet-500/15 text-violet-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  overdue: "bg-red-500/15 text-red-400",
  // Document categories
  contract: "bg-amber-500/15 text-amber-400",
  permit: "bg-cyan-500/15 text-cyan-400",
  drawing: "bg-indigo-500/15 text-indigo-400",
  photo: "bg-pink-500/15 text-pink-400",
  other: "bg-zinc-500/15 text-zinc-400",
};

export const STATUS_LABELS: Record<StatusKey, string> = {
  draft: "Concept",
  active: "Actief",
  completed: "Voltooid",
  archived: "Gearchiveerd",
  todo: "Te doen",
  in_progress: "Bezig",
  done: "Klaar",
  blocked: "Geblokkeerd",
  sent: "Verzonden",
  paid: "Betaald",
  overdue: "Achterstallig",
  contract: "Contract",
  permit: "Vergunning",
  drawing: "Tekening",
  photo: "Foto",
  other: "Overig",
};

export interface StatusBadgeProps {
  status: string;
  className?: string;
  /** Override the display label */
  label?: string;
}

export function StatusBadge({ status, className, label }: StatusBadgeProps) {
  const key = status as StatusKey;
  const colorClass = STATUS_CLASSES[key] ?? "bg-zinc-500/15 text-zinc-400";
  const displayLabel = label ?? STATUS_LABELS[key] ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {displayLabel}
    </span>
  );
}
