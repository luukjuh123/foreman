"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getQuote,
  transitionQuoteStatus,
  convertQuoteToProject,
  formatMoney,
  formatDate,
  formatVatRate,
  vatBreakdown,
  type QuoteResponse,
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuoteDetailPage() {
  const routeParams = useParams();
  const router = useRouter();
  const id = routeParams?.id as string ?? "";

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  function loadQuote() {
    if (!id) return;
    setLoading(true);
    setError(null);
    getQuote(id)
      .then(setQuote)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadQuote();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTransition(newStatus: QuoteStatus) {
    if (!id) return;
    setActionLoading(true);
    try {
      const updated = await transitionQuoteStatus(id, newStatus);
      setQuote(updated);
    } catch (e: Error | unknown) {
      setError(e instanceof Error ? e.message : "Statuswijziging mislukt");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConvert() {
    if (!id) return;
    setActionLoading(true);
    try {
      const updated = await convertQuoteToProject(id);
      setQuote(updated);
      if (updated.project_id) {
        router.push(`/dashboard/projects/${updated.project_id}`);
      }
    } catch (e: Error | unknown) {
      setError(e instanceof Error ? e.message : "Omzetten mislukt");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Laden...</p>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error}</p>
        <Link href="/dashboard/quotes">
          <Button variant="outline" className="mt-4">
            Terug naar offertes
          </Button>
        </Link>
      </div>
    );
  }

  if (!quote) return null;

  const breakdown = vatBreakdown(quote.lines);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/quotes">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Terug
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
            <span
              className={cn(
                "inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium",
                STATUS_BADGE_CLASS[quote.status]
              )}
            >
              {STATUS_LABELS[quote.status]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {quote.status === "draft" && (
            <Button
              onClick={() => handleTransition("sent")}
              disabled={actionLoading}
              className="flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Versturen
            </Button>
          )}
          {quote.status === "sent" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleTransition("rejected")}
                disabled={actionLoading}
                className="flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" />
                Afwijzen
              </Button>
              <Button
                onClick={() => handleTransition("accepted")}
                disabled={actionLoading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4" />
                Accepteren
              </Button>
              <Button
                onClick={handleConvert}
                disabled={actionLoading}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Project aanmaken
              </Button>
            </>
          )}
          {quote.status === "accepted" && !quote.project_id && (
            <Button
              onClick={handleConvert}
              disabled={actionLoading}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Project aanmaken
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded">{error}</p>}

      {/* Quote metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Offerte informatie</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Offertenummer</span>
            <p className="font-medium mt-0.5">{quote.quote_number}</p>
          </div>
          <div>
            <span className="text-gray-500">Status</span>
            <p className="font-medium mt-0.5">{STATUS_LABELS[quote.status]}</p>
          </div>
          <div>
            <span className="text-gray-500">Geldig tot</span>
            <p className="font-medium mt-0.5">{formatDate(quote.valid_until)}</p>
          </div>
          <div>
            <span className="text-gray-500">Aangemaakt</span>
            <p className="font-medium mt-0.5">{formatDate(quote.created_at)}</p>
          </div>
          {quote.sent_at && (
            <div>
              <span className="text-gray-500">Verzonden op</span>
              <p className="font-medium mt-0.5">{formatDate(quote.sent_at)}</p>
            </div>
          )}
          {quote.accepted_at && (
            <div>
              <span className="text-gray-500">Geaccepteerd op</span>
              <p className="font-medium mt-0.5">{formatDate(quote.accepted_at)}</p>
            </div>
          )}
          {quote.project_id && (
            <div>
              <span className="text-gray-500">Gekoppeld project</span>
              <p className="font-medium mt-0.5">
                <Link
                  href={`/dashboard/projects/${quote.project_id}`}
                  className="text-blue-600 hover:underline"
                >
                  Bekijk project
                </Link>
              </p>
            </div>
          )}
          {quote.notes && (
            <div className="col-span-2">
              <span className="text-gray-500">Notities</span>
              <p className="mt-0.5 text-gray-800">{quote.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines table */}
      <Card>
        <CardHeader>
          <CardTitle>Regelitems</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Omschrijving</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Aantal</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Eenheid</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Prijs</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">BTW</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Netto</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">BTW bedrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quote.lines.map((line) => (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{line.description}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-4 py-3 text-gray-600">{line.unit}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(line.unit_price_cents)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatVatRate(line.vat_rate_bp)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(line.line_net_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {formatMoney(line.line_vat_cents)}
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
        <CardHeader>
          <CardTitle>Totaaloverzicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm max-w-sm ml-auto">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotaal (excl. BTW)</span>
              <span className="tabular-nums font-medium">{formatMoney(quote.subtotal_cents)}</span>
            </div>
            {[...breakdown.entries()]
              .sort(([a], [b]) => b - a)
              .map(([rate, amount]) => (
                <div key={rate} className="flex justify-between text-gray-600">
                  <span>BTW {rate / 100}%</span>
                  <span className="tabular-nums">{formatMoney(amount)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t pt-2 font-semibold text-base">
              <span>Totaal (incl. BTW)</span>
              <span className="tabular-nums">{formatMoney(quote.total_cents)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
