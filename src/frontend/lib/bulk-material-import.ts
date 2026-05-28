import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CsvRow {
  name: string;
  quantity: number;
  unit: string;
  description: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  error: string | null;
}

export interface ProductMatch {
  store: string;
  product_id: string;
  name: string;
  url: string;
  price_cents: number;
  in_stock: boolean;
  unit: string;
  confidence: number;
}

export interface MatchedRow {
  row_index: number;
  input: CsvRow;
  match: ProductMatch | null;
}

export interface BulkMatchResponse {
  data: MatchedRow[];
  error: string | null;
}

export interface BulkImportItem {
  input: CsvRow;
  match: ProductMatch;
}

export interface BulkImportResponse {
  data: { imported: number; failed: number } | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

export function parseCsv(text: string): CsvParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { rows: [], error: "Leeg bestand — voer een geldig CSV-bestand in." };
  }

  const lines = trimmed.split(/\r?\n/);

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());

  if (!header.includes("name")) {
    return {
      rows: [],
      error: "Verplichte kolom 'name' ontbreekt. Verwachte kolommen: name, quantity, unit, description.",
    };
  }

  if (lines.length < 2) {
    return { rows: [], error: "CSV bevat geen gegevensrijen (alleen een koptekst gevonden)." };
  }

  const nameIdx = header.indexOf("name");
  const quantityIdx = header.indexOf("quantity");
  const unitIdx = header.indexOf("unit");
  const descriptionIdx = header.indexOf("description");

  const rows: CsvRow[] = lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const rawQuantity = quantityIdx >= 0 ? (cols[quantityIdx] ?? "") : "";
    const parsed = parseFloat(rawQuantity);
    return {
      name: nameIdx >= 0 ? (cols[nameIdx] ?? "") : "",
      quantity: isNaN(parsed) ? 0 : parsed,
      unit: unitIdx >= 0 ? (cols[unitIdx] ?? "") : "",
      description: descriptionIdx >= 0 ? (cols[descriptionIdx] ?? "") : "",
    };
  });

  return { rows, error: null };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function bulkMatch(rows: CsvRow[]): Promise<BulkMatchResponse> {
  return apiFetch<BulkMatchResponse>("/materials/bulk-match", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export async function bulkImport(items: BulkImportItem[]): Promise<BulkImportResponse> {
  return apiFetch<BulkImportResponse>("/materials/bulk-import", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}
