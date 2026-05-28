import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
// Static import of the real parseCsv — resolved before any vi.doMock calls
import { parseCsv as realParseCsv } from "@/lib/bulk-material-import";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/materials"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockBulkMatchResponse = {
  data: [
    {
      row_index: 0,
      input: { name: "Muurverf wit", quantity: 10, unit: "liter", description: "Voor slaapkamer" },
      match: {
        store: "hornbach",
        product_id: "h-001",
        name: "Muurverf Wit 2.5L Hornbach",
        url: "https://hornbach.nl/p/h-001",
        price_cents: 1499,
        in_stock: true,
        unit: "piece",
        confidence: 0.92,
      },
    },
    {
      row_index: 1,
      input: { name: "Schroeven M6", quantity: 100, unit: "stuks", description: "" },
      match: {
        store: "gamma",
        product_id: "g-002",
        name: "Schroeven M6x20 (100 stuks)",
        url: "https://gamma.nl/p/g-002",
        price_cents: 599,
        in_stock: true,
        unit: "piece",
        confidence: 0.85,
      },
    },
    {
      row_index: 2,
      input: { name: "Onbekend product xyz", quantity: 5, unit: "kg", description: "" },
      match: null,
    },
  ],
  error: null,
};

const mockBulkImportResponse = {
  data: { imported: 2, failed: 0 },
  error: null,
};

// ---------------------------------------------------------------------------
// Mock lib/bulk-material-import
// ---------------------------------------------------------------------------

function mockBulkLib(
  bulkMatch: ReturnType<typeof vi.fn>,
  bulkImport: ReturnType<typeof vi.fn>
) {
  vi.doMock("@/lib/bulk-material-import", () => ({
    parseCsv: (text: string) => {
      if (!text.trim()) return { rows: [], error: "Leeg bestand" };
      const lines = text.trim().split("\n");
      const header = lines[0].split(",").map((h: string) => h.trim().toLowerCase());
      if (!header.includes("name")) return { rows: [], error: "Kolom 'name' ontbreekt" };
      if (lines.length < 2) return { rows: [], error: "Geen gegevensrijen" };
      const rows = lines.slice(1).map((line: string) => {
        const cols = line.split(",").map((c: string) => c.trim());
        return {
          name: cols[header.indexOf("name")] ?? "",
          quantity: parseFloat(cols[header.indexOf("quantity")] ?? "0") || 0,
          unit: cols[header.indexOf("unit")] ?? "",
          description: cols[header.indexOf("description")] ?? "",
        };
      });
      return { rows, error: null };
    },
    bulkMatch,
    bulkImport,
  }));
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

const validCsv = `name,quantity,unit,description
Muurverf wit,10,liter,Voor slaapkamer
Schroeven M6,100,stuks,
Onbekend product xyz,5,kg,`;

const missingColumnCsv = `product,aantal,eenheid
Verf,10,l`;

function makeFile(content: string, name = "materialen.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BulkMaterialImportDialog", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ---- Dialog open/close ----

  it("renders the trigger button", async () => {
    mockBulkLib(vi.fn(), vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    expect(screen.getByTestId("bulk-import-trigger")).toBeInTheDocument();
  });

  it("opens the dialog when the trigger is clicked", async () => {
    mockBulkLib(vi.fn(), vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });
    expect(screen.getByTestId("bulk-import-dialog")).toBeInTheDocument();
  });

  it("shows the CSV upload zone after opening", async () => {
    mockBulkLib(vi.fn(), vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });
    expect(screen.getByTestId("csv-upload-zone")).toBeInTheDocument();
  });

  // ---- CSV parsing errors ----

  it("shows error when CSV is missing required column", async () => {
    mockBulkLib(vi.fn(), vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(missingColumnCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("csv-parse-error")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("shows error when empty file is uploaded", async () => {
    mockBulkLib(vi.fn(), vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("")] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("csv-parse-error")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  // ---- Match preview ----

  it("shows preview table after valid CSV is uploaded and matched", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    mockBulkLib(mockMatch, vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("match-preview-table")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("shows all parsed rows in the preview table", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    mockBulkLib(mockMatch, vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      const rows = screen.getAllByTestId("match-preview-row");
      expect(rows).toHaveLength(3);
    }, { timeout: 2000 });
  });

  it("shows 'geen match' for rows without a product match", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    mockBulkLib(mockMatch, vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("no-match-indicator")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("allows rejecting a matched row", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    mockBulkLib(mockMatch, vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("reject-match-btn")).toHaveLength(2); // only matched rows
    }, { timeout: 2000 });

    await act(async () => {
      fireEvent.click(screen.getAllByTestId("reject-match-btn")[0]);
    });

    expect(screen.getAllByTestId("match-row-rejected")).toHaveLength(1);
  });

  it("shows loading state during bulk match API call", async () => {
    let resolveMatch!: (v: typeof mockBulkMatchResponse) => void;
    const pending = new Promise<typeof mockBulkMatchResponse>((res) => { resolveMatch = res; });
    const mockMatch = vi.fn().mockReturnValue(pending);
    mockBulkLib(mockMatch, vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("match-loading")).toBeInTheDocument();
    }, { timeout: 500 });

    await act(async () => { resolveMatch(mockBulkMatchResponse); });
  });

  // ---- Confirmation / import ----

  it("shows confirm button in preview step", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    mockBulkLib(mockMatch, vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-import-btn")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("calls bulkImport with accepted rows on confirm", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    const mockImport = vi.fn().mockResolvedValue(mockBulkImportResponse);
    mockBulkLib(mockMatch, mockImport);
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-import-btn")).toBeInTheDocument();
    }, { timeout: 2000 });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-import-btn"));
    });

    await waitFor(() => {
      expect(mockImport).toHaveBeenCalledOnce();
    });

    // Should only include accepted rows (rows with a match that weren't rejected)
    const importPayload = mockImport.mock.calls[0][0];
    expect(Array.isArray(importPayload)).toBe(true);
    expect(importPayload.length).toBe(2); // 2 matched rows; 1 had no match
  });

  it("shows success message after import completes", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    const mockImport = vi.fn().mockResolvedValue(mockBulkImportResponse);
    mockBulkLib(mockMatch, mockImport);
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-import-btn")).toBeInTheDocument();
    }, { timeout: 2000 });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-import-btn"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("import-success")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("shows error message when bulk match API fails", async () => {
    const mockMatch = vi.fn().mockRejectedValue(new Error("Server error"));
    mockBulkLib(mockMatch, vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("match-api-error")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("shows error when import API fails", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    const mockImport = vi.fn().mockRejectedValue(new Error("Import failed"));
    mockBulkLib(mockMatch, mockImport);
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-import-btn")).toBeInTheDocument();
    }, { timeout: 2000 });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-import-btn"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("import-api-error")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  // ---- Back / reset ----

  it("allows going back to upload step from preview", async () => {
    const mockMatch = vi.fn().mockResolvedValue(mockBulkMatchResponse);
    mockBulkLib(mockMatch, vi.fn());
    const { default: Dialog } = await import("@/components/bulk-material-import-dialog");
    render(<Dialog />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-import-trigger"));
    });

    const input = screen.getByTestId("csv-file-input");
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile(validCsv)] } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("back-to-upload-btn")).toBeInTheDocument();
    }, { timeout: 2000 });

    await act(async () => {
      fireEvent.click(screen.getByTestId("back-to-upload-btn"));
    });

    expect(screen.getByTestId("csv-upload-zone")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// parseCsv unit tests (use statically-imported real function — no mock interference)
// ---------------------------------------------------------------------------

// parseCsv unit tests use the statically-imported real function to avoid mock interference
describe("parseCsv", () => {
  it("parses valid CSV with all required columns", () => {
    const result = realParseCsv(`name,quantity,unit,description\nMuurverf wit,10,liter,Slaapkamer`);
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      name: "Muurverf wit",
      quantity: 10,
      unit: "liter",
      description: "Slaapkamer",
    });
  });

  it("returns error when name column is missing", () => {
    const result = realParseCsv(`product,quantity,unit\nVerf,10,l`);
    expect(result.error).not.toBeNull();
    expect(result.rows).toHaveLength(0);
  });

  it("returns error for empty input", () => {
    const result = realParseCsv("");
    expect(result.error).not.toBeNull();
  });

  it("handles missing optional columns gracefully", () => {
    const result = realParseCsv(`name,quantity\nVerf,5`);
    expect(result.error).toBeNull();
    expect(result.rows[0]).toMatchObject({ name: "Verf", quantity: 5, unit: "", description: "" });
  });

  it("coerces quantity to number", () => {
    const result = realParseCsv(`name,quantity,unit\nKit,2.5,tube`);
    expect(result.rows[0].quantity).toBe(2.5);
  });

  it("defaults quantity to 0 when not parseable", () => {
    const result = realParseCsv(`name,quantity,unit\nKit,abc,tube`);
    expect(result.rows[0].quantity).toBe(0);
  });

  it("trims whitespace from values", () => {
    const result = realParseCsv(`name , quantity , unit\n  Verf  ,  3  ,  liter`);
    expect(result.rows[0]).toMatchObject({ name: "Verf", quantity: 3, unit: "liter" });
  });

  it("returns error for header-only CSV", () => {
    const result = realParseCsv(`name,quantity,unit`);
    expect(result.error).not.toBeNull();
  });
});
