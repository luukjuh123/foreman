"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Receipt, AlertTriangle, CheckCircle2, Send, Search, Clock, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
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

function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate.split("T")[0]);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

function AgingBadge({ dueDate, status }: { dueDate: string; status: string }) {
  if (status === "paid" || status === "draft") return null;
  const days = daysOverdue(dueDate);
  if (days <= 0) {
    const daysLeft = Math.abs(days);
    if (daysLeft <= 3) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          <Clock className="h-2.5 w-2.5" />
          {daysLeft}d
        </span>
      );
    }
    return null;
  }
  const urgency =
    days <= 14
      ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
      : days <= 30
        ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
        : "bg-red-200 dark:bg-red-950/60 text-red-700 dark:text-red-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${urgency}`}>
      <AlertTriangle className="h-2.5 w-2.5" />
      {days}d te laat
    </span>
  );
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
    const totalAll = invoices
      .filter((i) => i.status !== "draft")
      .reduce((sum, i) => sum + i.total_cents, 0);
    const overdueCount = invoices.filter((i) => i.status === "overdue").length;
    const paidCount = invoices.filter((i) => i.status === "paid").length;
    const sentCount = invoices.filter((i) => i.status === "sent").length;
    const collectionRate = totalAll > 0 ? Math.round((totalPaid / totalAll) * 100) : 0;
    return { totalOutstanding, totalOverdue, totalPaid, totalAll, overdueCount, paidCount, sentCount, collectionRate };
  }, [invoices]);

  return (
    <div className="space-y-3">
      {/* Collection progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Incassovoortgang</p>
              <span className="text-xs text-muted-foreground">
                {formatMoney(stats.totalPaid)} van {formatMoney(stats.totalAll)} geind
              </span>
            </div>
            <span className="text-sm font-bold text-primary">{stats.collectionRate}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${stats.totalAll > 0 ? (stats.totalPaid / stats.totalAll) * 100 : 0}%` }}
            />
            <div
              className="h-full bg-blue-500/60 transition-all duration-500"
              style={{ width: `${stats.totalAll > 0 ? (stats.totalOutstanding / stats.totalAll) * 100 : 0}%` }}
            />
            {stats.totalOverdue > 0 && (
              <div
                className="h-full bg-red-500/60 transition-all duration-500"
                style={{ width: `${stats.totalAll > 0 ? (stats.totalOverdue / stats.totalAll) * 100 : 0}%` }}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Betaald ({stats.paidCount})
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-blue-500/60" /> Verzonden ({stats.sentCount})
            </span>
            {stats.overdueCount > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-red-500/60" /> Verlopen ({stats.overdueCount})
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats cards */}
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
              <p className="text-[11px] text-muted-foreground">{stats.sentCount + stats.overdueCount} facturen</p>
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
              <p className="text-[11px] text-muted-foreground">{stats.paidCount} facturen</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvoiceListPage() {
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [allInvoices, setAllInvoices] = useState<InvoiceResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Fetch all for summary stats
  useEffect(() => {
    apiFetch<InvoiceListResponse>("/invoices?per_page=500")
      .then((res) => setAllInvoices(res.data))
      .catch(() => {});
  }, []);

  const totalPages = Math.ceil(total / perPage);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function handleStatusFilter(key: StatusFilter) {
    setStatus(key);
    setPage(1);
  }

  // Count per status for filter badges
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
            placeholder="Zoek op nummer..."
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
          return inv.invoice_number.toLowerCase().includes(q);
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
                      <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">
                        {formatDate(inv.issue_date)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground hidden sm:table-cell">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                              cfg.bg, cfg.text
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                            {STATUS_LABELS[inv.status] ?? inv.status}
                          </span>
                          <AgingBadge dueDate={inv.due_date} status={inv.status} />
                        </div>
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
