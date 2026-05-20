import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/materials/shopping-list"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function importPage() {
  // Dynamic import so localStorage mock is in place before module loads
  const { default: ShoppingListPage } = await import(
    "@/app/dashboard/materials/shopping-list/page"
  );
  return ShoppingListPage;
}

function addItem(name: string, quantity: string, unit: string) {
  fireEvent.change(screen.getByPlaceholderText(/materiaal/i), {
    target: { value: name },
  });
  fireEvent.change(screen.getByPlaceholderText(/aantal/i), {
    target: { value: quantity },
  });
  fireEvent.change(screen.getByPlaceholderText(/eenheid/i), {
    target: { value: unit },
  });
  fireEvent.click(screen.getByRole("button", { name: /toevoegen/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ShoppingListPage", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("renders the page heading in Dutch", async () => {
    const Page = await importPage();
    render(<Page />);
    expect(screen.getByRole("heading", { name: /boodschappenlijst/i })).toBeInTheDocument();
  });

  it("renders input fields for name, quantity and unit", async () => {
    const Page = await importPage();
    render(<Page />);
    expect(screen.getByPlaceholderText(/materiaal/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/aantal/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/eenheid/i)).toBeInTheDocument();
  });

  it("adds an item to the list when Toevoegen is clicked", async () => {
    const Page = await importPage();
    render(<Page />);

    addItem("Cement", "10", "kg");

    expect(screen.getByText("Cement")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("kg")).toBeInTheDocument();
  });

  it("clears input fields after adding an item", async () => {
    const Page = await importPage();
    render(<Page />);

    addItem("Zand", "5", "m³");

    expect(screen.getByPlaceholderText(/materiaal/i)).toHaveValue("");
    expect(screen.getByPlaceholderText(/aantal/i)).toHaveValue("");
    expect(screen.getByPlaceholderText(/eenheid/i)).toHaveValue("");
  });

  it("removes an item when the delete button is clicked", async () => {
    const Page = await importPage();
    render(<Page />);

    addItem("Staal", "2", "m");

    expect(screen.getByText("Staal")).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", { name: /verwijder/i });
    fireEvent.click(deleteButtons[0]);

    expect(screen.queryByText("Staal")).not.toBeInTheDocument();
  });

  it("toggles purchased checkbox for an item", async () => {
    const Page = await importPage();
    render(<Page />);

    addItem("Verf", "3", "liter");

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("clears all items when Alles wissen is clicked", async () => {
    const Page = await importPage();
    render(<Page />);

    addItem("Cement", "10", "kg");
    addItem("Zand", "5", "m³");

    expect(screen.getByText("Cement")).toBeInTheDocument();
    expect(screen.getByText("Zand")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /alles wissen/i }));

    expect(screen.queryByText("Cement")).not.toBeInTheDocument();
    expect(screen.queryByText("Zand")).not.toBeInTheDocument();
  });

  it("persists items in localStorage after add", async () => {
    const Page = await importPage();
    render(<Page />);

    addItem("Hout", "20", "m");

    const stored = JSON.parse(localStorageMock.getItem("foreman_shopping_list") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Hout");
    expect(stored[0].quantity).toBe("20");
    expect(stored[0].unit).toBe("m");
  });

  it("loads items from localStorage on mount", async () => {
    localStorageMock.setItem(
      "foreman_shopping_list",
      JSON.stringify([{ id: "abc", name: "Beton", quantity: "1", unit: "m³", purchased: false }])
    );

    const Page = await importPage();
    render(<Page />);

    expect(screen.getByText("Beton")).toBeInTheDocument();
  });

  describe("store deep-links per item", () => {
    it("shows Hornbach link for each item", async () => {
      const Page = await importPage();
      render(<Page />);

      addItem("Dakpan", "50", "stuks");

      const hornbachLink = screen.getByRole("link", { name: /hornbach/i });
      expect(hornbachLink).toHaveAttribute(
        "href",
        "https://www.hornbach.nl/zoeken/?q=Dakpan"
      );
      expect(hornbachLink).toHaveAttribute("target", "_blank");
    });

    it("shows Gamma link for each item", async () => {
      const Page = await importPage();
      render(<Page />);

      addItem("Schroef", "100", "stuks");

      const gammaLink = screen.getByRole("link", { name: /gamma/i });
      expect(gammaLink).toHaveAttribute(
        "href",
        "https://www.gamma.nl/zoeken?text=Schroef"
      );
      expect(gammaLink).toHaveAttribute("target", "_blank");
    });

    it("shows Praxis link for each item", async () => {
      const Page = await importPage();
      render(<Page />);

      addItem("Lijm", "2", "liter");

      const praxisLink = screen.getByRole("link", { name: /praxis/i });
      expect(praxisLink).toHaveAttribute(
        "href",
        "https://www.praxis.nl/zoeken?q=Lijm"
      );
      expect(praxisLink).toHaveAttribute("target", "_blank");
    });

    it("shows Bouwmaat link for each item", async () => {
      const Page = await importPage();
      render(<Page />);

      addItem("Isolatie", "10", "m²");

      const bouwmaatLink = screen.getByRole("link", { name: /bouwmaat/i });
      expect(bouwmaatLink).toHaveAttribute(
        "href",
        "https://www.bouwmaat.nl/search?q=Isolatie"
      );
      expect(bouwmaatLink).toHaveAttribute("target", "_blank");
    });

    it("encodes spaces in store deep-links", async () => {
      const Page = await importPage();
      render(<Page />);

      addItem("Muur verf", "2", "liter");

      const hornbachLink = screen.getByRole("link", { name: /hornbach/i });
      expect(hornbachLink.getAttribute("href")).toContain("Muur%20verf");
    });
  });

  it("does not add item when name is empty", async () => {
    const Page = await importPage();
    render(<Page />);

    fireEvent.change(screen.getByPlaceholderText(/aantal/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /toevoegen/i }));

    // No rows in table body other than header
    expect(screen.queryByRole("row", { name: /verwijder/i })).not.toBeInTheDocument();
  });

  it("shows a link to the calculator page", async () => {
    const Page = await importPage();
    render(<Page />);

    const calcLink = screen.getByRole("link", { name: /rekenmachine/i });
    expect(calcLink).toBeInTheDocument();
  });
});
