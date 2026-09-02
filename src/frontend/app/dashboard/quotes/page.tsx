"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listQuotes,
  formatMoney,
  formatDate,
  type QuoteResponse,
  type QuoteListResponse,
  type QuoteStatus,
} from "@/lib/quotes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Concept",
  sent: "Verzonden",
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
  expired: "Verlopen",
};

const STATUS_BADGE_CLASS: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-orange-100 text-orange-700",
};

type StatusFilter = "all" | QuoteStatus;

const FILTER_BUTTONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "draft", label: "Concept" },
  { key: "sent", label: "Verzonden" },
  { key: "accepted", label: "Geaccepteerd" },
  { key: "rejected", label: "Afgewezen" },
  { key: "expired", label: "Verlopen" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuoteListPage() {
  const [quotes, setQuotes] = useState<QuoteResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listQuotes(page, perPage, statusFilter === "all" ? undefined : statusFilter)
      .then((res: QuoteListResponse) => {
        setQuotes(res.data);
        setTotal(res.total);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, perPage, statusFilter]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Offertes</h1>
        <Link href="/dashboard/quotes/new">
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nieuwe offerte
          </Button>
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_BUTTONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setPage(1);
              setStatusFilter(key);
            }}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
              statusFilter === key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && <p className="text-gray-500">Laden...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && quotes.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Geen offertes gevonden.
          </CardContent>
        </Card>
      )}

      {!loading && !error && quotes.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nummer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Geldig tot</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Subtotaal</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">BTW</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {quotes.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/quotes/${q.id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {q.quote_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            STATUS_BADGE_CLASS[q.status]
                          )}
                        >
                          {STATUS_LABELS[q.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(q.valid_until)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {formatMoney(q.subtotal_cents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {formatMoney(q.vat_total_cents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} offerte{total !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" onClick={() => setPage((p) => p - 1)}>
                Vorige
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                Volgende
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
