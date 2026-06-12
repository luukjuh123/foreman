"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type {
  CustomerResponse,
  CustomerCreate,
  InvoiceCreate,
  InvoiceLineCreate,
  InvoiceResponse,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eurToCents(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

function centsToEur(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  description: string;
  quantity: string;
  unit: string;
  unit_price: string; // euros (user input)
  vat_rate_bp: number;
}

const VAT_OPTIONS = [
  { label: "21%", value: 2100 },
  { label: "9%", value: 900 },
  { label: "0%", value: 0 },
];

function emptyLine(): LineItem {
  return {
    description: "",
    quantity: "1",
    unit: "st",
    unit_price: "",
    vat_rate_bp: 2100,
  };
}

// ---------------------------------------------------------------------------
// Totals calculation
// ---------------------------------------------------------------------------

function calcTotals(lines: LineItem[]): {
  subtotalCents: number;
  vatTotalCents: number;
  totalCents: number;
} {
  let subtotalCents = 0;
  let vatTotalCents = 0;

  for (const l of lines) {
    const qty = parseFloat(l.quantity) || 0;
    const priceCents = eurToCents(l.unit_price);
    const lineExcl = Math.round(qty * priceCents);
    const lineVat = Math.round((lineExcl * l.vat_rate_bp) / 10000);
    subtotalCents += lineExcl;
    vatTotalCents += lineVat;
  }

  return { subtotalCents, vatTotalCents, totalCents: subtotalCents + vatTotalCents };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function InvoiceCreatePage() {
  const router = useRouter();

  // Customer state
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<CustomerCreate>({ name: "" });

  // Invoice header state
  const [issueDate, setIssueDate] = useState(todayIso());
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [notes, setNotes] = useState("");

  // Line items
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load customers on mount
  useEffect(() => {
    apiFetch<CustomerResponse[]>("/invoices/customers").then(setCustomers).catch(() => {});
  }, []);

  // ---------------------------------------------------------------------------
  // Line item handlers
  // ---------------------------------------------------------------------------

  function updateLine(index: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let customerId = selectedCustomerId;

      // Create new customer inline if needed
      if (showNewCustomer) {
        const created = await apiFetch<CustomerResponse>("/invoices/customers", {
          method: "POST",
          body: JSON.stringify(newCustomer),
        });
        customerId = created.id;
      }

      const invoiceLines: InvoiceLineCreate[] = lines.map((l) => ({
        description: l.description,
        quantity: parseFloat(l.quantity) || 0,
        unit: l.unit,
        unit_price_cents: eurToCents(l.unit_price),
        vat_rate_bp: l.vat_rate_bp,
      }));

      // Compute due_date from issue_date + payment_terms_days
      const issueDateObj = new Date(issueDate);
      issueDateObj.setDate(issueDateObj.getDate() + paymentTermsDays);
      const dueDate = issueDateObj.toISOString().split("T")[0];

      const payload: InvoiceCreate = {
        customer_id: customerId,
        issue_date: issueDate,
        due_date: dueDate,
        payment_terms_days: paymentTermsDays,
        currency: "EUR",
        notes: notes || undefined,
        lines: invoiceLines,
      };

      await apiFetch<InvoiceResponse>("/invoices/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      router.push("/dashboard/invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived totals
  // ---------------------------------------------------------------------------

  const { subtotalCents, vatTotalCents, totalCents } = calcTotals(lines);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nieuwe Factuur</h1>
        <p className="text-muted-foreground mt-1">Maak een nieuwe factuur aan</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ------------------------------------------------------------------ */}
        {/* Customer section                                                    */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Klant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showNewCustomer ? (
              <div className="space-y-2">
                <select
                  data-testid="customer-select"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="">-- Selecteer klant --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-sm text-primary underline hover:no-underline"
                  onClick={() => setShowNewCustomer(true)}
                >
                  Nieuwe klant aanmaken
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium text-muted-foreground">Nieuwe klant</p>
                <Input
                  placeholder="Bedrijfsnaam *"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <Input
                  placeholder="E-mailadres"
                  type="email"
                  value={newCustomer.email ?? ""}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
                />
                <Input
                  placeholder="KVK-nummer"
                  value={newCustomer.kvk_number ?? ""}
                  onChange={(e) =>
                    setNewCustomer((p) => ({ ...p, kvk_number: e.target.value }))
                  }
                />
                <Input
                  placeholder="BTW-nummer"
                  value={newCustomer.vat_number ?? ""}
                  onChange={(e) =>
                    setNewCustomer((p) => ({ ...p, vat_number: e.target.value }))
                  }
                />
                <Input
                  placeholder="Adres"
                  value={newCustomer.address_line1 ?? ""}
                  onChange={(e) =>
                    setNewCustomer((p) => ({ ...p, address_line1: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline hover:no-underline"
                  onClick={() => setShowNewCustomer(false)}
                >
                  Annuleren — bestaande klant kiezen
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Invoice details                                                     */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Factuurgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Factuurdatum</label>
                <Input
                  data-testid="issue-date-input"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Betalingstermijn</label>
                <div className="flex items-center gap-2">
                  <Input
                    data-testid="payment-terms-input"
                    type="number"
                    min={0}
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">dagen</span>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Notities</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Optionele notities..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Line items                                                          */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Regelitems</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Column headers */}
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 text-sm font-medium text-muted-foreground sm:grid">
              <span>Omschrijving</span>
              <span>Aantal</span>
              <span>Eenheid</span>
              <span>Prijs per eenheid</span>
              <span>BTW</span>
              <span />
            </div>

            {lines.map((line, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] sm:items-center"
              >
                <Input
                  data-testid={`line-desc-${idx}`}
                  placeholder="Omschrijving"
                  value={line.description}
                  onChange={(e) => updateLine(idx, { description: e.target.value })}
                />
                <Input
                  data-testid={`line-qty-${idx}`}
                  type="number"
                  min={0}
                  step="any"
                  placeholder="1"
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                />
                <Input
                  data-testid={`line-unit-${idx}`}
                  placeholder="st"
                  value={line.unit}
                  onChange={(e) => updateLine(idx, { unit: e.target.value })}
                />
                <Input
                  data-testid={`line-price-${idx}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0,00"
                  value={line.unit_price}
                  onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                />
                <select
                  data-testid={`line-vat-${idx}`}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={line.vat_rate_bp}
                  onChange={(e) =>
                    updateLine(idx, { vat_rate_bp: parseInt(e.target.value) })
                  }
                >
                  {VAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Verwijder regel"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(idx)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ×
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
            >
              + Regel toevoegen
            </Button>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Totals summary                                                      */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardContent className="pt-6">
            <div className="ml-auto max-w-xs space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotaal</span>
                <span data-testid="summary-subtotal">{centsToEur(subtotalCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">BTW Totaal</span>
                <span data-testid="summary-vat">{centsToEur(vatTotalCents)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Totaal</span>
                <span data-testid="summary-total">{centsToEur(totalCents)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Error + submit                                                      */}
        {/* ------------------------------------------------------------------ */}
        {error && (
          <div
            data-testid="form-error"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/invoices")}
          >
            Annuleren
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      </form>
    </div>
  );
}
