"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  X,
  FolderKanban,
  ClipboardList,
  Receipt,
  Users,
  FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FAB_ACTIONS = [
  {
    label: "Project",
    href: "/dashboard/projects/new",
    icon: FolderKanban,
    color: "bg-primary text-primary-foreground",
    shadow: "shadow-primary/30",
  },
  {
    label: "Offerte",
    href: "/dashboard/quotes/new",
    icon: ClipboardList,
    color: "bg-blue-500 text-white",
    shadow: "shadow-blue-500/30",
  },
  {
    label: "Factuur",
    href: "/dashboard/invoices/new",
    icon: Receipt,
    color: "bg-emerald-500 text-white",
    shadow: "shadow-emerald-500/30",
  },
  {
    label: "Klant",
    href: "/dashboard/customers/new",
    icon: Users,
    color: "bg-violet-500 text-white",
    shadow: "shadow-violet-500/30",
  },
];

export default function MobileFab() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-4 z-50 md:hidden">
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Action items — fan out above the FAB */}
      <div
        className={cn(
          "absolute bottom-16 right-0 z-50 flex flex-col-reverse items-end gap-2.5 transition-all duration-200",
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        {FAB_ACTIONS.map((action, idx) => (
          <Link
            key={action.href}
            href={action.href}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 animate-scale-in"
            style={{ animationDelay: `${idx * 40}ms` }}
          >
            <span className="rounded-lg bg-card border border-border/50 px-3 py-1.5 text-xs font-bold shadow-lg whitespace-nowrap">
              {action.label}
            </span>
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110",
                action.color,
                action.shadow
              )}
            >
              <action.icon className="h-5 w-5" />
            </div>
          </Link>
        ))}
      </div>

      {/* Main FAB button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-200",
          open
            ? "bg-card border border-border/50 rotate-45"
            : "bg-gradient-to-br from-primary to-amber-600 shadow-primary/30"
        )}
        aria-label={open ? "Sluiten" : "Snel aanmaken"}
      >
        {open ? (
          <X className="h-6 w-6 text-foreground -rotate-45" />
        ) : (
          <Plus className="h-6 w-6 text-primary-foreground" />
        )}
        {/* Pulse ring when closed */}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-30" />
        )}
      </button>
    </div>
  );
}
