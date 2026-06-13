import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

describe("Tabs primitive", () => {
  it("renders tab triggers and activates the correct one", async () => {
    const { Tabs, TabsList, TabsTrigger, TabsContent } = await import(
      "@/components/ui/tabs"
    );
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    );
    expect(screen.getByText("Tab A")).toBeInTheDocument();
    expect(screen.getByText("Tab B")).toBeInTheDocument();
    expect(screen.getByText("Content A")).toBeInTheDocument();
  });

  it("hides inactive tab content by default", async () => {
    const { Tabs, TabsList, TabsTrigger, TabsContent } = await import(
      "@/components/ui/tabs"
    );
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    );
    expect(screen.queryByText("Content B")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

describe("Table primitive", () => {
  it("renders table with header and rows", async () => {
    const { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } =
      await import("@/components/ui/table");
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Naam</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Project Alpha</TableCell>
            <TableCell>Actief</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByText("Naam")).toBeInTheDocument();
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("Actief")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

describe("Select primitive", () => {
  it("renders with placeholder text", async () => {
    const { Select } = await import("@/components/ui/select");
    render(<Select placeholder="Kies status" options={[]} onChange={() => {}} />);
    expect(screen.getByText("Kies status")).toBeInTheDocument();
  });

  it("renders provided options", async () => {
    const { Select } = await import("@/components/ui/select");
    render(
      <Select
        placeholder="Kies status"
        options={[
          { value: "active", label: "Actief" },
          { value: "draft", label: "Concept" },
        ]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Actief")).toBeInTheDocument();
    expect(screen.getByText("Concept")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

describe("Skeleton primitive", () => {
  it("renders a skeleton element with animate-pulse", async () => {
    const { Skeleton } = await import("@/components/ui/skeleton");
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("animate-pulse");
  });
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

describe("Progress primitive", () => {
  it("renders a progress bar with correct aria attributes", async () => {
    const { Progress } = await import("@/components/ui/progress");
    render(<Progress value={60} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuenow", "60");
  });

  it("clamps value at 100", async () => {
    const { Progress } = await import("@/components/ui/progress");
    render(<Progress value={120} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps value at 0", async () => {
    const { Progress } = await import("@/components/ui/progress");
    render(<Progress value={-10} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });
});

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

describe("EmptyState primitive", () => {
  it("renders title and description", async () => {
    const { EmptyState } = await import("@/components/ui/empty-state");
    render(
      <EmptyState title="Geen projecten" description="Voeg een project toe om te beginnen." />
    );
    expect(screen.getByText("Geen projecten")).toBeInTheDocument();
    expect(screen.getByText("Voeg een project toe om te beginnen.")).toBeInTheDocument();
  });

  it("renders optional action children", async () => {
    const { EmptyState } = await import("@/components/ui/empty-state");
    render(
      <EmptyState title="Leeg" description="Geen items.">
        <button>Toevoegen</button>
      </EmptyState>
    );
    expect(screen.getByRole("button", { name: /toevoegen/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------

describe("PageHeader primitive", () => {
  it("renders title and description", async () => {
    const { PageHeader } = await import("@/components/ui/page-header");
    render(<PageHeader title="Projecten" description="Overzicht van alle projecten" />);
    expect(screen.getByText("Projecten")).toBeInTheDocument();
    expect(screen.getByText("Overzicht van alle projecten")).toBeInTheDocument();
  });

  it("renders actions slot", async () => {
    const { PageHeader } = await import("@/components/ui/page-header");
    render(
      <PageHeader title="Projecten" actions={<button>Nieuw</button>} />
    );
    expect(screen.getByRole("button", { name: /nieuw/i })).toBeInTheDocument();
  });
});
