"use client";

import React, { useCallback, useRef, useState } from "react";
import { Upload, RotateCcw, ShoppingCart, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  searchMaterials,
  formatPriceCents,
  type MaterialResult,
} from "@/lib/materials";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CsvRow {
  name: string;
  quantity: string;
  unit: string;
}

type MatchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; results: MaterialResult[] };

export interface ImportRow {
  csvRow: CsvRow;
  matchState: MatchState;
  selectedIndex: number; // index into matchState.results (when done)
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

export function parseCSV(text: string): CsvRow[] | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { error: "Het bestand is leeg." };
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 1) {
    return { error: "Het bestand is leeg." };
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const qtyIdx = header.indexOf("quantity");
  const unitIdx = header.indexOf("unit");

  if (nameIdx === -1 || qtyIdx === -1 || unitIdx === -1) {
    return {
      error:
        "Ongeldige koptekstrij. Verwachte kolommen: name, quantity, unit.",
    };
  }

  const dataLines = lines.slice(1).filter((l) => l.trim());
  if (dataLines.length === 0) {
    return { error: "Het bestand bevat geen gegevensrijen." };
  }

  const rows: CsvRow[] = [];
  for (const line of dataLines) {
    const cols = line.split(",");
    const name = (cols[nameIdx] ?? "").trim();
    if (!name) continue;
    rows.push({
      name,
      quantity: (cols[qtyIdx] ?? "").trim(),
      unit: (cols[unitIdx] ?? "").trim(),
    });
  }

  if (rows.length === 0) {
    return { error: "Het bestand bevat geen geldige rijen." };
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BulkMaterialImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ---- File processing ----

  function processFile(file: File) {
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCSV(text);
      if ("error" in result) {
        setCsvError(result.error);
        setRows(null);
        return;
      }
      const importRows: ImportRow[] = result.map((csvRow) => ({
        csvRow,
        matchState: { status: "idle" },
        selectedIndex: 0,
      }));
      setRows(importRows);
      // Kick off searches
      importRows.forEach((_, idx) => {
        runSearch(result[idx].name, idx, importRows);
      });
    };
    reader.readAsText(file);
  }

  function runSearch(query: string, rowIdx: number, initial?: ImportRow[]) {
    setRows((prev) => {
      const base = initial ?? prev;
      if (!base) return prev;
      const next = [...base];
      next[rowIdx] = { ...next[rowIdx], matchState: { status: "loading" } };
      return next;
    });

    searchMaterials(query)
      .then((res) => {
        setRows((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[rowIdx] = {
            ...next[rowIdx],
            matchState: { status: "done", results: res.data },
            selectedIndex: 0,
          };
          return next;
        });
      })
      .catch(() => {
        setRows((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[rowIdx] = {
            ...next[rowIdx],
            matchState: {
              status: "error",
              message: "Zoekfout — probeer opnieuw.",
            },
          };
          return next;
        });
      });
  }

  // ---- Drag-and-drop ----

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function handleReset() {
    setRows(null);
    setCsvError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSelectChange(rowIdx: number, value: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], selectedIndex: parseInt(value, 10) };
      return next;
    });
  }

  // ---- Summary ----

  function computeTotalCents(): number {
    if (!rows) return 0;
    let total = 0;
    for (const row of rows) {
      if (row.matchState.status !== "done") continue;
      const match = row.matchState.results[row.selectedIndex];
      if (!match) continue;
      const qty = parseFloat(row.csvRow.quantity) || 1;
      total += match.price_cents * qty;
    }
    return total;
  }

  function handleAddToShoppingList() {
    if (!rows) return;
    const items = rows
      .filter((r) => r.matchState.status === "done")
      .map((r) => {
        const match = (r.matchState as { status: "done"; results: MaterialResult[] })
          .results[r.selectedIndex];
        return { name: match?.name ?? r.csvRow.name, quantity: r.csvRow.quantity, unit: r.csvRow.unit };
      });
    // Persist to localStorage under the same key the shopping list page uses
    try {
      const existing = JSON.parse(
        localStorage.getItem("foreman_shopping_list") ?? "[]"
      ) as Array<{ id: string; name: string; quantity: string; unit: string; purchased: boolean }>;
      const newItems = items.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        purchased: false,
      }));
      localStorage.setItem(
        "foreman_shopping_list",
        JSON.stringify([...existing, ...newItems])
      );
    } catch { /* no-op */ }
  }

  // ---- Render helpers ----

  const totalCents = computeTotalCents();
  const hasAnyMatch =
    rows?.some(
      (r) =>
        r.matchState.status === "done" && r.matchState.results.length > 0
    ) ?? false;

  // ---------------------------------------------------------------------------
  // Upload area (shown before file is picked)
  // ---------------------------------------------------------------------------
  if (!rows) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">
          CSV uploaden
        </h1>

        {csvError && (
          <div
            data-testid="csv-error"
            className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {csvError}
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <label
              htmlFor="csv-file-input"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed py-16 transition-colors",
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/60 hover:bg-muted/30",
              ].join(" ")}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Klik of sleep een CSV bestand hier
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Verwachte kolommen: <code className="font-mono">name, quantity, unit</code>
                </p>
              </div>
              <input
                id="csv-file-input"
                data-testid="csv-file-input"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Preview + results table
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          CSV uploaden — {rows.length} rijen
        </h1>
        <button
          data-testid="reset-csv-button"
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RotateCcw className="h-4 w-4" />
          Nieuw bestand
        </button>
      </div>

      {/* Hidden file input still in DOM for re-uploads */}
      <input
        id="csv-file-input"
        data-testid="csv-file-input"
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={handleFileChange}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Overeenkomsten</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table
              data-testid="import-preview-table"
              className="w-full text-sm"
            >
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2">Naam</th>
                  <th className="px-4 py-2">Aantal</th>
                  <th className="px-4 py-2">Eenheid</th>
                  <th className="px-4 py-2">Overeenkomst</th>
                  <th className="px-4 py-2">Prijs</th>
                  <th className="px-4 py-2">Voorraad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const match =
                    row.matchState.status === "done"
                      ? row.matchState.results[row.selectedIndex] ?? null
                      : null;

                  return (
                    <tr
                      key={idx}
                      data-testid="import-row"
                      className="border-b last:border-0 hover:bg-muted/20"
                    >
                      {/* Name */}
                      <td className="px-4 py-3 font-medium text-foreground">
                        {row.csvRow.name}
                      </td>
                      {/* Quantity */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.csvRow.quantity}
                      </td>
                      {/* Unit */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.csvRow.unit}
                      </td>
                      {/* Match selector */}
                      <td className="px-4 py-3">
                        {row.matchState.status === "loading" && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Zoeken…
                          </span>
                        )}
                        {row.matchState.status === "error" && (
                          <span
                            data-testid={`match-error-${idx}`}
                            className="flex items-center gap-1 text-xs text-destructive"
                          >
                            <AlertCircle className="h-3 w-3" />
                            {row.matchState.message}
                          </span>
                        )}
                        {row.matchState.status === "done" &&
                          row.matchState.results.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              Geen overeenkomst
                            </span>
                          )}
                        {row.matchState.status === "done" &&
                          row.matchState.results.length > 0 && (
                            <select
                              data-testid={`match-select-${idx}`}
                              value={String(row.selectedIndex)}
                              onChange={(e) =>
                                handleSelectChange(idx, e.target.value)
                              }
                              className="max-w-[220px] truncate rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              {row.matchState.results.map((r, rIdx) => (
                                <option key={rIdx} value={String(rIdx)}>
                                  {r.name} — {r.store}
                                </option>
                              ))}
                            </select>
                          )}
                      </td>
                      {/* Price */}
                      <td
                        data-testid={`match-price-${idx}`}
                        className="px-4 py-3 font-semibold text-foreground"
                      >
                        {match ? formatPriceCents(match.price_cents) : "—"}
                      </td>
                      {/* Stock */}
                      <td className="px-4 py-3">
                        {match == null ? null : match.in_stock ? (
                          <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                            Op voorraad
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
                            Niet op voorraad
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {hasAnyMatch && (
        <Card data-testid="total-cost-summary">
          <CardContent className="flex items-center justify-between pt-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Geschatte totaalkosten
              </p>
              <p className="text-xl font-bold text-foreground">
                {formatPriceCents(totalCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                Op basis van opgegeven hoeveelheden × eenheidsprijs
              </p>
            </div>
            <Button
              onClick={handleAddToShoppingList}
              className="flex items-center gap-2"
            >
              <ShoppingCart className="h-4 w-4" />
              Toevoegen aan boodschappenlijst
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
