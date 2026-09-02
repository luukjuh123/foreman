"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { formatBudget } from "@/lib/projects";
import type { InvoiceResponse, InvoiceListResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  sent: "Verzonden",
  paid: "Betaald",
  overdue: "Verlopen",
};

const INVOICE_STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FinancienTabProps {
  projectId: string;
  budgetCents: number | null;
}

export function FinancienTab({ projectId, budgetCents }: FinancienTabProps) {
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<InvoiceListResponse>(
      `/invoices?project_id=${projectId}&page=1&per_page=50`
    )
      .then((res) => setInvoices(res.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total_cents, 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + inv.total_cents, 0);

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {budgetCents != null && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Budget</p>
            <p className="mt-1 text-lg font-semibold">{formatBudget(budgetCents)}</p>
          </div>
        )}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Gefactureerd</p>
          <p className="mt-1 text-lg font-semibold">{formatBudget(totalInvoiced)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Betaald</p>
          <p className="mt-1 text-lg font-semibold text-green-700">{formatBudget(totalPaid)}</p>
        </div>
      </div>

      {/* Invoices list */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Facturen</h2>
        <Link href={`/dashboard/invoices/new?project_id=${projectId}`}>
          <Button size="sm" variant="outline">
            <Plus className="mr-1.5 h-4 w-4" />
            Nieuwe factuur
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen facturen voor dit project.</p>
      ) : (
        <div className="space-y-2" data-testid="invoice-list">
          {invoices.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 px-4">
                <div>
                  <Link
                    href={`/dashboard/invoices/${inv.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {inv.invoice_number}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(inv.issue_date)} · Vervaldatum {formatDate(inv.due_date)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      INVOICE_STATUS_CLASS[inv.status] ?? "bg-gray-100 text-gray-700"
                    )}
                  >
                    {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                  </span>
                  <span className="text-sm font-semibold">
                    {formatBudget(inv.total_cents)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
