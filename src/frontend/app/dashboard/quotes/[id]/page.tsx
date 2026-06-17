"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, CheckCircle, XCircle, RefreshCw } from "lucide-react";
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

interface QuoteConvertResponse {
  project_id: string;
  invoice_id: string | null;
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

function formatVatRate(bp: number): string {
  return `${bp / 100}%`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuoteDetailPage() {
  const routeParams = useParams();
  const [id, setId] = useState<string>((routeParams?.id as string) ?? "");

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [convertResult, setConvertResult] = useState<QuoteConvertResponse | null>(null);

  useEffect(() => {
    if (routeParams?.id) {
      setId(routeParams.id as string);
    }
  }, [routeParams]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    apiFetch<QuoteResponse>(`/quotes/${id}`)
      .then((q) => setQuote(q))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSend() {
    if (!id) return;
    setActionPending(true);
    try {
      const updated = await apiFetch<QuoteResponse>(`/quotes/${id}/send`, { method: "POST" });
      setQuote(updated);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setActionPending(false);
    }
  }

  async function handleAccept() {
    if (!id) return;
    setActionPending(true);
    try {
      const updated = await apiFetch<QuoteResponse>(`/quotes/${id}/accept`, { method: "POST" });
      setQuote(updated);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setActionPending(false);
    }
  }

  async function handleConvert(createInvoice: boolean) {
    if (!id) return;
    setActionPending(true);
    try {
      const result = await apiFetch<QuoteConvertResponse>(`/quotes/${id}/convert`, {
        method: "POST",
        body: JSON.stringify({ create_invoice: createInvoice }),
      });
      setConvertResult(result);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setActionPending(false);
    }
  }

  // ------------------------------------------------------------------
  // Loading / error states
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/quotes"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Offertes
        </Link>
        <p className="text-sm text-muted-foreground">Laden…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/quotes"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Offertes
        </Link>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!quote) return null;

  // ------------------------------------------------------------------
  // Convert result banner
  // ------------------------------------------------------------------

  if (convertResult) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/quotes"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Offertes
        </Link>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-green-700 font-medium">Offerte succesvol omgezet!</p>
            <div className="flex flex-wrap gap-3">
              <Link href={`/dashboard/projects/${convertResult.project_id}`}>
                <Button variant="outline" size="sm">
                  Project bekijken
                </Button>
              </Link>
              {convertResult.invoice_id && (
                <Link href={`/dashboard/invoices/${convertResult.invoice_id}`}>
                  <Button variant="outline" size="sm">
                    Factuur bekijken
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Main render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/quotes"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Offertes
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{quote.quote_number}</h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_BADGE_CLASS[quote.status] ?? "bg-gray-100 text-gray-700"
            )}
          >
            {STATUS_LABELS[quote.status] ?? quote.status}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {quote.status === "draft" && (
            <Button size="sm" onClick={handleSend} disabled={actionPending}>
              <Send className="mr-1.5 h-4 w-4" />
              {actionPending ? "Versturen…" : "Versturen"}
            </Button>
          )}
          {quote.status === "sent" && (
            <>
              <Button size="sm" onClick={handleAccept} disabled={actionPending}>
                <CheckCircle className="mr-1.5 h-4 w-4" />
                {actionPending ? "Verwerken…" : "Markeer als geaccepteerd"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setActionPending(true);
                  try {
                    const updated = await apiFetch<QuoteResponse>(`/quotes/${id}/reject`, {
                      method: "POST",
                    });
                    setQuote(updated);
                  } catch (e: unknown) {
                    setError((e as Error).message);
                  } finally {
                    setActionPending(false);
                  }
                }}
                disabled={actionPending}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Afwijzen
              </Button>
            </>
          )}
          {quote.status === "accepted" && (
            <>
              <Button
                size="sm"
                onClick={() => handleConvert(false)}
                disabled={actionPending}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                {actionPending ? "Bezig…" : "Omzetten naar project"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleConvert(true)}
                disabled={actionPending}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Omzetten naar project + factuur
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Geldig tot</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(quote.valid_until)}</p>
          </CardContent>
        </Card>
        {quote.sent_at && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Verstuurd op</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{formatDate(quote.sent_at)}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Notes */}
      {quote.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Opmerkingen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{quote.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regelitems</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Omschrijving
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Aantal
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Eenheid
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Stukprijs
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    BTW
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Totaal excl.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quote.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">{line.description}</td>
                    <td className="px-4 py-3 text-right">{line.quantity}</td>
                    <td className="px-4 py-3">{line.unit}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(line.unit_price_cents)}</td>
                    <td className="px-4 py-3 text-right">{formatVatRate(line.vat_rate_bp)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(line.line_net_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardContent className="pt-6">
          <div className="ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotaal</span>
              <span>{formatMoney(quote.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">BTW</span>
              <span>{formatMoney(quote.vat_total_cents)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Totaal</span>
              <span>{formatMoney(quote.total_cents)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
