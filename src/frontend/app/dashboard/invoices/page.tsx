"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import type { InvoiceResponse, InvoiceListResponse } from "@/lib/types";
import {
  computeTotalsBar,
  getStatusPillClasses,
  getAgingInfo,
} from "@/lib/invoice-admin-helpers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  sent: "Verzonden",
  paid: "Betaald",
  overdue: "Achterstallig",
};

type StatusFilter = "all" | "draft" | "sent" | "paid" | "overdue";

const FILTER_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "draft", label: "Concept" },
  { key: "sent", label: "Verzonden" },
  { key: "paid", label: "Betaald" },
  { key: "overdue", label: "Achterstallig" },
];

type PeriodFilter = "all" | "this_month" | "last_month" | "this_year";

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "all", label: "Alle periodes" },
  { value: "this_month", label: "Deze maand" },
  { value: "last_month", label: "Vorige maand" },
  { value: "this_year", label: "Dit jaar" },
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
  params.set("per_page", "100"); // fetch more to support client-side filtering
  if (status !== "all") {
    params.set("status", status);
  }
  return `/invoices?${params.toString()}`;
}

function isInPeriod(iso: string, period: PeriodFilter, now: Date): boolean {
  if (period === "all") return true;
  const date = new Date(iso.split("T")[0]);
  const y = date.getFullYear();
  const m = date.getMonth();
  const ny = now.getFullYear();
  const nm = now.getMonth();
  if (period === "this_month") return y === ny && m === nm;
  if (period === "last_month") {
    const lastMonth = nm === 0 ? 11 : nm - 1;
    const lastYear = nm === 0 ? ny - 1 : ny;
    return y === lastYear && m === lastMonth;
  }
  if (period === "this_year") return y === ny;
  return true;
}

// ---------------------------------------------------------------------------
// Totals Bar Component
// ---------------------------------------------------------------------------

function TotalsBar({ invoices }: { invoices: InvoiceResponse[] }) {
  const now = new Date();
  const { openstaand, achterstallig, betaaldDezeMaand } = computeTotalsBar(
    invoices,
    now
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card className="border-l-4 border-l-blue-400">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Openstaand
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {formatMoney(openstaand)}
          </p>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-red-500">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Achterstallig
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
            {formatMoney(achterstallig)}
          </p>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-green-500">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Betaald (deze maand)
          </p>
          <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-400">
            {formatMoney(betaaldDezeMaand)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aging Cell Component
// ---------------------------------------------------------------------------

function AgingCell({ invoice }: { invoice: InvoiceResponse }) {
  const info = getAgingInfo(invoice, new Date());
  if (!info) return <span className="text-muted-foreground">—</span>;

  if (info.daysOverdue === 0) {
    const label =
      info.daysUntilDue === 0
        ? "Vandaag"
        : `${info.daysUntilDue}d resterend`;
    return <span className="text-muted-foreground text-xs">{label}</span>;
  }

  const baseClass =
    info.tier === "red"
      ? "text-red-600 dark:text-red-400 font-semibold"
      : "text-amber-600 dark:text-amber-400 font-medium";

  return (
    <span className={cn("text-xs", baseClass)}>
      {info.daysOverdue}d te laat
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvoiceListPage() {
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

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

  // Client-side period + customer_id search filtering
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (!isInPeriod(inv.issue_date, period, now)) return false;
      if (
        customerSearch.trim() !== "" &&
        !inv.customer_id
          .toLowerCase()
          .includes(customerSearch.trim().toLowerCase()) &&
        !inv.invoice_number
          .toLowerCase()
          .includes(customerSearch.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [invoices, period, customerSearch, now]);

  const totalPages = Math.ceil(total / perPage);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function handleStatusFilter(key: StatusFilter) {
    setStatus(key);
    setPage(1);
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturen"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administratie" },
          { label: "Facturen" },
        ]}
        action={
          <Link href="/dashboard/invoices/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuwe factuur
            </Button>
          </Link>
        }
      />

      {/* Totals bar — computed from current (unfiltered) page data */}
      {!loading && !error && (
        <TotalsBar invoices={invoices} />
      )}

      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Status chips */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
          {FILTER_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleStatusFilter(key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                status === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {/* Period selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Periode filter"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Customer / invoice number search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Zoek klant of factuurnr…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="h-8 w-48 pl-8 text-xs"
              aria-label="Zoek klant of factuurnummer"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : filteredInvoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen facturen gevonden.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Factuurnummer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Datum
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Vervaldatum
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Verloop
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Totaal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredInvoices.map((inv) => {
                    const aging = getAgingInfo(inv, now);
                    const rowHighlight =
                      aging?.tier === "red"
                        ? "bg-red-50/50 dark:bg-red-950/20"
                        : aging?.tier === "amber"
                        ? "bg-amber-50/50 dark:bg-amber-950/20"
                        : "";

                    return (
                      <tr
                        key={inv.id}
                        className={cn(
                          "transition-colors hover:bg-muted/40",
                          rowHighlight
                        )}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/invoices/${inv.id}`}
                            className="font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(inv.issue_date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(inv.due_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                              getStatusPillClasses(inv.status)
                            )}
                          >
                            {STATUS_LABELS[inv.status] ?? inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <AgingCell invoice={inv} />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
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
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page} van {totalPages}
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
