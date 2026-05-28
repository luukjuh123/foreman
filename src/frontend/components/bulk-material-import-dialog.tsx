"use client";

import React, { useCallback, useRef, useState } from "react";
import { Upload, FileText, CheckCircle, XCircle, ArrowLeft, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CsvRow, MatchedRow, ProductMatch, BulkImportItem } from "@/lib/bulk-material-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "upload" | "matching" | "preview" | "importing" | "done";

interface RowState {
  matchedRow: MatchedRow;
  rejected: boolean;
}

// ---------------------------------------------------------------------------
// Price formatter (Dutch locale)
// ---------------------------------------------------------------------------

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Store badge colour (matches materials page)
// ---------------------------------------------------------------------------

const STORE_COLORS: Record<string, string> = {
  hornbach: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  gamma: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  praxis: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  bouwmaat: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

function storeBadgeClass(store: string): string {
  return (
    STORE_COLORS[store.toLowerCase()] ??
    "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UploadZone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      data-testid="csv-upload-zone"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={[
        "flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-14 text-center transition-colors cursor-pointer",
        dragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30",
      ].join(" ")}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
    >
      <Upload className="mb-3 h-10 w-10 text-muted-foreground opacity-60" />
      <p className="text-sm font-medium text-foreground">
        Sleep een CSV-bestand hierheen of klik om te bladeren
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Verwachte kolommen: <span className="font-mono">name, quantity, unit, description</span>
      </p>
      <input
        ref={inputRef}
        data-testid="csv-file-input"
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // reset so the same file can be re-selected
          e.target.value = "";
        }}
      />
    </div>
  );
}

function MatchRow({
  rowState,
  onReject,
}: {
  rowState: RowState;
  onReject: () => void;
}) {
  const { matchedRow, rejected } = rowState;
  const { input, match } = matchedRow;

  if (rejected) {
    return (
      <tr
        data-testid="match-preview-row"
        data-row-index={matchedRow.row_index}
        className="border-b last:border-0 opacity-40"
      >
        <td colSpan={5} className="px-4 py-2 text-sm text-muted-foreground line-through">
          <span data-testid="match-row-rejected">{input.name}</span> — afgewezen
        </td>
      </tr>
    );
  }

  return (
    <tr
      data-testid="match-preview-row"
      data-row-index={matchedRow.row_index}
      className="border-b last:border-0 hover:bg-muted/20"
    >
      {/* Input */}
      <td className="px-4 py-2 text-sm">
        <span className="font-medium text-foreground">{input.name}</span>
        {input.description && (
          <span className="ml-1 text-xs text-muted-foreground">— {input.description}</span>
        )}
        <div className="text-xs text-muted-foreground">
          {input.quantity} {input.unit}
        </div>
      </td>

      {/* Match */}
      {match ? (
        <>
          <td className="px-4 py-2 text-sm">
            <a
              href={match.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:underline"
            >
              {match.name}
            </a>
          </td>
          <td className="px-4 py-2 text-sm">
            <span
              className={[
                "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                storeBadgeClass(match.store),
              ].join(" ")}
            >
              {match.store.charAt(0).toUpperCase() + match.store.slice(1)}
            </span>
          </td>
          <td className="px-4 py-2 text-sm font-semibold text-foreground">
            {formatPrice(match.price_cents)}
          </td>
          <td className="px-4 py-2">
            <button
              type="button"
              data-testid="reject-match-btn"
              onClick={onReject}
              className="rounded border border-destructive px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              Afwijzen
            </button>
          </td>
        </>
      ) : (
        <td colSpan={4} className="px-4 py-2">
          <span
            data-testid="no-match-indicator"
            className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
          >
            <AlertCircle className="h-3 w-3" />
            Geen match gevonden
          </span>
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export default function BulkMaterialImportDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [parseError, setParseError] = useState<string | null>(null);
  const [matchApiError, setMatchApiError] = useState<string | null>(null);
  const [importApiError, setImportApiError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; failed: number } | null>(
    null
  );

  function resetDialog() {
    setStep("upload");
    setParseError(null);
    setMatchApiError(null);
    setImportApiError(null);
    setRows([]);
    setImportResult(null);
  }

  function handleOpen() {
    resetDialog();
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  async function readFileText(file: File): Promise<string> {
    if (typeof file.text === "function") {
      return file.text();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) ?? "");
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async function handleFile(file: File) {
    setParseError(null);
    setMatchApiError(null);

    const text = await readFileText(file);

    // Dynamic import so the mock override in tests works correctly
    const { parseCsv, bulkMatch } = await import("@/lib/bulk-material-import");

    const parsed = parseCsv(text);
    if (parsed.error) {
      setParseError(parsed.error);
      return;
    }

    setStep("matching");

    try {
      const response = await bulkMatch(parsed.rows);
      const rowStates: RowState[] = response.data.map((mr) => ({
        matchedRow: mr,
        rejected: false,
      }));
      setRows(rowStates);
      setStep("preview");
    } catch {
      setMatchApiError("Fout bij het ophalen van productmatches. Probeer het opnieuw.");
      setStep("upload");
    }
  }

  function rejectRow(index: number) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, rejected: true } : r))
    );
  }

  async function handleConfirm() {
    setImportApiError(null);
    setStep("importing");

    const { bulkImport } = await import("@/lib/bulk-material-import");

    // Only send rows that have a match AND weren't rejected
    const items: BulkImportItem[] = rows
      .filter((r) => !r.rejected && r.matchedRow.match !== null)
      .map((r) => ({
        input: r.matchedRow.input,
        match: r.matchedRow.match as ProductMatch,
      }));

    try {
      const response = await bulkImport(items);
      setImportResult(response.data ?? { imported: 0, failed: 0 });
      setStep("done");
    } catch {
      setImportApiError("Fout bij het importeren. Probeer het opnieuw.");
      setStep("preview");
    }
  }

  const acceptedCount = rows.filter((r) => !r.rejected && r.matchedRow.match !== null).length;
  const noMatchCount = rows.filter((r) => r.matchedRow.match === null).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        data-testid="bulk-import-trigger"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        <Upload className="h-4 w-4" />
        CSV importeren
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            data-testid="bulk-import-dialog"
            className="relative w-full max-w-3xl rounded-xl bg-background shadow-2xl ring-1 ring-border"
            role="dialog"
            aria-modal="true"
            aria-label="Materialen importeren via CSV"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">
                  Materialen importeren via CSV
                </h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Sluiten"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

              {/* STEP: upload */}
              {(step === "upload") && (
                <>
                  <UploadZone onFile={handleFile} />
                  {parseError && (
                    <p
                      data-testid="csv-parse-error"
                      className="flex items-center gap-2 text-sm text-destructive"
                    >
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {parseError}
                    </p>
                  )}
                  {matchApiError && (
                    <p
                      data-testid="match-api-error"
                      className="flex items-center gap-2 text-sm text-destructive"
                    >
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {matchApiError}
                    </p>
                  )}
                </>
              )}

              {/* STEP: matching (loading) */}
              {step === "matching" && (
                <div
                  data-testid="match-loading"
                  className="flex flex-col items-center justify-center py-16 gap-3"
                >
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Producten matchen…</p>
                </div>
              )}

              {/* STEP: preview */}
              {step === "preview" && (
                <>
                  {/* Summary bar */}
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>{rows.length} rijen geparseerd</span>
                    {noMatchCount > 0 && (
                      <span className="text-yellow-600 dark:text-yellow-400">
                        {noMatchCount} zonder match
                      </span>
                    )}
                    <span className="text-green-600 dark:text-green-400">
                      {acceptedCount} klaar voor import
                    </span>
                  </div>

                  {/* Preview table */}
                  <Card>
                    <CardContent className="p-0 overflow-x-auto">
                      <table
                        data-testid="match-preview-table"
                        className="w-full text-sm min-w-[640px]"
                      >
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="px-4 py-2">Invoer</th>
                            <th className="px-4 py-2">Gevonden product</th>
                            <th className="px-4 py-2">Winkel</th>
                            <th className="px-4 py-2">Prijs</th>
                            <th className="px-4 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((rowState, i) => (
                            <MatchRow
                              key={rowState.matchedRow.row_index}
                              rowState={rowState}
                              onReject={() => rejectRow(i)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>

                  {importApiError && (
                    <p
                      data-testid="import-api-error"
                      className="flex items-center gap-2 text-sm text-destructive"
                    >
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {importApiError}
                    </p>
                  )}

                  {/* Footer actions */}
                  <div className="flex justify-between pt-2">
                    <button
                      type="button"
                      data-testid="back-to-upload-btn"
                      onClick={() => { resetDialog(); }}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Terug
                    </button>
                    <button
                      type="button"
                      data-testid="confirm-import-btn"
                      disabled={acceptedCount === 0}
                      onClick={handleConfirm}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {acceptedCount} materiaal{acceptedCount !== 1 ? "en" : ""} importeren
                    </button>
                  </div>
                </>
              )}

              {/* STEP: importing */}
              {step === "importing" && (
                <div
                  className="flex flex-col items-center justify-center py-16 gap-3"
                >
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Importeren…</p>
                </div>
              )}

              {/* STEP: done */}
              {step === "done" && importResult && (
                <div
                  data-testid="import-success"
                  className="flex flex-col items-center justify-center py-16 gap-4 text-center"
                >
                  <CheckCircle className="h-14 w-14 text-green-500" />
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      Import geslaagd
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {importResult.imported} materiaal{importResult.imported !== 1 ? "en" : ""}{" "}
                      geïmporteerd
                      {importResult.failed > 0 && `, ${importResult.failed} mislukt`}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Sluiten
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
