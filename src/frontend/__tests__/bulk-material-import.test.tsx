import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/materials/import"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Top-level mutable mock so we can swap the implementation per describe/it
let mockSearchMaterials = vi.fn();

vi.mock("@/lib/materials", () => ({
  searchMaterials: (...args: unknown[]) => mockSearchMaterials(...args),
  formatPriceCents: (cents: number) =>
    new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(cents / 100),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockSearchResult = {
  store: "hornbach",
  product_id: "h-001",
  name: "Houtschroeven 4x40mm (200st)",
  url: "https://hornbach.nl/p/h-001",
  price_cents: 599,
  in_stock: true,
  unit: "piece",
};

const mockSearchResult2 = {
  store: "gamma",
  product_id: "g-002",
  name: "Multiplex plaat 18mm",
  url: "https://gamma.nl/p/g-002",
  price_cents: 2499,
  in_stock: true,
  unit: "m2",
};

// ---------------------------------------------------------------------------
// Import page (static — module cache is fine because the mock is top-level)
// ---------------------------------------------------------------------------

import ImportPage from "@/app/dashboard/materials/import/page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCSVFile(content: string, filename = "materials.csv"): File {
  return new File([content], filename, { type: "text/csv" });
}

function uploadFile(file: File) {
  const input = screen.getByTestId("csv-file-input");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

// ---------------------------------------------------------------------------
// Tests: CSV parsing
// ---------------------------------------------------------------------------

describe("BulkMaterialImport — CSV parsing", () => {
  beforeEach(() => {
    mockSearchMaterials = vi.fn().mockResolvedValue({ data: [mockSearchResult] });
  });

  it("shows upload area on initial render", () => {
    render(<ImportPage />);
    expect(screen.getByText(/csv.*uploaden|uploaden/i)).toBeTruthy();
    expect(screen.getByTestId("csv-file-input")).toBeTruthy();
  });

  it("parses a valid CSV with name, quantity, unit columns", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nHoutschroeven 4x40mm,10,zak\nMultiplex plaat 18mm,5,m2";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByText("Houtschroeven 4x40mm")).toBeTruthy();
      expect(screen.getByText("Multiplex plaat 18mm")).toBeTruthy();
    });
  });

  it("shows parsed quantity and unit in preview table", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nHoutschroeven 4x40mm,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByText("10")).toBeTruthy();
      expect(screen.getByText("zak")).toBeTruthy();
    });
  });

  it("shows error when CSV has no header row matching expected columns", async () => {
    render(<ImportPage />);

    const csv = "product,aantal,soort\nSchroeven,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByTestId("csv-error")).toBeTruthy();
    });
  });

  it("shows error when CSV file is empty", async () => {
    render(<ImportPage />);

    await act(async () => {
      uploadFile(makeCSVFile(""));
    });

    await waitFor(() => {
      expect(screen.getByTestId("csv-error")).toBeTruthy();
    });
  });

  it("shows error when CSV has header but no data rows", async () => {
    render(<ImportPage />);

    await act(async () => {
      uploadFile(makeCSVFile("name,quantity,unit\n"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("csv-error")).toBeTruthy();
    });
  });

  it("ignores rows where name is blank", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nHoutschroeven,10,zak\n,5,m2\nMultiplex,3,stuk";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByText("Houtschroeven")).toBeTruthy();
      expect(screen.getByText("Multiplex")).toBeTruthy();
    });
    // Only 2 data rows (blank-name row filtered out)
    expect(screen.getAllByTestId("import-row")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: Preview table rendering
// ---------------------------------------------------------------------------

describe("BulkMaterialImport — preview table", () => {
  beforeEach(() => {
    mockSearchMaterials = vi.fn().mockResolvedValue({ data: [] });
  });

  it("renders preview table after valid CSV upload", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nBetonschroeven M6,20,stuk\nHoutlijm 750ml,3,fles";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByTestId("import-preview-table")).toBeTruthy();
      expect(screen.getAllByTestId("import-row")).toHaveLength(2);
    });
  });

  it("shows column headers: Naam, Aantal, Eenheid", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nSchroeven,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      const table = screen.getByTestId("import-preview-table");
      expect(table.querySelector("th:nth-child(1)")?.textContent).toBe("Naam");
      expect(table.querySelector("th:nth-child(2)")?.textContent).toBe("Aantal");
      expect(table.querySelector("th:nth-child(3)")?.textContent).toBe("Eenheid");
    });
  });

  it("shows a reset button to upload a new CSV after parsing", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nSchroeven,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByTestId("reset-csv-button")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Search results / matching
// ---------------------------------------------------------------------------

describe("BulkMaterialImport — search results", () => {
  beforeEach(() => {
    mockSearchMaterials = vi.fn().mockImplementation((name: string) => {
      if (name === "Houtschroeven 4x40mm") {
        return Promise.resolve({ data: [mockSearchResult] });
      }
      if (name === "Multiplex plaat 18mm") {
        return Promise.resolve({ data: [mockSearchResult2] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it("calls searchMaterials for each CSV row name", async () => {
    render(<ImportPage />);

    const csv =
      "name,quantity,unit\nHoutschroeven 4x40mm,10,zak\nMultiplex plaat 18mm,5,m2";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(mockSearchMaterials).toHaveBeenCalledWith("Houtschroeven 4x40mm");
      expect(mockSearchMaterials).toHaveBeenCalledWith("Multiplex plaat 18mm");
    });
  });

  it("displays matched product name in the row", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nHoutschroeven 4x40mm,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      // The select option contains the matched product name
      expect(screen.getByText(/Houtschroeven 4x40mm \(200st\)/)).toBeTruthy();
    });
  });

  it("displays price for matched product", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nHoutschroeven 4x40mm,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByTestId("match-price-0")).toBeTruthy();
    });
  });

  it("shows 'Geen overeenkomst' when search returns no results", async () => {
    mockSearchMaterials = vi.fn().mockResolvedValue({ data: [] });

    render(<ImportPage />);

    const csv = "name,quantity,unit\nOnbestaand product xyz,1,stuk";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByText(/geen overeenkomst/i)).toBeTruthy();
    });
  });

  it("allows selecting a match via select within a row", async () => {
    mockSearchMaterials = vi.fn().mockResolvedValue({
      data: [
        mockSearchResult,
        { ...mockSearchResult, product_id: "h-002", name: "Schroef alternatief", price_cents: 799 },
      ],
    });

    render(<ImportPage />);

    const csv = "name,quantity,unit\nHoutschroeven 4x40mm,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByTestId("match-select-0")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Error states
// ---------------------------------------------------------------------------

describe("BulkMaterialImport — error states", () => {
  beforeEach(() => {
    mockSearchMaterials = vi.fn().mockRejectedValue(new Error("Network error"));
  });

  it("shows network error indicator per row when searchMaterials rejects", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nSchroeven,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByTestId("match-error-0")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Summary and add-to-shopping-list
// ---------------------------------------------------------------------------

describe("BulkMaterialImport — summary and add to list", () => {
  beforeEach(() => {
    mockSearchMaterials = vi.fn().mockResolvedValue({ data: [mockSearchResult] });
  });

  it("shows a total estimated cost summary after matching", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nHoutschroeven 4x40mm,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(screen.getByTestId("total-cost-summary")).toBeTruthy();
    });
  });

  it("renders the 'Toevoegen aan boodschappenlijst' button", async () => {
    render(<ImportPage />);

    const csv = "name,quantity,unit\nHoutschroeven 4x40mm,10,zak";
    await act(async () => {
      uploadFile(makeCSVFile(csv));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /toevoegen aan boodschappenlijst/i })
      ).toBeTruthy();
    });
  });
});
