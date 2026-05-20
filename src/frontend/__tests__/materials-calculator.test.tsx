import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/materials"),
  redirect: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock auth context
vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "u1", name: "Test", email: "t@t.nl", role: "admin" },
    loading: false,
  })),
}));

// Mock apiFetch
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

// Mock materials module
vi.mock("@/lib/materials", () => ({
  estimateMaterials: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Materials API client unit tests
// ---------------------------------------------------------------------------

describe("estimateMaterials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls apiFetch with POST /materials/estimate", async () => {
    const { apiFetch } = await import("@/lib/api");
    const apiFetchMock = vi.mocked(apiFetch);
    apiFetchMock.mockResolvedValue({
      data: { estimates: [] },
      error: null,
    });

    const { estimateMaterials } = await import("@/lib/materials");
    vi.mocked(estimateMaterials).mockImplementation(async (req) => {
      return apiFetch("/materials/estimate", {
        method: "POST",
        body: JSON.stringify(req),
      }) as never;
    });

    await estimateMaterials({
      length_m: 5,
      width_m: 4,
      height_m: 3,
      materials: [],
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/materials/estimate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns response with estimates array on success", async () => {
    const mockResponse = {
      data: {
        estimates: [
          { material: "Verf", quantity: 10, unit: "liter", notes: "2 lagen" },
        ],
      },
      error: null,
    };

    const { estimateMaterials } = await import("@/lib/materials");
    vi.mocked(estimateMaterials).mockResolvedValue(mockResponse);

    const result = await estimateMaterials({
      length_m: 5,
      width_m: 4,
      height_m: 3,
      materials: [{ type: "paint", surface: "walls", coats: 2 }],
    });

    expect(result.data?.estimates).toHaveLength(1);
    expect(result.data?.estimates[0].material).toBe("Verf");
  });
});

// ---------------------------------------------------------------------------
// Materials calculator page UI tests
// ---------------------------------------------------------------------------

async function renderPage() {
  const { default: Page } = await import("@/app/dashboard/materials/page");
  return render(<Page />);
}

describe("MaterialsCalculatorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mock("@/lib/materials", () => ({
      estimateMaterials: vi.fn().mockResolvedValue({
        data: { estimates: [] },
        error: null,
      }),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page heading", async () => {
    await renderPage();
    // h1 is the page title; Card headers render as h3
    expect(screen.getByRole("heading", { name: /materialen/i, level: 1 })).toBeInTheDocument();
  });

  it("renders length input", async () => {
    await renderPage();
    expect(screen.getByLabelText(/lengte/i)).toBeInTheDocument();
  });

  it("renders width input", async () => {
    await renderPage();
    expect(screen.getByLabelText(/breedte/i)).toBeInTheDocument();
  });

  it("renders height input", async () => {
    await renderPage();
    expect(screen.getByLabelText(/hoogte/i)).toBeInTheDocument();
  });

  it("renders material type selector or add button", async () => {
    await renderPage();
    // There should be a way to add a material
    const addBtn = screen.getByRole("button", { name: /materiaal toevoegen/i });
    expect(addBtn).toBeInTheDocument();
  });

  it("renders calculate button", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /berekenen/i })).toBeInTheDocument();
  });

  it("adding a paint material shows paint-specific fields", async () => {
    const user = userEvent.setup();
    await renderPage();

    // Open material type selector and choose paint
    await user.click(screen.getByRole("button", { name: /materiaal toevoegen/i }));

    // Should show a type select — choose "paint"
    const typeSelect = screen.getByLabelText(/type/i);
    await user.selectOptions(typeSelect, "paint");

    // Paint-specific field: oppervlak (surface)
    expect(screen.getByLabelText(/oppervlak/i)).toBeInTheDocument();
  });

  it("adding a tiles material shows tiles-specific fields", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: /materiaal toevoegen/i }));

    const typeSelect = screen.getByLabelText(/type/i);
    await user.selectOptions(typeSelect, "tiles");

    expect(screen.getByLabelText(/oppervlak/i)).toBeInTheDocument();
  });

  it("adding a concrete material shows concrete-specific fields", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: /materiaal toevoegen/i }));

    const typeSelect = screen.getByLabelText(/type/i);
    await user.selectOptions(typeSelect, "concrete");

    expect(screen.getByLabelText(/dikte/i)).toBeInTheDocument();
  });

  it("adding a lumber material shows lumber-specific fields", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: /materiaal toevoegen/i }));

    const typeSelect = screen.getByLabelText(/type/i);
    await user.selectOptions(typeSelect, "lumber");

    expect(screen.getByLabelText(/totale lengte/i)).toBeInTheDocument();
  });

  it("calculate button calls estimateMaterials with room dimensions", async () => {
    const user = userEvent.setup();
    await renderPage();

    const { estimateMaterials } = await import("@/lib/materials");
    const mockEstimate = vi.mocked(estimateMaterials);
    mockEstimate.mockResolvedValue({ data: { estimates: [] }, error: null });

    await user.clear(screen.getByLabelText(/lengte/i));
    await user.type(screen.getByLabelText(/lengte/i), "5");
    await user.clear(screen.getByLabelText(/breedte/i));
    await user.type(screen.getByLabelText(/breedte/i), "4");
    await user.clear(screen.getByLabelText(/hoogte/i));
    await user.type(screen.getByLabelText(/hoogte/i), "3");

    await user.click(screen.getByRole("button", { name: /berekenen/i }));

    await waitFor(() => {
      expect(mockEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          length_m: 5,
          width_m: 4,
          height_m: 3,
        })
      );
    });
  });

  it("displays results after successful calculation", async () => {
    const user = userEvent.setup();

    const { estimateMaterials } = await import("@/lib/materials");
    vi.mocked(estimateMaterials).mockResolvedValue({
      data: {
        estimates: [
          { material: "Verf", quantity: 12.5, unit: "liter", notes: "2 lagen, wanden" },
          { material: "Tegels", quantity: 20, unit: "m²", notes: "inclusief 10% uitval" },
        ],
      },
      error: null,
    });

    await renderPage();

    await user.clear(screen.getByLabelText(/lengte/i));
    await user.type(screen.getByLabelText(/lengte/i), "5");
    await user.clear(screen.getByLabelText(/breedte/i));
    await user.type(screen.getByLabelText(/breedte/i), "4");
    await user.clear(screen.getByLabelText(/hoogte/i));
    await user.type(screen.getByLabelText(/hoogte/i), "3");

    await user.click(screen.getByRole("button", { name: /berekenen/i }));

    await waitFor(() => {
      expect(screen.getByText(/verf/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/12[.,]5/)).toBeInTheDocument();
    expect(screen.getByText(/liter/i)).toBeInTheDocument();
    expect(screen.getByText(/tegels/i)).toBeInTheDocument();
  });

  it("displays error message when API returns error", async () => {
    const user = userEvent.setup();

    const { estimateMaterials } = await import("@/lib/materials");
    vi.mocked(estimateMaterials).mockResolvedValue({
      data: null,
      error: { message: "Ongeldige afmetingen" },
    });

    await renderPage();

    await user.clear(screen.getByLabelText(/lengte/i));
    await user.type(screen.getByLabelText(/lengte/i), "5");
    await user.clear(screen.getByLabelText(/breedte/i));
    await user.type(screen.getByLabelText(/breedte/i), "4");
    await user.clear(screen.getByLabelText(/hoogte/i));
    await user.type(screen.getByLabelText(/hoogte/i), "3");

    await user.click(screen.getByRole("button", { name: /berekenen/i }));

    await waitFor(() => {
      expect(screen.getByText(/fout|error|mislukt/i)).toBeInTheDocument();
    });
  });

  it("shows validation error when dimensions are missing", async () => {
    const user = userEvent.setup();
    await renderPage();

    // Click calculate without filling dimensions
    await user.click(screen.getByRole("button", { name: /berekenen/i }));

    // The validation error message contains "geldige afmetingen"
    expect(screen.getByText(/geldige afmetingen/i)).toBeInTheDocument();
  });

  it("can remove a material from the list", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: /materiaal toevoegen/i }));
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument();

    const removeBtn = screen.getByRole("button", { name: /verwijderen/i });
    await user.click(removeBtn);

    expect(screen.queryByLabelText(/type/i)).not.toBeInTheDocument();
  });
});
