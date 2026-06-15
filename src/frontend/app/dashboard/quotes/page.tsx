"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ClipboardList,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuoteResponse {
  id: string;
  quote_number: string;
  customer_name: string;
  project_name: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  issue_date: string;
  valid_until: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
}

interface QuoteListResponse {
  data: QuoteResponse[];
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; dot: string; bg: string; text: string }
> = {
  draft: { label: "Concept", icon: Clock, dot: "bg-gray-400", bg: "bg-gray-500/10", text: "text-gray-500" },
  sent: { label: "Verzonden", icon: Send, dot: "bg-blue-500", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  accepted: { label: "Geaccepteerd", icon: CheckCircle2, dot: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Afgewezen", icon: XCircle, dot: "bg-red-500", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
  expired: { label: "Verlopen", icon: Clock, dot: "bg-amber-500", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
};

type ViewMode = "list" | "kanban";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

function isExpiringSoon(validUntil: string): boolean {
  const diff = new Date(validUntil).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCards({ quotes }: { quotes: QuoteResponse[] }) {
  const draft = quotes.filter((q) => q.status === "draft").length;
  const sent = quotes.filter((q) => q.status === "sent").length;
  const accepted = quotes.filter((q) => q.status === "accepted").length;
  const totalValue = quotes
    .filter((q) => q.status === "sent" || q.status === "draft")
    .reduce((sum, q) => sum + q.total_cents, 0);

  const cards = [
    { label: "Openstaand", value: String(draft + sent), accent: "bg-blue-500" },
    { label: "Geaccepteerd", value: String(accepted), accent: "bg-emerald-500" },
    { label: "Pipeline waarde", value: formatMoney(totalValue), accent: "bg-primary" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="relative overflow-hidden">
          <div className={`absolute left-0 top-0 h-full w-1 ${c.accent}`} />
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {c.label}
            </p>
            <p className="text-xl font-bold tracking-tight mt-1">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban column
// ---------------------------------------------------------------------------

const KANBAN_COLUMNS: { status: string; label: string; color: string; headerBg: string }[] = [
  { status: "draft", label: "Concept", color: "border-gray-300 dark:border-gray-600", headerBg: "bg-gray-100 dark:bg-gray-800" },
  { status: "sent", label: "Verzonden", color: "border-blue-400", headerBg: "bg-blue-50 dark:bg-blue-950/30" },
  { status: "accepted", label: "Geaccepteerd", color: "border-emerald-400", headerBg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { status: "rejected", label: "Afgewezen", color: "border-red-400", headerBg: "bg-red-50 dark:bg-red-950/30" },
];

function KanbanCard({ quote }: { quote: QuoteResponse }) {
  const expiring = quote.status === "sent" && isExpiringSoon(quote.valid_until);

  return (
    <Link href={`/dashboard/quotes/${quote.id}`}>
      <div className="rounded-lg border bg-card p-3 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate">{quote.customer_name}</span>
          {expiring && (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">
              Verloopt
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{quote.quote_number}</span>
        </div>
        {quote.project_name && (
          <p className="text-xs text-muted-foreground truncate">{quote.project_name}</p>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-[11px] text-muted-foreground">
            t/m {formatDate(quote.valid_until)}
          </span>
          <span className="text-sm font-bold">{formatMoney(quote.total_cents)}</span>
        </div>
      </div>
    </Link>
  );
}

function KanbanColumn({ column, quotes }: { column: typeof KANBAN_COLUMNS[0]; quotes: QuoteResponse[] }) {
  const columnQuotes = quotes.filter((q) => q.status === column.status);
  const totalCents = columnQuotes.reduce((s, q) => s + q.total_cents, 0);

  return (
    <div className={cn("flex flex-col rounded-xl border-t-2 bg-muted/20 min-w-[280px]", column.color)}>
      {/* Column header */}
      <div className={cn("flex items-center justify-between rounded-t-xl px-4 py-3", column.headerBg)}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{column.label}</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/10 px-1.5 text-[10px] font-bold">
            {columnQuotes.length}
          </span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {formatMoney(totalCents)}
        </span>
      </div>
      {/* Cards */}
      <div className="flex flex-col gap-2 p-3 flex-1 min-h-[120px]">
        {columnQuotes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground/50">Geen offertes</p>
          </div>
        ) : (
          columnQuotes.map((q) => <KanbanCard key={q.id} quote={q} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

function QuoteRow({ quote }: { quote: QuoteResponse }) {
  const cfg = STATUS_CONFIG[quote.status] ?? STATUS_CONFIG.draft;
  const expiring = quote.status === "sent" && isExpiringSoon(quote.valid_until);

  return (
    <Link href={`/dashboard/quotes/${quote.id}`}>
      <Card className="hover:shadow-md transition-all hover:border-primary/20 cursor-pointer">
        <CardContent className="flex items-center gap-4 p-4">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cfg.bg)}>
            <cfg.icon className={cn("h-5 w-5", cfg.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{quote.customer_name}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", cfg.bg, cfg.text)}>
                {cfg.label}
              </span>
              {expiring && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  Verloopt binnenkort
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground font-mono">{quote.quote_number}</span>
              {quote.project_name && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="text-xs text-muted-foreground truncate">{quote.project_name}</span>
                </>
              )}
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end shrink-0 gap-0.5">
            <span className="text-sm font-bold">{formatMoney(quote.total_cents)}</span>
            <span className="text-[11px] text-muted-foreground">
              Geldig t/m {formatDate(quote.valid_until)}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0 hidden sm:block" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_QUOTES: QuoteResponse[] = [
  {
    id: "q1",
    quote_number: "OFF-2025-001",
    customer_name: "Fam. De Vries",
    project_name: "Dakkapel plaatsen",
    status: "sent",
    issue_date: "2025-06-10T00:00:00",
    valid_until: "2025-07-10T00:00:00",
    subtotal_cents: 1450000,
    vat_cents: 304500,
    total_cents: 1754500,
  },
  {
    id: "q2",
    quote_number: "OFF-2025-002",
    customer_name: "Bakkerij Jansen",
    project_name: "Verbouwing winkelruimte",
    status: "accepted",
    issue_date: "2025-06-01T00:00:00",
    valid_until: "2025-07-01T00:00:00",
    subtotal_cents: 4800000,
    vat_cents: 1008000,
    total_cents: 5808000,
  },
  {
    id: "q3",
    quote_number: "OFF-2025-003",
    customer_name: "Gemeente Almere",
    project_name: "Renovatie sporthal",
    status: "draft",
    issue_date: "2025-06-14T00:00:00",
    valid_until: "2025-07-14T00:00:00",
    subtotal_cents: 12500000,
    vat_cents: 2625000,
    total_cents: 15125000,
  },
  {
    id: "q4",
    quote_number: "OFF-2025-004",
    customer_name: "Van der Berg Vastgoed",
    project_name: null,
    status: "rejected",
    issue_date: "2025-05-20T00:00:00",
    valid_until: "2025-06-20T00:00:00",
    subtotal_cents: 890000,
    vat_cents: 186900,
    total_cents: 1076900,
  },
  {
    id: "q5",
    quote_number: "OFF-2025-005",
    customer_name: "Stichting Woonzorg",
    project_name: "Badkamer aanpassingen (3x)",
    status: "sent",
    issue_date: "2025-06-12T00:00:00",
    valid_until: "2025-06-19T00:00:00",
    subtotal_cents: 2100000,
    vat_cents: 441000,
    total_cents: 2541000,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<QuoteResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  useEffect(() => {
    apiFetch<QuoteListResponse>("/quotes/?per_page=100")
      .then((res) => setQuotes(res.data))
      .catch(() => setQuotes(DEMO_QUOTES))
      .finally(() => setLoading(false));
  }, []);

  const filtered = quotes.filter(
    (q) =>
      !search ||
      q.quote_number.toLowerCase().includes(search.toLowerCase()) ||
      q.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      (q.project_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Offertes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Maak en beheer offertes voor uw klanten
          </p>
        </div>
        <Link href="/dashboard/quotes/new">
          <Button size="sm" className="gap-1.5 shadow-sm shadow-primary/20">
            <Plus className="h-4 w-4" />
            Nieuwe offerte
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      {!loading && <SummaryCards quotes={quotes} />}

      {/* Search + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring sm:w-64"
          />
        </div>
        {/* View toggle */}
        <div className="flex rounded-lg border p-0.5">
          <button
            onClick={() => setViewMode("kanban")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "kanban" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Pipeline
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-3.5 w-3.5" />
            Lijst
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Geen offertes gevonden</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {search ? "Pas uw zoekopdracht aan" : "Maak een nieuwe offerte aan om te beginnen"}
          </p>
        </div>
      ) : viewMode === "kanban" ? (
        /* Kanban board */
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-6 md:px-6">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn key={col.status} column={col} quotes={filtered} />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="space-y-2">
          {filtered.map((q) => (
            <QuoteRow key={q.id} quote={q} />
          ))}
        </div>
      )}
    </div>
  );
}
