"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { QuoteCreate, QuoteResponse } from "@/lib/types";

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

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
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
// Totals computation
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

export default function QuoteNewPage() {
  const router = useRouter();

  // Customer fields
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // Quote header
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [notes, setNotes] = useState("");

  // Line items
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const payload: QuoteCreate = {
        customer_name: customerName,
        customer_email: customerEmail,
        customer_address: customerAddress,
        valid_until: validUntil,
        notes: notes || undefined,
        line_items: lines.map((l) => ({
          description: l.description,
          quantity: parseFloat(l.quantity) || 0,
          unit: l.unit,
          unit_price_cents: eurToCents(l.unit_price),
          vat_rate_bp: l.vat_rate_bp,
        })),
      };

      const created = await apiFetch<QuoteResponse>("/quotes", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      router.push(`/dashboard/quotes/${created.id}`);
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
        <h1 className="text-2xl font-bold text-foreground">Nieuwe Offerte</h1>
        <p className="text-muted-foreground mt-1">Maak een nieuwe offerte aan</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ------------------------------------------------------------------ */}
        {/* Customer section                                                    */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Klantgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Naam klant *</label>
                <Input
                  data-testid="customer-name-input"
                  placeholder="Naam klant"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">E-mailadres</label>
                <Input
                  data-testid="customer-email-input"
                  placeholder="E-mail klant"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Adres</label>
              <Input
                data-testid="customer-address-input"
                placeholder="Adres klant"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Quote details                                                       */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Offertegegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="valid-until" className="text-sm font-medium">
                  Geldig tot
                </label>
                <Input
                  id="valid-until"
                  data-testid="valid-until-input"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  required
                />
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
                <span className="text-muted-foreground">Subtotaal (excl. BTW)</span>
                <span data-testid="summary-subtotal">{centsToEur(subtotalCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">BTW Totaal</span>
                <span data-testid="summary-vat">{centsToEur(vatTotalCents)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Totaal (incl. BTW)</span>
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
            onClick={() => router.push("/dashboard/quotes")}
          >
            Annuleren
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Opslaan..." : "Opslaan als concept"}
          </Button>
        </div>
      </form>
    </div>
  );
}
