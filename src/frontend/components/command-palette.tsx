"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Users,
  Receipt,
  ClipboardList,
  Search,
  ArrowRight,
  Plus,
  Calendar,
  TrendingUp,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string;
  type: "project" | "customer" | "invoice" | "quote" | "action";
  title: string;
  subtitle?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}

const QUICK_ACTIONS: SearchResult[] = [
  {
    id: "new-project",
    type: "action",
    title: "Nieuw project",
    subtitle: "Maak een nieuw bouwproject aan",
    href: "/dashboard/projects/new",
    icon: Plus,
    iconColor: "text-primary bg-primary/10",
  },
  {
    id: "new-quote",
    type: "action",
    title: "Nieuwe offerte",
    subtitle: "Maak een offerte voor een klant",
    href: "/dashboard/quotes/new",
    icon: ClipboardList,
    iconColor: "text-blue-500 bg-blue-500/10",
  },
  {
    id: "new-invoice",
    type: "action",
    title: "Nieuwe factuur",
    subtitle: "Maak een nieuwe factuur aan",
    href: "/dashboard/invoices/new",
    icon: Receipt,
    iconColor: "text-emerald-500 bg-emerald-500/10",
  },
  {
    id: "nav-agenda",
    type: "action",
    title: "Agenda openen",
    subtitle: "Bekijk uw weekplanning",
    href: "/dashboard/agenda",
    icon: Calendar,
    iconColor: "text-cyan-500 bg-cyan-500/10",
  },
  {
    id: "nav-financials",
    type: "action",
    title: "Financieel overzicht",
    subtitle: "Boekhouding en financiele rapporten",
    href: "/dashboard/financials",
    icon: TrendingUp,
    iconColor: "text-amber-500 bg-amber-500/10",
  },
  {
    id: "nav-settings",
    type: "action",
    title: "Instellingen",
    subtitle: "Account en bedrijfsinstellingen",
    href: "/dashboard/settings",
    icon: Settings,
    iconColor: "text-muted-foreground bg-muted",
  },
];

const TYPE_CONFIG: Record<string, { label: string; iconColor: string }> = {
  project: { label: "Project", iconColor: "text-primary bg-primary/10" },
  customer: { label: "Klant", iconColor: "text-violet-500 bg-violet-500/10" },
  invoice: { label: "Factuur", iconColor: "text-emerald-500 bg-emerald-500/10" },
  quote: { label: "Offerte", iconColor: "text-blue-500 bg-blue-500/10" },
  action: { label: "Actie", iconColor: "text-muted-foreground bg-muted" },
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  project: FolderKanban,
  customer: Users,
  invoice: Receipt,
  quote: ClipboardList,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Keyboard shortcut to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const lower = q.toLowerCase();

    try {
      const [projectsRes, customersRes, invoicesRes, quotesRes] = await Promise.all([
        apiFetch<{ data: Array<{ id: string; name: string; status: string; customer_name?: string }> }>(
          "/projects?per_page=50"
        ).catch(() => ({ data: [] })),
        apiFetch<{ data: Array<{ id: string; name: string; email: string | null; kvk_number: string | null }> }>(
          "/customers/?per_page=50"
        ).catch(() => ({ data: [] })),
        apiFetch<{ data: Array<{ id: string; invoice_number: string; customer_name?: string; total_cents: number; status: string }> }>(
          "/invoices/?per_page=50"
        ).catch(() => ({ data: [] })),
        apiFetch<{ data: Array<{ id: string; quote_number: string; customer_name: string; total_cents: number; status: string }> }>(
          "/quotes/?per_page=50"
        ).catch(() => ({ data: [] })),
      ]);

      const matched: SearchResult[] = [];

      // Projects
      for (const p of projectsRes.data ?? []) {
        if (p.name.toLowerCase().includes(lower) || (p.customer_name ?? "").toLowerCase().includes(lower)) {
          matched.push({
            id: `p-${p.id}`,
            type: "project",
            title: p.name,
            subtitle: p.customer_name ?? p.status,
            href: `/dashboard/projects/${p.id}`,
            icon: FolderKanban,
            iconColor: TYPE_CONFIG.project.iconColor,
          });
        }
      }

      // Customers
      for (const c of customersRes.data ?? []) {
        if (
          c.name.toLowerCase().includes(lower) ||
          (c.email ?? "").toLowerCase().includes(lower) ||
          (c.kvk_number ?? "").toLowerCase().includes(lower)
        ) {
          matched.push({
            id: `c-${c.id}`,
            type: "customer",
            title: c.name,
            subtitle: c.email ?? undefined,
            href: `/dashboard/customers/${c.id}`,
            icon: Users,
            iconColor: TYPE_CONFIG.customer.iconColor,
          });
        }
      }

      // Invoices
      for (const inv of invoicesRes.data ?? []) {
        if (
          inv.invoice_number.toLowerCase().includes(lower) ||
          (inv.customer_name ?? "").toLowerCase().includes(lower)
        ) {
          matched.push({
            id: `i-${inv.id}`,
            type: "invoice",
            title: inv.invoice_number,
            subtitle: inv.customer_name ?? inv.status,
            href: `/dashboard/invoices/${inv.id}`,
            icon: Receipt,
            iconColor: TYPE_CONFIG.invoice.iconColor,
          });
        }
      }

      // Quotes
      for (const q of quotesRes.data ?? []) {
        if (
          q.quote_number.toLowerCase().includes(lower) ||
          q.customer_name.toLowerCase().includes(lower)
        ) {
          matched.push({
            id: `q-${q.id}`,
            type: "quote",
            title: q.quote_number,
            subtitle: q.customer_name,
            href: `/dashboard/quotes/${q.id}`,
            icon: ClipboardList,
            iconColor: TYPE_CONFIG.quote.iconColor,
          });
        }
      }

      // Quick actions that match
      for (const action of QUICK_ACTIONS) {
        if (
          action.title.toLowerCase().includes(lower) ||
          (action.subtitle ?? "").toLowerCase().includes(lower)
        ) {
          matched.push(action);
        }
      }

      setResults(matched.slice(0, 12));
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Navigate
  function navigate(result: SearchResult) {
    setOpen(false);
    router.push(result.href);
  }

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    const items = query.trim() ? results : QUICK_ACTIONS;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[selectedIndex]) {
        navigate(items[selectedIndex]);
      }
    }
  }

  const displayItems = query.trim() ? results : QUICK_ACTIONS;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/20 overflow-hidden animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border/60 px-4">
          <Search className="h-5 w-5 text-muted-foreground/50 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Zoek projecten, klanten, facturen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent py-4 text-sm font-medium placeholder:text-muted-foreground/40 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/60">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto p-2">
          {loading && query.trim() && (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">
                Geen resultaten voor &ldquo;{query}&rdquo;
              </p>
            </div>
          )}

          {!loading && !query.trim() && (
            <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
              Snelle acties
            </p>
          )}

          {!loading && query.trim() && results.length > 0 && (
            <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
              {results.length} {results.length === 1 ? "resultaat" : "resultaten"}
            </p>
          )}

          {!loading &&
            displayItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    isSelected
                      ? "bg-primary/8 text-foreground"
                      : "text-foreground/80 hover:bg-muted/50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
                      item.iconColor
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                  {item.type !== "action" && (
                    <span className="shrink-0 rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
                      {TYPE_CONFIG[item.type]?.label}
                    </span>
                  )}
                  {isSelected && (
                    <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </button>
              );
            })}
        </div>

        {/* Footer */}
        <div className="border-t border-border/40 px-4 py-2.5 flex items-center justify-between text-[10px] text-muted-foreground/40">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted/50 px-1 py-0.5 font-mono text-[9px]">&uarr;</kbd>
              <kbd className="rounded border bg-muted/50 px-1 py-0.5 font-mono text-[9px]">&darr;</kbd>
              navigeren
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted/50 px-1 py-0.5 font-mono text-[9px]">&crarr;</kbd>
              openen
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[9px]">&#8984;K</kbd>
            zoeken
          </span>
        </div>
      </div>
    </div>
  );
}
