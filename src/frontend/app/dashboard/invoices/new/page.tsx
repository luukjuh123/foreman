"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type {
  CustomerResponse,
  ProjectListResponse,
  InvoiceCreate,
  InvoiceLineCreate,
  InvoiceResponse,
} from "@/lib/types";
import { Plus, Trash2, ChevronLeft } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// Cents to euro display string (Dutch locale)
function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  description: string;
  quantity: string;
  unit: string;
  unit_price_euros: string; // user types in euros, we convert to cents on submit
  vat_rate_bp: number; // 2100 | 900 | 0
}

function emptyLine(): LineItem {
  return {
    description: "",
    quantity: "",
    unit: "stuk",
    unit_price_euros: "",
    vat_rate_bp: 2100,
  };
}

// ---------------------------------------------------------------------------
// Line totals
// ---------------------------------------------------------------------------

function lineSubtotalCents(line: LineItem): number {
  const qty = parseFloat(line.quantity) || 0;
  const price = Math.round((parseFloat(line.unit_price_euros) || 0) * 100);
  return qty * price;
}

function lineVatCents(line: LineItem): number {
  return Math.round(lineSubtotalCents(line) * (line.vat_rate_bp / 10000));
}

// ---------------------------------------------------------------------------
// InvoiceCreatePage
// ---------------------------------------------------------------------------

export default function InvoiceCreatePage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [projects, setProjects] = useState<ProjectListResponse["data"]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch customers and projects on mount
  useEffect(() => {
    async function load() {
      try {
        const [customersData, projectsData] = await Promise.all([
          apiFetch<CustomerResponse[]>("/customers"),
          apiFetch<ProjectListResponse>("/projects?page=1&per_page=100"),
        ]);
        setCustomers(customersData);
        setProjects(projectsData.data);
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, []);

  // Calculated totals
  const subtotalCents = lines.reduce((sum, l) => sum + lineSubtotalCents(l), 0);
  const vatTotalCents = lines.reduce((sum, l) => sum + lineVatCents(l), 0);
  const totalCents = subtotalCents + vatTotalCents;

  // Line item handlers
  function updateLine(idx: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  // Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    if (!customerId) {
      setValidationError("Klant is verplicht");
      return;
    }

    if (lines.length === 0) {
      setValidationError("Minimaal één regel is vereist");
      return;
    }

    const linePayloads: InvoiceLineCreate[] = lines.map((l) => ({
      description: l.description,
      quantity: parseFloat(l.quantity) || 0,
      unit: l.unit,
      unit_price_cents: Math.round((parseFloat(l.unit_price_euros) || 0) * 100),
      vat_rate_bp: l.vat_rate_bp,
    }));

    const payload: InvoiceCreate = {
      customer_id: customerId,
      project_id: projectId || null,
      issue_date: issueDate,
      payment_terms_days: paymentTermsDays,
      notes: notes || null,
      lines: linePayloads,
    };

    setSubmitting(true);
    try {
      const invoice = await apiFetch<InvoiceResponse>("/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/dashboard/invoices/${invoice.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Er is een fout opgetreden");
    } finally {
      setSubmitting(false);
    }
  }

  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard/invoices"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Terug
        </Link>
        <h1 className="text-2xl font-bold">Nieuwe factuur</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer & project */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Klant &amp; project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="customer-select" className="text-sm font-medium">
                Klant <span className="text-destructive">*</span>
              </label>
              {loadingData ? (
                <p className="text-sm text-muted-foreground">Laden…</p>
              ) : (
                <select
                  id="customer-select"
                  className={selectClassName}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">— Selecteer klant —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="project-select" className="text-sm font-medium">
                Project (optioneel)
              </label>
              <select
                id="project-select"
                className={selectClassName}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— Geen project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Invoice details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Factuurgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="issue-date" className="text-sm font-medium">
                  Factuurdatum
                </label>
                <Input
                  id="issue-date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="payment-terms" className="text-sm font-medium">
                  Betalingstermijn (dagen)
                </label>
                <Input
                  id="payment-terms"
                  type="number"
                  min="0"
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 30)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="notes" className="text-sm font-medium">
                Notities (optioneel)
              </label>
              <textarea
                id="notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bijv. betalingsinstructies"
              />
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Regelitems</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                {/* Description — spans 4 cols */}
                <div className="col-span-4">
                  <Input
                    placeholder="Omschrijving"
                    value={line.description}
                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                  />
                </div>
                {/* Quantity — 2 cols */}
                <div className="col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Aantal"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                  />
                </div>
                {/* Unit — 1 col */}
                <div className="col-span-1">
                  <Input
                    placeholder="Eenheid"
                    value={line.unit}
                    onChange={(e) => updateLine(idx, { unit: e.target.value })}
                  />
                </div>
                {/* Unit price in euros — 2 cols */}
                <div className="col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Prijs (€)"
                    value={line.unit_price_euros}
                    onChange={(e) => updateLine(idx, { unit_price_euros: e.target.value })}
                  />
                </div>
                {/* VAT rate — 2 cols */}
                <div className="col-span-2">
                  <select
                    className={selectClassName}
                    value={line.vat_rate_bp}
                    onChange={(e) =>
                      updateLine(idx, { vat_rate_bp: parseInt(e.target.value) })
                    }
                  >
                    <option value={2100}>21%</option>
                    <option value={900}>9%</option>
                    <option value={0}>0%</option>
                  </select>
                </div>
                {/* Remove button — 1 col */}
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(idx)}
                    aria-label="Regel verwijderen"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={addLine}
              className="w-full"
              aria-label="Regel toevoegen"
            >
              <Plus className="h-4 w-4 mr-2" />
              Regel toevoegen
            </Button>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardContent className="pt-6">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotaal</dt>
                <dd className="font-medium">{formatMoney(subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">BTW</dt>
                <dd className="font-medium">{formatMoney(vatTotalCents)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <dt className="font-semibold">Totaal</dt>
                <dd className="font-semibold">{formatMoney(totalCents)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Errors */}
        {validationError && (
          <p className="text-sm text-destructive">{validationError}</p>
        )}
        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Bezig met aanmaken…" : "Factuur aanmaken"}
        </Button>
      </form>
    </div>
  );
}
