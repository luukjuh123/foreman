import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock Next.js modules that don't work in vitest
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

// Test RootLayout renders children
describe("RootLayout", () => {
  it("renders children", async () => {
    const { default: RootLayout } = await import("@/app/layout");
    render(
      <RootLayout>
        <div data-testid="child">Hello Foreman</div>
      </RootLayout>
    );
    expect(screen.getByTestId("child")).toHaveTextContent("Hello Foreman");
  });
});

// Test Button component renders
describe("Button", () => {
  it("renders with text", async () => {
    const { Button } = await import("@/components/ui/button");
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Click me");
  });

  it("applies variant classes", async () => {
    const { Button } = await import("@/components/ui/button");
    render(<Button variant="destructive">Delete</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Delete");
    expect(btn.className).toContain("destructive");
  });
});

// Test cn utility
describe("cn", () => {
  it("merges class names", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("resolves tailwind conflicts", async () => {
    const { cn } = await import("@/lib/utils");
    const result = cn("px-2", "px-4");
    expect(result).toBe("px-4");
  });
});
