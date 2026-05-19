"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
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

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
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
// Page
// ---------------------------------------------------------------------------

export default function InvoiceListPage() {
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Facturen</h1>
        <Link href="/dashboard/invoices/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nieuwe factuur
          </Button>
        </Link>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {FILTER_BUTTONS.map(({ key, label }) => (
          <Button
            key={key}
            variant={status === key ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen facturen gevonden.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Factuurnummer
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Datum
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Vervaldatum
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Totaal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="text-foreground hover:underline"
                        >
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(inv.issue_date)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            STATUS_BADGE_CLASS[inv.status] ?? "bg-gray-100 text-gray-700"
                          )}
                        >
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMoney(inv.total_cents)}
                      </td>
                    </tr>
                  ))}
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
