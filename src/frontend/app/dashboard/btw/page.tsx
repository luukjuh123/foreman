"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import {
  formatBtwCents,
  formatQuarterLabel,
  type BtwAangifteResponse,
} from "@/lib/btw";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  submitted: "Ingediend",
  accepted: "Geaccepteerd",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  submitted: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_COLORS[status] ?? "bg-gray-100 text-gray-800"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Generate dialog
// ---------------------------------------------------------------------------

interface GenerateDialogProps {
  onClose: () => void;
  onGenerated: (aangifte: BtwAangifteResponse) => void;
}

function GenerateDialog({ onClose, onGenerated }: GenerateDialogProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<BtwAangifteResponse>(
        "/btw/generate",
        {
          method: "POST",
          body: JSON.stringify({ year, quarter }),
        }
      );
      onGenerated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-4">Nieuwe BTW Aangifte</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="year" className="block text-sm font-medium mb-1">
              Jaar
            </label>
            <input
              id="year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="quarter" className="block text-sm font-medium mb-1">
              Kwartaal
            </label>
            <select
              id="quarter"
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="w-full border rounded px-3 py-1.5 text-sm"
            >
              <option value={1}>Q1 (jan-mrt)</option>
              <option value={2}>Q2 (apr-jun)</option>
              <option value={3}>Q3 (jul-sep)</option>
              <option value={4}>Q4 (okt-dec)</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              {loading ? "Berekenen…" : "Genereren"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BtwAangiftePage() {
  const [aangiftes, setAangiftes] = useState<BtwAangifteResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<BtwAangifteResponse[]>("/btw/");
      setAangiftes(data);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleGenerated(aangifte: BtwAangifteResponse) {
    setShowDialog(false);
    setAangiftes((prev) => {
      const filtered = prev.filter(
        (a) => !(a.year === aangifte.year && a.quarter === aangifte.quarter)
      );
      return [aangifte, ...filtered];
    });
  }

  function csvExportUrl(id: string) {
    const base =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
    return `${base}/btw/${id}/export/csv`;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">BTW Aangifte</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kwartaaloverzicht voor uw BTW-aangifte bij de Belastingdienst
          </p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium"
        >
          Nieuwe aangifte
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : aangiftes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Geen aangifte gevonden. Klik op &quot;Nieuwe aangifte&quot; om te
              beginnen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {aangiftes.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {formatQuarterLabel(a.year, a.quarter)}
                  </CardTitle>
                  <StatusBadge status={a.status} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    1a — Hoog tarief (21%) netto
                  </span>
                  <span className="text-right font-mono">
                    {formatBtwCents(a.box_1a_net_cents)}
                  </span>
                  <span className="text-muted-foreground">
                    1b — Laag tarief (9%) netto
                  </span>
                  <span className="text-right font-mono">
                    {formatBtwCents(a.box_1b_net_cents)}
                  </span>
                  <span className="text-muted-foreground">
                    5a — BTW verschuldigd
                  </span>
                  <span className="text-right font-mono">
                    {formatBtwCents(a.box_5a_vat_due_cents)}
                  </span>
                  <span className="text-muted-foreground font-medium">
                    5d — Te betalen
                  </span>
                  <span className="text-right font-mono font-medium">
                    {formatBtwCents(a.box_5d_payable_cents)}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <a
                    href={csvExportUrl(a.id)}
                    download
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border hover:bg-muted"
                  >
                    CSV
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showDialog && (
        <GenerateDialog
          onClose={() => setShowDialog(false)}
          onGenerated={handleGenerated}
        />
      )}
    </div>
  );
}
