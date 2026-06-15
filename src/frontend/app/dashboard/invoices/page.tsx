"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Receipt, AlertTriangle, CheckCircle2, Send, Search, User, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { InvoiceResponse, InvoiceListResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  sent: "Verzonden",
  paid: "Betaald",
  overdue: "Verlopen",
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  draft: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-gray-400" },
  sent: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  paid: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", dot: "bg-emerald-500" },
  overdue: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
};

type StatusFilter = "all" | "draft" | "sent" | "paid" | "overdue";

const FILTER_BUTTONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "draft", label: "Concept" },
  { key: "sent", label: "Verzonden" },
  { key: "paid", label: "Betaald" },
  { key: "overdue", label: "Verlopen" },
];

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

function buildUrl(page: number, status: StatusFilter): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", "20");
  if (status !== "all") {
    params.set("status", status);
  }
  return `/invoices?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------

function InvoiceSummaryStats({ invoices }: { invoices: InvoiceResponse[] }) {
  const stats = useMemo(() => {
    const totalOutstanding = invoices
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((sum, i) => sum + i.total_cents, 0);
    const totalOverdue = invoices
      .filter((i) => i.status === "overdue")
      .reduce((sum, i) => sum + i.total_cents, 0);
    const totalPaid = invoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + i.total_cents, 0);
    const overdueCount = invoices.filter((i) => i.status === "overdue").length;
    return { totalOutstanding, totalOverdue, totalPaid, overdueCount };
  }, [invoices]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card className="relative overflow-hidden">
        <div className="absolute left-0 top-0 h-full w-1 bg-blue-500" />
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
            <Send className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Openstaand</p>
            <p className="text-xl font-bold tracking-tight">{formatMoney(stats.totalOutstanding)}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="relative overflow-hidden">
        <div className={`absolute left-0 top-0 h-full w-1 ${stats.overdueCount > 0 ? "bg-red-500" : "bg-muted"}`} />
        <CardContent className="flex items-center gap-3 p-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stats.overdueCount > 0 ? "bg-red-500/10" : "bg-muted"}`}>
            <AlertTriangle className={`h-5 w-5 ${stats.overdueCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Verlopen</p>
            <p className={`text-xl font-bold tracking-tight ${stats.overdueCount > 0 ? "text-red-500" : ""}`}>
              {formatMoney(stats.totalOverdue)}
            </p>
            {stats.overdueCount > 0 && (
              <p className="text-[11px] text-muted-foreground">{stats.overdueCount} facturen</p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="relative overflow-hidden">
        <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500" />
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Betaald</p>
            <p className="text-xl font-bold tracking-tight">{formatMoney(stats.totalPaid)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aging Breakdown
// ---------------------------------------------------------------------------

function AgingBreakdown({ invoices }: { invoices: InvoiceResponse[] }) {
  const aging = useMemo(() => {
    const now = new Date();
    const outstanding = invoices.filter(
      (i) => i.status === "sent" || i.status === "overdue"
    );

    const buckets = [
      { label: "Actueel", range: "0-30 dagen", cents: 0, count: 0, color: "bg-emerald-500" },
      { label: "30+ dagen", range: "31-60 dagen", cents: 0, count: 0, color: "bg-amber-500" },
      { label: "60+ dagen", range: "61-90 dagen", cents: 0, count: 0, color: "bg-orange-500" },
      { label: "90+ dagen", range: ">90 dagen", cents: 0, count: 0, color: "bg-red-500" },
    ];

    for (const inv of outstanding) {
      const dueDate = new Date(inv.due_date);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) {
        buckets[0].cents += inv.total_cents;
        buckets[0].count++;
      } else if (daysOverdue <= 30) {
        buckets[0].cents += inv.total_cents;
        buckets[0].count++;
      } else if (daysOverdue <= 60) {
        buckets[1].cents += inv.total_cents;
        buckets[1].count++;
      } else if (daysOverdue <= 90) {
        buckets[2].cents += inv.total_cents;
        buckets[2].count++;
      } else {
        buckets[3].cents += inv.total_cents;
        buckets[3].count++;
      }
    }

    const totalCents = buckets.reduce((s, b) => s + b.cents, 0);
    return { buckets, totalCents };
  }, [invoices]);

  if (aging.totalCents === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">Ouderdomsanalyse</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">Openstaande facturen per verouderingsperiode</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked bar */}
        <div className="h-3 rounded-full bg-muted overflow-hidden flex">
          {aging.buckets.map((bucket) => {
            const pct = aging.totalCents > 0 ? (bucket.cents / aging.totalCents) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={bucket.label}
                className={cn("h-full transition-all duration-500", bucket.color)}
                style={{ width: `${pct}%` }}
                title={`${bucket.label}: ${formatMoney(bucket.cents)}`}
              />
            );
          })}
        </div>

        {/* Breakdown rows */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {aging.buckets.map((bucket) => (
            <div key={bucket.label} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", bucket.color)} />
                <span className="text-xs font-medium">{bucket.label}</span>
              </div>
              <p className="text-lg font-bold tracking-tight">{formatMoney(bucket.cents)}</p>
              <p className="text-[11px] text-muted-foreground">
                {bucket.count} factuur{bucket.count !== 1 ? "en" : ""}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface CustomerMap { [id: string]: string }

export default function InvoiceListPage() {
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [allInvoices, setAllInvoices] = useState<InvoiceResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerMap, setCustomerMap] = useState<CustomerMap>({});
  const [search, setSearch] = useState("");

  // Fetch for current filter/page
  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<InvoiceListResponse>(buildUrl(page, status))
      .then((res) => {
        setInvoices(res.data);
        setTotal(res.total);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, status]);

  // Fetch all for summary stats + customer name lookup
  useEffect(() => {
    apiFetch<InvoiceListResponse>("/invoices?per_page=500")
      .then((res) => setAllInvoices(res.data))
      .catch(() => {});
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/customers/?per_page=500")
      .then((res) => {
        const map: CustomerMap = {};
        for (const c of res.data ?? []) map[c.id] = c.name;
        setCustomerMap(map);
      })
      .catch(() => {});
  }, []);

  const totalPages = Math.ceil(total / perPage);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function handleStatusFilter(key: StatusFilter) {
    setStatus(key);
    setPage(1);
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inv of allInvoices) {
      counts[inv.status] = (counts[inv.status] ?? 0) + 1;
    }
    return counts;
  }, [allInvoices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facturen</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Beheer uw facturen en betalingen
          </p>
        </div>
        <Link href="/dashboard/invoices/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nieuwe factuur
          </Button>
        </Link>
      </div>

      {/* Summary stats */}
      {allInvoices.length > 0 && <InvoiceSummaryStats invoices={allInvoices} />}

      {/* Aging breakdown */}
      {allInvoices.length > 0 && <AgingBreakdown invoices={allInvoices} />}

      {/* Filter + Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_BUTTONS.map(({ key, label }) => {
            const count = key === "all" ? allInvoices.length : (statusCounts[key] ?? 0);
            return (
              <button
                key={key}
                onClick={() => handleStatusFilter(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  status === key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {label}
                {count > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    status === key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op nummer, klant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (() => {
        const searchFiltered = invoices.filter((inv) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          const custName = customerMap[inv.customer_id] ?? "";
          return (
            inv.invoice_number.toLowerCase().includes(q) ||
            custName.toLowerCase().includes(q)
          );
        });
        return searchFiltered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Receipt className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Geen facturen gevonden</p>
          <p className="text-sm text-muted-foreground">
            {search ? "Pas uw zoekopdracht aan" : "Maak uw eerste factuur aan om te beginnen"}
          </p>
          {!search && (
            <Link href="/dashboard/invoices/new">
              <Button size="sm" variant="outline" className="mt-4 gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Eerste factuur aanmaken
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Factuurnummer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Klant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                      Datum
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">
                      Vervaldatum
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Totaal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {searchFiltered.map((inv) => {
                    const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft;
                    const custName = customerMap[inv.customer_id] ?? "";
                    return (
                    <tr
                      key={inv.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => window.location.href = `/dashboard/invoices/${inv.id}`}
                    >
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors font-mono text-xs">
                          {inv.invoice_number}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {custName ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">
                              {custName.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <span className="text-sm font-medium truncate max-w-[160px]">{custName}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">
                        {formatDate(inv.issue_date)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground hidden sm:table-cell">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            cfg.bg, cfg.text
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold">
                        {formatMoney(inv.total_cents)}
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
      })()}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page} van {totalPages} ({total} facturen)
          </p>
          <div className="flex gap-2">
            {hasPrev && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
              >
                Vorige
              </Button>
            )}
            {hasNext && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
              >
                Volgende
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
