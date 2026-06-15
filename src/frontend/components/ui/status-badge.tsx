import React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared status badge for projects, invoices, tasks, and quotes.
// Single source of truth for status styling across the app.
// ---------------------------------------------------------------------------

interface StatusStyle {
  bg: string;
  text: string;
  dot: string;
  label: string;
}

const PROJECT_STATUS: Record<string, StatusStyle> = {
  draft: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-gray-400", label: "Concept" },
  active: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", label: "Actief" },
  completed: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500", label: "Voltooid" },
  archived: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label: "Gearchiveerd" },
};

const INVOICE_STATUS: Record<string, StatusStyle> = {
  draft: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-gray-400", label: "Concept" },
  sent: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500", label: "Verzonden" },
  paid: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", dot: "bg-emerald-500", label: "Betaald" },
  overdue: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", dot: "bg-red-500", label: "Verlopen" },
};

const TASK_STATUS: Record<string, StatusStyle> = {
  todo: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-gray-400", label: "Te doen" },
  in_progress: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500", label: "Bezig" },
  done: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", dot: "bg-emerald-500", label: "Klaar" },
  blocked: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", dot: "bg-red-500", label: "Geblokkeerd" },
};

const QUOTE_STATUS: Record<string, StatusStyle> = {
  draft: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-gray-400", label: "Concept" },
  sent: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500", label: "Verzonden" },
  accepted: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", dot: "bg-emerald-500", label: "Geaccepteerd" },
  rejected: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", dot: "bg-red-500", label: "Afgewezen" },
  expired: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label: "Verlopen" },
};

const STATUS_MAPS = {
  project: PROJECT_STATUS,
  invoice: INVOICE_STATUS,
  task: TASK_STATUS,
  quote: QUOTE_STATUS,
} as const;

type StatusDomain = keyof typeof STATUS_MAPS;

const FALLBACK: StatusStyle = {
  bg: "bg-muted",
  text: "text-muted-foreground",
  dot: "bg-gray-400",
  label: "",
};

interface StatusBadgeProps {
  status: string;
  domain: StatusDomain;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({ status, domain, className, showDot = true }: StatusBadgeProps) {
  const map = STATUS_MAPS[domain];
  const style = map[status] ?? FALLBACK;
  const label = style.label || status;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        style.bg,
        style.text,
        className,
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />}
      {label}
    </span>
  );
}

export function getStatusLabel(status: string, domain: StatusDomain): string {
  return STATUS_MAPS[domain][status]?.label ?? status;
}

export function getStatusStyle(status: string, domain: StatusDomain): StatusStyle {
  return STATUS_MAPS[domain][status] ?? FALLBACK;
}
