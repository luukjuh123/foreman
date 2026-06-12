"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, XCircle, Send, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { QuoteResponse, QuoteStatus } from "@/lib/types";
import { formatMoney, formatInvoiceDate } from "@/lib/invoice-helpers";

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
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  accepted: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  expired: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
};

function formatVatRate(bp: number): string {
  return `${bp / 100}%`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuoteDetailPage() {
  const routeParams = useParams();
  const router = useRouter();
  const [id, setId] = useState<string>((routeParams?.id as string) ?? "");

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Accept success
  const [acceptedProjectId, setAcceptedProjectId] = useState<string | null>(null);

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
    setSending(true);
    try {
      const updated = await apiFetch<QuoteResponse>(`/quotes/${id}/send`, { method: "POST" });
      setQuote(updated);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function handleAccept() {
    if (!id) return;
    setAccepting(true);
    try {
      const result = await apiFetch<{ project_id: string }>(`/quotes/${id}/accept`, { method: "POST" });
      setAcceptedProjectId(result.project_id);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setAccepting(false);
    }
  }

  async function handleReject() {
    if (!id) return;
    setRejecting(true);
    try {
      const updated = await apiFetch<QuoteResponse>(`/quotes/${id}/reject`, { method: "POST" });
      setQuote(updated);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setRejecting(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm("Weet je zeker dat je deze offerte wilt verwijderen?")) return;
    setDeleting(true);
    try {
      await apiFetch<null>(`/quotes/${id}`, { method: "DELETE" });
      router.push("/dashboard/quotes");
    } catch (e: unknown) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  // ------------------------------------------------------------------
  // Render
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

  if (error && !quote) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard/quotes"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Offertes
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            Offerte {quote.quote_number}
          </h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_BADGE_CLASS[quote.status] ?? "bg-gray-100 text-gray-700"
            )}
          >
            {STATUS_LABELS[quote.status] ?? quote.status}
          </span>
        </div>

        {/* Status-dependent actions */}
        <div className="flex flex-wrap gap-2">
          {quote.status === "draft" && (
            <>
              <Button size="sm" onClick={handleSend} disabled={sending}>
                <Send className="mr-1.5 h-4 w-4" />
                {sending ? "Versturen…" : "Versturen"}
              </Button>
              <Link href={`/dashboard/quotes/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Bewerken
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {deleting ? "Verwijderen…" : "Verwijderen"}
              </Button>
            </>
          )}

          {quote.status === "sent" && (
            <>
              <Button size="sm" onClick={handleAccept} disabled={accepting}>
                <CheckCircle className="mr-1.5 h-4 w-4" />
                {accepting ? "Verwerken…" : "Geaccepteerd"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReject}
                disabled={rejecting}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                {rejecting ? "Verwerken…" : "Afgewezen"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Accept success banner */}
      {(acceptedProjectId ?? (quote.status === "accepted" && quote.project_id)) && (
        <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">
              Offerte geaccepteerd
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Er is automatisch een project aangemaakt op basis van deze offerte.
            </p>
          </div>
          <Link
            href={`/dashboard/projects/${acceptedProjectId ?? quote.project_id}`}
          >
            <Button size="sm" variant="outline">
              Project bekijken
            </Button>
          </Link>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Quote meta */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Klant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-medium">{quote.customer_name}</p>
            {quote.customer_email && (
              <p className="text-sm text-muted-foreground">{quote.customer_email}</p>
            )}
            {quote.customer_address && (
              <p className="text-sm text-muted-foreground">{quote.customer_address}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Geldig tot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatInvoiceDate(quote.valid_until)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Offertenummer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{quote.quote_number}</p>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {quote.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Opmerkingen
            </CardTitle>
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
                    Totaal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quote.line_items.map((item, idx) => {
                  const lineTotalCents = Math.round(
                    item.quantity * item.unit_price_cents
                  );
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-3">{item.description}</td>
                      <td className="px-4 py-3 text-right">{item.quantity}</td>
                      <td className="px-4 py-3">{item.unit}</td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(item.unit_price_cents)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatVatRate(item.vat_rate_bp)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMoney(lineTotalCents)}
                      </td>
                    </tr>
                  );
                })}
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
              <span className="text-muted-foreground">Subtotaal (excl. BTW)</span>
              <span>{formatMoney(quote.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">BTW</span>
              <span>{formatMoney(quote.vat_cents)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Totaal (incl. BTW)</span>
              <span>{formatMoney(quote.total_cents)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
