"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuoteLineResponse {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bp: number;
  line_net_cents: number;
  line_vat_cents: number;
}

interface QuoteResponse {
  id: string;
  customer_id: string;
  quote_number: string;
  valid_until: string;
  status: string;
  notes: string | null;
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  lines: QuoteLineResponse[];
}

interface QuoteListResponse {
  data: QuoteResponse[];
  total: number;
  page: number;
  per_page: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  sent: "Verzonden",
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
  expired: "Verlopen",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};

type StatusFilter = "all" | "draft" | "sent" | "accepted" | "rejected" | "expired";

const FILTER_BUTTONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "draft", label: "Concept" },
  { key: "sent", label: "Verzonden" },
  { key: "accepted", label: "Geaccepteerd" },
  { key: "rejected", label: "Afgewezen" },
  { key: "expired", label: "Verlopen" },
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
  return `/quotes?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuoteListPage() {
  const [quotes, setQuotes] = useState<QuoteResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<QuoteListResponse>(buildUrl(page, status))
      .then((res) => {
        setQuotes(res.data);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Offertes</h1>
        <Link href="/dashboard/quotes/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nieuwe offerte
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
      ) : quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen offertes gevonden.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Offertenummer
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Geldig tot
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
                  {quotes.map((q) => (
                    <tr
                      key={q.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/dashboard/quotes/${q.id}`}
                          className="text-foreground hover:underline"
                        >
                          {q.quote_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(q.valid_until)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            STATUS_BADGE_CLASS[q.status] ?? "bg-gray-100 text-gray-700"
                          )}
                        >
                          {STATUS_LABELS[q.status] ?? q.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMoney(q.total_cents)}
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
