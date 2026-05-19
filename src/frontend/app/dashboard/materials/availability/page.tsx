"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductResult {
  store: string;
  product_id: string;
  name: string;
  url: string;
  price_cents: number;
  in_stock: boolean;
  unit: string;
}

interface SearchResponse {
  data: ProductResult[];
  error: string | null;
  query: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORE_LABELS: Record<string, string> = {
  hornbach: "Hornbach",
  gamma: "Gamma",
  praxis: "Praxis",
  bouwmaat: "Bouwmaat",
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function storeLabel(store: string): string {
  return STORE_LABELS[store.toLowerCase()] ?? store;
}

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

function ProductCard({ product }: { product: ProductResult }) {
  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={product.name}
      className="block"
    >
      <Card className="h-full cursor-pointer hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium leading-snug">
              {product.name}
            </CardTitle>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
          </div>
          <p className="text-xs text-muted-foreground">{storeLabel(product.store)}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-base font-bold text-foreground">
            {formatPrice(product.price_cents)}
          </p>

          {product.in_stock ? (
            <span
              data-testid="stock-badge-instock"
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              Op voorraad
            </span>
          ) : (
            <span
              data-testid="stock-badge-outofstock"
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}
            >
              <XCircle className="h-3 w-3" />
              Niet op voorraad
            </span>
          )}
        </CardContent>
      </Card>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PageState = "idle" | "loading" | "done" | "error";

export default function StoreAvailabilityPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [state, setState] = useState<PageState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await apiFetch<SearchResponse>(
        `/materials/search?query=${encodeURIComponent(query)}`
      );
      setResults(res.data);
      setState("done");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Onbekende fout");
      setState("error");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Beschikbaarheid per Winkel
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zoek een materiaal en vergelijk de beschikbaarheid bij Hornbach, Gamma,
          Praxis en Bouwmaat.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 max-w-xl">
        <input
          data-testid="availability-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="bijv. spijker, schroef, gipsplaat…"
          className={cn(
            "flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        />
        <Button
          data-testid="availability-search-button"
          onClick={handleSearch}
          disabled={state === "loading"}
        >
          <Search className="mr-1.5 h-4 w-4" />
          Zoeken
        </Button>
      </div>

      {/* Loading */}
      {state === "loading" && (
        <div data-testid="availability-loading" className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Zoeken…
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div
          data-testid="availability-error"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Zoeken mislukt: {errorMsg}
        </div>
      )}

      {/* Empty results */}
      {state === "done" && results.length === 0 && (
        <div data-testid="availability-empty" className="text-sm text-muted-foreground">
          Geen resultaten gevonden voor &ldquo;{query}&rdquo;.
        </div>
      )}

      {/* Results grid */}
      {state === "done" && results.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((product) => (
            <ProductCard
              key={`${product.store}-${product.product_id}`}
              product={product}
            />
          ))}
        </div>
      )}
    </div>
  );
}
