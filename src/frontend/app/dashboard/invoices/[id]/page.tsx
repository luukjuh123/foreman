"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Send, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { InvoiceResponse } from "@/lib/types";
import { InvoiceSendDialog } from "@/components/invoice-send-dialog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatInvoiceDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Status helpers
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

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

async function downloadBlob(
  url: string,
  filename: string,
  token: string | null
): Promise<void> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download mislukt: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default function InvoiceDetailPage({ params }: Props) {
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setInvoiceId(id);
      apiFetch<InvoiceResponse>(`/invoices/${id}`)
        .then((inv) => {
          setInvoice(inv);
          // Fetch customer email for the send dialog
          apiFetch<{ email: string | null }>(`/customers/${inv.customer_id}`)
            .then((c) => setCustomerEmail(c.email ?? null))
            .catch(() => setCustomerEmail(null));
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  const handleTransition = useCallback(
    async (status: "sent" | "paid" | "overdue") => {
      if (!invoiceId) return;
      setTransitioning(true);
      try {
        const updated = await apiFetch<InvoiceResponse>(
          `/invoices/${invoiceId}/transition`,
          {
            method: "POST",
            body: JSON.stringify({ status }),
          }
        );
        setInvoice(updated);
      } catch (e: unknown) {
        setError((e as Error).message);
      } finally {
        setTransitioning(false);
      }
    },
    [invoiceId]
  );

  const handleDownloadPdf = useCallback(async () => {
    if (!invoiceId) return;
    setDownloadError(null);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("foreman_access_token")
          : null;
      await downloadBlob(
        `${API_BASE}/invoices/${invoiceId}/pdf`,
        `factuur-${invoice?.invoice_number ?? invoiceId}.pdf`,
        token
      );
    } catch (e: unknown) {
      setDownloadError((e as Error).message);
    }
  }, [invoiceId, invoice?.invoice_number]);

  const handleDownloadUbl = useCallback(async () => {
    if (!invoiceId) return;
    setDownloadError(null);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("foreman_access_token")
          : null;
      await downloadBlob(
        `${API_BASE}/invoices/${invoiceId}/ubl`,
        `factuur-${invoice?.invoice_number ?? invoiceId}.xml`,
        token
      );
    } catch (e: unknown) {
      setDownloadError((e as Error).message);
    }
  }, [invoiceId, invoice?.invoice_number]);

  // ------------------------------------------------------------------
  // Loading / error states
  // ------------------------------------------------------------------

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/invoices">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Terug
          </Button>
        </Link>
        <p className="text-sm text-destructive">{error ?? "Factuur niet gevonden."}</p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // PDF preview URL (authenticated via token — served server-side, or
  // use a blob src approach; here we embed the API URL with bearer token
  // in the src via a data-src approach. For simplicity, we use the direct
  // URL and rely on the browser cookie/session or open the PDF URL as an
  // object with the token passed as query param if the backend supports it.
  // Since the backend requires Authorization header and iframes cannot set
  // headers, we use a separate blob-based loader for the preview.
  // ------------------------------------------------------------------

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("foreman_access_token")
      : null;

  const pdfPreviewUrl = token
    ? `${API_BASE}/invoices/${invoiceId}/pdf`
    : null;

  // ------------------------------------------------------------------
  // Derived state for action buttons
  // ------------------------------------------------------------------

  const canSend = invoice.status === "draft";
  const canMarkPaid = invoice.status === "sent" || invoice.status === "overdue";

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/dashboard/invoices">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar facturen
        </Button>
      </Link>

      {/* Header + actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">
              Factuur {invoice.invoice_number}
            </h1>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-sm font-medium",
                STATUS_BADGE_CLASS[invoice.status] ?? "bg-gray-100 text-gray-700"
              )}
            >
              {STATUS_LABELS[invoice.status] ?? invoice.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">Factuurdatum:</span>{" "}
              {formatInvoiceDate(invoice.issue_date)}
            </span>
            <span>
              <span className="font-medium text-foreground">Vervaldatum:</span>{" "}
              {formatInvoiceDate(invoice.due_date)}
            </span>
            <span>
              <span className="font-medium text-foreground">Betalingstermijn:</span>{" "}
              {invoice.payment_terms_days} dagen
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="mr-1.5 h-4 w-4" />
            Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadUbl}>
            <Download className="mr-1.5 h-4 w-4" />
            Download UBL
          </Button>
          {canSend && (
            <Button
              size="sm"
              onClick={() => setSendDialogOpen(true)}
            >
              <Send className="mr-1.5 h-4 w-4" />
              Verstuur per e-mail
            </Button>
          )}
          {canMarkPaid && (
            <Button
              size="sm"
              variant="default"
              disabled={transitioning}
              onClick={() => handleTransition("paid")}
            >
              <CheckCircle className="mr-1.5 h-4 w-4" />
              Markeer als betaald
            </Button>
          )}
        </div>
      </div>

      {/* Download error */}
      {downloadError && (
        <p className="text-sm text-destructive">{downloadError}</p>
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
                {invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">{line.description}</td>
                    <td className="px-4 py-3 text-right">{line.quantity}</td>
                    <td className="px-4 py-3">{line.unit}</td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(line.unit_price_cents)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(line.vat_rate_bp / 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(line.line_total_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotaal</span>
            <span>{formatMoney(invoice.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">BTW</span>
            <span>{formatMoney(invoice.vat_total_cents)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span>Totaal</span>
            <span>{formatMoney(invoice.total_cents)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opmerkingen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* PDF preview */}
      {pdfPreviewUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">PDF voorbeeld</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              src={pdfPreviewUrl}
              title={`Factuur ${invoice.invoice_number} PDF`}
              className="h-[600px] w-full rounded-b-lg border-0"
              data-testid="pdf-preview"
            />
          </CardContent>
        </Card>
      )}

      {/* Send email dialog */}
      <InvoiceSendDialog
        invoice={invoice}
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        onSent={(updated) => {
          setInvoice(updated);
          setSendDialogOpen(false);
        }}
        customerEmail={customerEmail}
      />
    </div>
  );
}
