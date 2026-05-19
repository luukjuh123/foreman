"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { InvoiceListResponse, InvoiceResponse } from "@/lib/types";

const STATUS_FILTERS = [
  { key: null, label: "Alle" },
  { key: "draft", label: "Concept" },
  { key: "sent", label: "Verzonden" },
  { key: "paid", label: "Betaald" },
  { key: "overdue", label: "Verlopen" },
] as const;

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

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

export default function InvoiceListPage() {
  const [data, setData] = useState<InvoiceResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const fetchInvoices = useCallback(async (pg: number, status: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), per_page: "20" });
      if (status) params.set("status", status);
      const result = await apiFetch<InvoiceListResponse>(`/invoices?${params}`);
      setData(result.data);
      setTotal(result.total);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices(page, statusFilter);
  }, [page, statusFilter, fetchInvoices]);

  const handleFilterClick = (key: string | null) => {
    setStatusFilter(key);
    setPage(1);
  };

  if (loading && data.length === 0) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error && data.length === 0) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-6">
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
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={label}
            data-testid={key ? `filter-${key}` : "filter-all"}
            onClick={() => handleFilterClick(key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              statusFilter === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Invoice table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nummer</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Datum</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vervaldatum</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Totaal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/invoices/${inv.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.due_date)}</td>
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
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(inv.total_cents)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Geen facturen gevonden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Vorige
          </Button>
          <span className="text-sm text-muted-foreground">
            Pagina {page} van {Math.ceil(total / 20)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Volgende
          </Button>
        </div>
      )}
    </div>
  );
}
