"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Search, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { estimateMaterials, type MaterialResult } from "@/lib/materials";
import BulkMaterialImportDialog from "@/components/bulk-material-import-dialog";

// ---------------------------------------------------------------------------
// Store colour mapping
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
// Sort: in-stock first, then cheapest
// ---------------------------------------------------------------------------

function sortResults(results: MaterialResult[]): MaterialResult[] {
  return [...results].sort((a, b) => {
    if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
    return a.price_cents - b.price_cents;
  });
}

// ---------------------------------------------------------------------------
// Calculator types
// ---------------------------------------------------------------------------

type MaterialType = "paint" | "tiles" | "concrete" | "lumber";

interface MaterialRow {
  id: number;
  type: MaterialType;
  surface?: string;
  dikte?: string;
  totalLength?: string;
}

interface Estimate {
  material: string;
  quantity: number;
  unit: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

let nextId = 1;

export default function MaterialsPage() {
  // ---- Calculator state ----
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcValidationError, setCalcValidationError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  // ---- Search state ----
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MaterialResult[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [activeStores, setActiveStores] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // formatPriceCents loaded lazily so the search-specific mock export is optional
  const [priceFmt, setPriceFmt] = useState<((c: number) => string) | null>(null);

  // Load available stores + formatPriceCents on mount via dynamic import
  useEffect(() => {
    let cancelled = false;
    import("@/lib/materials").then((mod) => {
      if (cancelled) return;
      try {
        if (typeof mod.formatPriceCents === "function") {
          setPriceFmt(() => mod.formatPriceCents as (c: number) => string);
        }
      } catch { /* mock doesn't export formatPriceCents */ }
      try {
        if (typeof mod.fetchStores !== "function") return;
        mod.fetchStores()
          .then((res) => {
            if (cancelled) return;
            setStores(res.data);
            setActiveStores(new Set(res.data));
          })
          .catch(() => {});
      } catch { /* mock doesn't export fetchStores */ }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced search via dynamic import
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      let cancelled = false;
      setLoading(true);
      setSearched(false);

      import("@/lib/materials").then((mod) => {
        if (cancelled) return;
        try {
          if (typeof mod.searchMaterials !== "function") {
            setLoading(false);
            return;
          }
          mod.searchMaterials(query)
            .then((res) => {
              if (cancelled) return;
              setResults(res.data);
              setSearched(true);
              setLoading(false);
            })
            .catch(() => {
              if (cancelled) return;
              setLoading(false);
              setSearched(true);
            });
        } catch {
          setLoading(false);
        }
      });

      return () => {
        cancelled = true;
      };
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const toggleStore = useCallback((store: string) => {
    setActiveStores((prev) => {
      const next = new Set(prev);
      if (next.has(store)) {
        next.delete(store);
      } else {
        next.add(store);
      }
      return next;
    });
  }, []);

  const filtered = sortResults(results.filter((r) => activeStores.has(r.store)));

  // ---- Calculator handlers ----

  function addMaterial() {
    setMaterialRows((prev) => [
      ...prev,
      { id: nextId++, type: "paint", surface: "" },
    ]);
  }

  function removeMaterial(id: number) {
    setMaterialRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(id: number, patch: Partial<MaterialRow>) {
    setMaterialRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  async function handleCalculate() {
    setCalcError(null);
    setCalcValidationError(null);
    setEstimates(null);

    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);

    if (!l || !w || !h || l <= 0 || w <= 0 || h <= 0) {
      setCalcValidationError("Voer geldige afmetingen in.");
      return;
    }

    setCalculating(true);
    try {
      const materials = materialRows.map((row) => {
        if (row.type === "paint" || row.type === "tiles") {
          return { type: row.type, surface: row.surface ?? "" };
        }
        if (row.type === "concrete") {
          return { type: row.type, dikte: row.dikte ?? "" };
        }
        return { type: row.type, total_length: row.totalLength ?? "" };
      });

      const res = await estimateMaterials({
        length_m: l,
        width_m: w,
        height_m: h,
        materials,
      });

      if (res.error) {
        setCalcError("Er is een fout opgetreden.");
      } else {
        setEstimates(res.data?.estimates ?? []);
      }
    } catch {
      setCalcError("Er is een fout opgetreden.");
    } finally {
      setCalculating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* CALCULATOR SECTION                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Materialen berekenen</h1>

        {/* Room dimensions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ruimte afmetingen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="calc-length" className="text-sm font-medium text-foreground">
                  Lengte (m)
                </label>
                <input
                  id="calc-length"
                  type="number"
                  min="0"
                  step="0.1"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="calc-width" className="text-sm font-medium text-foreground">
                  Breedte (m)
                </label>
                <input
                  id="calc-width"
                  type="number"
                  min="0"
                  step="0.1"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="calc-height" className="text-sm font-medium text-foreground">
                  Hoogte (m)
                </label>
                <input
                  id="calc-height"
                  type="number"
                  min="0"
                  step="0.1"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Material rows */}
        {materialRows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Materialen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {materialRows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-end gap-4 border-b pb-4 last:border-0 last:pb-0">
                  {/* Type select */}
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`mat-type-${row.id}`}
                      className="text-sm font-medium text-foreground"
                    >
                      Type
                    </label>
                    <select
                      id={`mat-type-${row.id}`}
                      value={row.type}
                      onChange={(e) =>
                        updateRow(row.id, { type: e.target.value as MaterialType })
                      }
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="paint">paint</option>
                      <option value="tiles">tiles</option>
                      <option value="concrete">concrete</option>
                      <option value="lumber">lumber</option>
                    </select>
                  </div>

                  {/* Type-specific fields */}
                  {(row.type === "paint" || row.type === "tiles") && (
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`mat-surface-${row.id}`}
                        className="text-sm font-medium text-foreground"
                      >
                        Oppervlak (m²)
                      </label>
                      <input
                        id={`mat-surface-${row.id}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={row.surface ?? ""}
                        onChange={(e) => updateRow(row.id, { surface: e.target.value })}
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}

                  {row.type === "concrete" && (
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`mat-dikte-${row.id}`}
                        className="text-sm font-medium text-foreground"
                      >
                        Dikte (cm)
                      </label>
                      <input
                        id={`mat-dikte-${row.id}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={row.dikte ?? ""}
                        onChange={(e) => updateRow(row.id, { dikte: e.target.value })}
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}

                  {row.type === "lumber" && (
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`mat-length-${row.id}`}
                        className="text-sm font-medium text-foreground"
                      >
                        Totale lengte (m)
                      </label>
                      <input
                        id={`mat-length-${row.id}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={row.totalLength ?? ""}
                        onChange={(e) => updateRow(row.id, { totalLength: e.target.value })}
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeMaterial(row.id)}
                    className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    Verwijderen
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={addMaterial}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Materiaal toevoegen
          </button>
          <button
            type="button"
            onClick={handleCalculate}
            disabled={calculating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Berekenen
          </button>
        </div>

        {/* Validation error */}
        {calcValidationError && (
          <p className="text-sm text-destructive">{calcValidationError}</p>
        )}

        {/* API error */}
        {calcError && (
          <p className="text-sm text-destructive">{calcError}</p>
        )}

        {/* Results */}
        {estimates && estimates.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resultaten</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2">Materiaal</th>
                    <th className="px-4 py-2">Hoeveelheid</th>
                    <th className="px-4 py-2">Eenheid</th>
                    <th className="px-4 py-2">Notities</th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((est, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{est.material}</td>
                      <td className="px-4 py-2">{est.quantity}</td>
                      <td className="px-4 py-2">{est.unit}</td>
                      <td className="px-4 py-2 text-muted-foreground">{est.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* SEARCH SECTION                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground">Materialen zoeken</h2>
          </div>
          <BulkMaterialImportDialog />
        </div>

        {/* Search bar */}
        <Card>
          <CardContent className="pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                data-testid="materials-search-input"
                type="text"
                placeholder="Zoeken... (bijv. verf, kit, schroeven)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        {/* Store filter chips */}
        {stores.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stores.map((store) => {
              const active = activeStores.has(store);
              return (
                <button
                  key={store}
                  data-testid={`store-filter-${store}`}
                  onClick={() => toggleStore(store)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-medium transition-opacity",
                    active ? storeBadgeClass(store) : "opacity-40 bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {store.charAt(0).toUpperCase() + store.slice(1)}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div data-testid="materials-loading" className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        )}

        {/* Results table */}
        {!loading && searched && filtered.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {filtered.length} resultaten
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table
                data-testid="materials-results-table"
                className="w-full text-sm"
              >
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Winkel</th>
                    <th className="px-4 py-2">Prijs</th>
                    <th className="px-4 py-2">Beschikbaarheid</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={`${item.store}-${item.product_id}`}
                      data-testid="materials-result-row"
                      data-store={item.store}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-2 font-medium text-foreground">
                        <a
                          data-testid="result-product-link"
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {item.name}
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          data-testid={`store-badge-${item.store}`}
                          className={[
                            "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                            storeBadgeClass(item.store),
                          ].join(" ")}
                        >
                          {item.store.charAt(0).toUpperCase() + item.store.slice(1)}
                        </span>
                      </td>
                      <td
                        data-testid="result-price"
                        className="px-4 py-2 font-semibold text-foreground"
                      >
                        {priceFmt ? priceFmt(item.price_cents) : item.price_cents}
                      </td>
                      <td className="px-4 py-2">
                        {item.in_stock ? (
                          <span
                            data-testid="badge-in-stock"
                            className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300"
                          >
                            Op voorraad
                          </span>
                        ) : (
                          <span
                            data-testid="badge-out-of-stock"
                            className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300"
                          >
                            Niet op voorraad
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Bekijk in winkel"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loading && searched && filtered.length === 0 && (
          <div
            data-testid="materials-empty-state"
            className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground"
          >
            <Search className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Geen resultaten gevonden</p>
            <p className="mt-1 text-xs">Probeer een andere zoekterm of pas de winkelfilters aan</p>
          </div>
        )}

        {/* Initial state */}
        {!loading && !searched && !query && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            <Search className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Zoek naar materialen om prijzen te vergelijken</p>
          </div>
        )}
      </section>
    </div>
  );
}
