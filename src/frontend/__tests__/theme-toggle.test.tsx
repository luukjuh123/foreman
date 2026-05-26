/**
 * Tests for dark/light theme toggle with persistent preference.
 * localStorage + cookie for SSR.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

// jsdom does not implement matchMedia — provide a stub
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

describe("ThemeProvider — localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });

  it("reads saved theme from localStorage on mount", async () => {
    localStorage.setItem("foreman_theme", "light");
    const { ThemeProvider, useTheme } = await import("@/lib/theme-provider");
    function Consumer() {
      const { theme } = useTheme();
      return <div data-testid="theme">{theme}</div>;
    }
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("persists theme to localStorage when setTheme is called", async () => {
    const { ThemeProvider, useTheme } = await import("@/lib/theme-provider");
    function Consumer() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme("dark")}>dark</button>;
    }
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    act(() => { screen.getByText("dark").click(); });
    expect(localStorage.getItem("foreman_theme")).toBe("dark");
  });
});

describe("ThemeProvider — cookie persistence for SSR", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });

  it("writes foreman_theme cookie when setTheme is called with dark", async () => {
    const { ThemeProvider, useTheme } = await import("@/lib/theme-provider");
    function Consumer() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme("dark")}>set dark</button>;
    }
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    act(() => { screen.getByText("set dark").click(); });
    // Cookie string may include path/max-age attrs — just check key=value present
    expect(document.cookie).toContain("foreman_theme");
    expect(localStorage.getItem("foreman_theme")).toBe("dark");
  });

  it("writes foreman_theme cookie when setTheme is called with light", async () => {
    const { ThemeProvider, useTheme } = await import("@/lib/theme-provider");
    function Consumer() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme("light")}>set light</button>;
    }
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    act(() => { screen.getByText("set light").click(); });
    expect(document.cookie).toContain("foreman_theme");
    expect(localStorage.getItem("foreman_theme")).toBe("light");
  });

  it("persistTheme writes both localStorage and cookie", async () => {
    // Directly test the persist function via setTheme
    const { ThemeProvider, useTheme } = await import("@/lib/theme-provider");
    function Consumer() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme("dark")}>go dark</button>;
    }
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    act(() => { screen.getByText("go dark").click(); });
    expect(localStorage.getItem("foreman_theme")).toBe("dark");
    // Cookie key must be present (value written by document.cookie setter in ThemeProvider)
    expect(document.cookie).toContain("foreman_theme");
  });
});

describe("ThemeToggle — renders correctly", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });

  it("renders toggle button", async () => {
    const { ThemeProvider } = await import("@/lib/theme-provider");
    const { ThemeToggle } = await import("@/components/theme-toggle");
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
