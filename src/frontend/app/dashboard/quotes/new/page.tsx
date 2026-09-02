"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  createQuote,
  formatMoney,
  calcLineTotals,
  type QuoteLineCreate,
} from "@/lib/quotes";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface CustomerOption {
  id: string;
  name: string;
}

const VAT_OPTIONS = [
  { label: "21% BTW", value: 2100 },
  { label: "9% BTW", value: 900 },
  { label: "0% BTW", value: 0 },
];

interface LineItem {
  description: string;
  quantity: string;
  unit: string;
  unit_price: string; // euros string
  vat_rate_bp: number;
}

function emptyLine(): LineItem {
  return { description: "", quantity: "1", unit: "stuks", unit_price: "", vat_rate_bp: 2100 };
}

function eurToCents(val: string): number {
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// ---------------------------------------------------------------------------
// Live totals
// ---------------------------------------------------------------------------

interface Totals {
  subtotal: number;
  vatByRate: Map<number, number>;
  total: number;
}

function computeTotals(lines: LineItem[]): Totals {
  let subtotal = 0;
  const vatByRate = new Map<number, number>();
  for (const l of lines) {
    const qty = parseFloat(l.quantity) || 0;
    const unitCents = eurToCents(l.unit_price);
    const { net, vat } = calcLineTotals(qty, unitCents, l.vat_rate_bp);
    subtotal += net;
    vatByRate.set(l.vat_rate_bp, (vatByRate.get(l.vat_rate_bp) ?? 0) + vat);
  }
  const total = subtotal + [...vatByRate.values()].reduce((a, b) => a + b, 0);
  return { subtotal, vatByRate, total };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewQuotePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data?: CustomerOption[]; id?: string }[]>("/customers/")
      .then((res) => {
        const arr = Array.isArray(res) ? res : [];
        setCustomers(arr.map((c: CustomerOption) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof LineItem, value: string | number) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("Selecteer een klant.");
      return;
    }
    const linePayload: QuoteLineCreate[] = lines.map((l) => ({
      description: l.description,
      quantity: parseFloat(l.quantity) || 1,
      unit: l.unit,
      unit_price_cents: eurToCents(l.unit_price),
      vat_rate_bp: l.vat_rate_bp,
    }));
    setSubmitting(true);
    setError(null);
    try {
      const q = await createQuote({
        customer_id: customerId,
        valid_until: validUntil || undefined,
        notes: notes || undefined,
        lines: linePayload,
      });
      router.push(`/dashboard/quotes/${q.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setSubmitting(false);
    }
  }

  const totals = computeTotals(lines);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/quotes">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Terug
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nieuwe offerte</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Quote details */}
        <Card>
          <CardHeader>
            <CardTitle>Offerte details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Klant *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Selecteer een klant...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Geldig tot</label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notities</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Optionele opmerkingen..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader>
            <CardTitle>Regelitems</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-start p-3 border border-gray-200 rounded-lg bg-gray-50"
              >
                <div className="col-span-4">
                  <label className="text-xs text-gray-500 mb-1 block">Omschrijving</label>
                  <Input
                    value={line.description}
                    onChange={(e) => updateLine(idx, "description", e.target.value)}
                    placeholder="Bijv. Fundering leggen"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Aantal</label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-gray-500 mb-1 block">Eenheid</label>
                  <Input
                    value={line.unit}
                    onChange={(e) => updateLine(idx, "unit", e.target.value)}
                    placeholder="stuks"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Prijs (€)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e) => updateLine(idx, "unit_price", e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">BTW</label>
                  <select
                    value={line.vat_rate_bp}
                    onChange={(e) => updateLine(idx, "vat_rate_bp", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {VAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-1 pt-6">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="p-2 text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Regel verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={addLine} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Regel toevoegen
            </Button>
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
                <span className="tabular-nums font-medium">{formatMoney(totals.subtotal)}</span>
              </div>
              {[...totals.vatByRate.entries()]
                .sort(([a], [b]) => b - a)
                .map(([rate, amount]) => (
                  <div key={rate} className="flex justify-between text-gray-600">
                    <span>BTW {rate / 100}%</span>
                    <span className="tabular-nums">{formatMoney(amount)}</span>
                  </div>
                ))}
              <div className="flex justify-between border-t pt-2 font-semibold text-base">
                <span>Totaal (incl. BTW)</span>
                <span className="tabular-nums">{formatMoney(totals.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/quotes">
            <Button type="button" variant="outline">
              Annuleren
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Opslaan..." : "Offerte aanmaken"}
          </Button>
        </div>
      </form>
    </div>
  );
}
