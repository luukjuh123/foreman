"use client";

import React, { useEffect, useState, useMemo } from "react";
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
  Search,
  FolderKanban,
  Receipt,
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
  { label: string; icon: React.ComponentType<{ className?: string }>; dot: string; bg: string; text: string; kanbanBorder: string }
> = {
  draft: { label: "Concept", icon: Clock, dot: "bg-gray-400", bg: "bg-gray-500/10", text: "text-gray-500", kanbanBorder: "border-t-gray-400" },
  sent: { label: "Verzonden", icon: Send, dot: "bg-blue-500", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", kanbanBorder: "border-t-blue-500" },
  accepted: { label: "Geaccepteerd", icon: CheckCircle2, dot: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", kanbanBorder: "border-t-emerald-500" },
  rejected: { label: "Afgewezen", icon: XCircle, dot: "bg-red-500", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", kanbanBorder: "border-t-red-500" },
  expired: { label: "Verlopen", icon: Clock, dot: "bg-amber-500", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", kanbanBorder: "border-t-amber-500" },
};

type ViewMode = "kanban" | "table";

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

// Demo data while backend endpoint is being built
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
// Kanban View
// ---------------------------------------------------------------------------

const KANBAN_COLUMNS: Array<{ status: string; label: string }> = [
  { status: "draft", label: "Concept" },
  { status: "sent", label: "Verzonden" },
  { status: "accepted", label: "Geaccepteerd" },
  { status: "rejected", label: "Afgewezen" },
];

function KanbanCard({ quote }: { quote: QuoteResponse }) {
  const cfg = STATUS_CONFIG[quote.status] ?? STATUS_CONFIG.draft;
  const expiring = quote.status === "sent" && isExpiringSoon(quote.valid_until);

  return (
    <Card className="hover:shadow-md transition-shadow group cursor-pointer">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-mono text-muted-foreground">{quote.quote_number}</p>
            <p className="text-sm font-semibold mt-0.5 truncate group-hover:text-primary transition-colors">
              {quote.customer_name}
            </p>
          </div>
          {expiring && (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Verloopt
            </span>
          )}
        </div>

        {quote.project_name && (
          <p className="text-xs text-muted-foreground truncate">{quote.project_name}</p>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            Geldig t/m {formatDate(quote.valid_until)}
          </span>
          <span className="text-sm font-bold">{formatMoney(quote.total_cents)}</span>
        </div>

        {/* Quick actions */}
        {quote.status === "accepted" && (
          <div className="flex gap-1.5 pt-1">
            <Link
              href={`/dashboard/projects/new?quote_id=${quote.id}&project_name=${encodeURIComponent(quote.project_name ?? quote.customer_name)}&budget_cents=${quote.total_cents}&customer_name=${encodeURIComponent(quote.customer_name)}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                <FolderKanban className="h-3 w-3" />
                Project
              </button>
            </Link>
            <Link
              href={`/dashboard/invoices/new?quote_id=${quote.id}&customer_name=${encodeURIComponent(quote.customer_name)}&amount_cents=${quote.total_cents}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors">
                <Receipt className="h-3 w-3" />
                Factuur
              </button>
            </Link>
          </div>
        )}
        {quote.status === "draft" && (
          <button className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors">
            <Send className="h-3 w-3" />
            Versturen
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function KanbanView({ quotes }: { quotes: QuoteResponse[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {KANBAN_COLUMNS.map((col) => {
        const cfg = STATUS_CONFIG[col.status] ?? STATUS_CONFIG.draft;
        const colQuotes = quotes.filter((q) => q.status === col.status);
        const totalValue = colQuotes.reduce((s, q) => s + q.total_cents, 0);

        return (
          <div key={col.status} className="space-y-3">
            {/* Column header */}
            <div className={cn("rounded-lg border-t-2 bg-muted/30 px-3 py-2.5", cfg.kanbanBorder)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                    {colQuotes.length}
                  </span>
                </div>
              </div>
              {totalValue > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{formatMoney(totalValue)}</p>
              )}
            </div>

            {/* Cards */}
            <div className="space-y-2 min-h-[100px]">
              {colQuotes.length === 0 ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-border/50 py-8">
                  <p className="text-xs text-muted-foreground/50">Geen offertes</p>
                </div>
              ) : (
                colQuotes.map((q) => <KanbanCard key={q.id} quote={q} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table View
// ---------------------------------------------------------------------------

function TableView({ quotes }: { quotes: QuoteResponse[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Offertenummer
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Klant
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                  Project
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">
                  Geldig t/m
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Totaal
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground w-[120px]">
                  Acties
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotes.map((q) => {
                const cfg = STATUS_CONFIG[q.status] ?? STATUS_CONFIG.draft;
                const expiring = q.status === "sent" && isExpiringSoon(q.valid_until);
                return (
                  <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-foreground font-mono text-xs">
                        {q.quote_number}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-medium">{q.customer_name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">
                      {q.project_name ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            cfg.bg, cfg.text
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                          {cfg.label}
                        </span>
                        {expiring && (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                            Verloopt binnenkort
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground hidden sm:table-cell">
                      {formatDate(q.valid_until)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold">
                      {formatMoney(q.total_cents)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {q.status === "accepted" && (
                          <>
                            <Link
                              href={`/dashboard/projects/new?quote_id=${q.id}&project_name=${encodeURIComponent(q.project_name ?? q.customer_name)}&budget_cents=${q.total_cents}&customer_name=${encodeURIComponent(q.customer_name)}`}
                            >
                              <button className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                                <FolderKanban className="h-3 w-3" />
                                Project
                              </button>
                            </Link>
                            <Link
                              href={`/dashboard/invoices/new?quote_id=${q.id}&customer_name=${encodeURIComponent(q.customer_name)}&amount_cents=${q.total_cents}`}
                            >
                              <button className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors">
                                <Receipt className="h-3 w-3" />
                                Factuur
                              </button>
                            </Link>
                          </>
                        )}
                        {q.status === "draft" && (
                          <button className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors">
                            <Send className="h-3 w-3" />
                            Versturen
                          </button>
                        )}
                        {q.status === "sent" && (
                          <span className="text-[10px] text-muted-foreground/60 italic">
                            Wacht op reactie
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

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

      {/* Search + View toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode("kanban")}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 text-xs font-medium transition-colors",
              viewMode === "kanban" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            title="Pipeline weergave"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Pipeline</span>
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 text-xs font-medium border-l transition-colors",
              viewMode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            title="Tabelweergave"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Tabel</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-12 animate-pulse rounded-lg bg-muted/50" />
              <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
            </div>
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
        <KanbanView quotes={filtered} />
      ) : (
        <TableView quotes={filtered} />
      )}
    </div>
  );
}
