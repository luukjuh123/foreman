"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Search, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  searchMaterials,
  fetchStores,
  formatPriceCents,
  type MaterialResult,
} from "@/lib/materials";

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
// Page
// ---------------------------------------------------------------------------

export default function MaterialsSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MaterialResult[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [activeStores, setActiveStores] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Load available stores on mount
  useEffect(() => {
    let cancelled = false;
    fetchStores()
      .then((res) => {
        if (cancelled) return;
        setStores(res.data);
        setActiveStores(new Set(res.data));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced search
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

      searchMaterials(query)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Search className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Materialen zoeken</h1>
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
                    {/* Product name */}
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

                    {/* Store badge */}
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

                    {/* Price */}
                    <td
                      data-testid="result-price"
                      className="px-4 py-2 font-semibold text-foreground"
                    >
                      {formatPriceCents(item.price_cents)}
                    </td>

                    {/* Stock badge */}
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

                    {/* Link icon */}
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

      {/* Initial state — no search yet */}
      {!loading && !searched && !query && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Search className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Zoek naar materialen om prijzen te vergelijken</p>
        </div>
      )}
    </div>
  );
}
