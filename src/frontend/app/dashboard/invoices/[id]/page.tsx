"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Send, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { InvoiceResponse } from "@/lib/types";

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

// ---------------------------------------------------------------------------
// Exported helpers (also tested directly)
// ---------------------------------------------------------------------------

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatInvoiceDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

function formatVatRate(bp: number): string {
  return `${bp / 100}%`;
}

// ---------------------------------------------------------------------------
// Send email dialog
// ---------------------------------------------------------------------------

interface SendEmailDialogProps {
  invoiceId: string;
  onClose: () => void;
  onSent: (invoice: InvoiceResponse) => void;
}

function SendEmailDialog({ invoiceId, onClose, onSent }: SendEmailDialogProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const updated = await apiFetch<InvoiceResponse>(`/invoices/${invoiceId}/transition`, {
        method: "POST",
        body: JSON.stringify({ status: "sent" }),
      });
      onSent(updated);
    } catch (e: unknown) {
      setError((e as Error).message);
      setSending(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Factuur versturen</h2>
        <p className="text-sm text-muted-foreground">
          Weet u zeker dat u deze factuur per e-mail wilt versturen?
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Annuleren
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? "Versturen…" : "Versturen"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params?: Promise<{ id: string }>;
}

export default function InvoicePreviewPage({ params }: Props = {}) {
  const routeParams = useParams();
  const [id, setId] = useState<string>("");
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => {
    if (params) {
      params.then(({ id: resolvedId }) => setId(resolvedId));
    } else {
      setId(routeParams?.id as string);
    }
  }, [params, routeParams]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    apiFetch<InvoiceResponse>(`/invoices/${id}`)
      .then(setInvoice)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleMarkPaid() {
    if (!id || !invoice) return;
    setMarkingPaid(true);
    try {
      const updated = await apiFetch<InvoiceResponse>(`/invoices/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status: "paid" }),
      });
      setInvoice(updated);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setMarkingPaid(false);
    }
  }

  function handleDownloadPdf() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
    const token = typeof window !== "undefined" ? localStorage.getItem("foreman_access_token") : null;
    fetch(`${apiBase}/invoices/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `factuur-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  }

  function handleDownloadUbl() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
    const token = typeof window !== "undefined" ? localStorage.getItem("foreman_access_token") : null;
    fetch(`${apiBase}/invoices/${id}/ubl`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `factuur-${id}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/invoices"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Facturen
        </Link>
        <p className="text-sm text-muted-foreground">Laden…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/invoices"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Facturen
        </Link>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/invoices"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Facturen
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            Factuur {invoice.invoice_number}
          </h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_BADGE_CLASS[invoice.status] ?? "bg-gray-100 text-gray-700"
            )}
          >
            {STATUS_LABELS[invoice.status] ?? invoice.status}
          </span>
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
          {invoice.status === "draft" && (
            <Button size="sm" onClick={() => setSendDialogOpen(true)}>
              <Send className="mr-1.5 h-4 w-4" />
              Verstuur per e-mail
            </Button>
          )}
          {invoice.status === "sent" && (
            <Button size="sm" onClick={handleMarkPaid} disabled={markingPaid}>
              <CheckCircle className="mr-1.5 h-4 w-4" />
              {markingPaid ? "Verwerken…" : "Markeer als betaald"}
            </Button>
          )}
        </div>
      </div>

      {/* Invoice meta */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Factuurdatum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatInvoiceDate(invoice.issue_date)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vervaldatum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatInvoiceDate(invoice.due_date)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Opmerkingen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* PDF Preview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            PDF Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <iframe
            src={`${apiBase}/invoices/${id}/pdf`}
            className="w-full h-96 border rounded"
            title="Factuur PDF"
          />
        </CardContent>
      </Card>

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
                      {formatVatRate(line.vat_rate_bp)}
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
      <Card>
        <CardContent className="pt-6">
          <div className="ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotaal</span>
              <span>{formatMoney(invoice.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">BTW</span>
              <span>{formatMoney(invoice.vat_total_cents)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Totaal</span>
              <span>{formatMoney(invoice.total_cents)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Send email dialog */}
      {sendDialogOpen && (
        <SendEmailDialog
          invoiceId={id}
          onClose={() => setSendDialogOpen(false)}
          onSent={(updated) => {
            setInvoice(updated);
            setSendDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
