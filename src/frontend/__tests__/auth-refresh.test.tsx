import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ── apiFetch behaviour ────────────────────────────────────────────────────────

// We need the real api module (not mocked) so we can test its internals.
// Reset module registry between tests so mocks don't bleed.

describe("apiFetch – 204 No Content", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null on 204 without trying to parse JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn().mockRejectedValue(new Error("no body")),
    } as unknown as Response);

    const { apiFetch } = await import("@/lib/api");
    const result = await apiFetch("/some/endpoint");
    expect(result).toBeNull();
  });
});

describe("apiFetch – 401 auto-refresh + retry", () => {
  beforeEach(() => {
    vi.resetModules();
    // Seed localStorage with tokens
    localStorage.setItem("foreman_access_token", "old-access");
    localStorage.setItem("foreman_refresh_token", "valid-refresh");
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("retries with new token after 401 and returns data on success", async () => {
    const refreshResponse = {
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "bearer",
    };
    const successData = { id: "1", name: "Test" };

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call → 401
        return Promise.resolve({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ detail: "Token expired" }),
        } as unknown as Response);
      }
      if (callCount === 2) {
        // Refresh call → 200
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(refreshResponse),
        } as unknown as Response);
      }
      // Third call → retry with new token → 200
      return Promise.resolve({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(successData),
      } as unknown as Response);
    });

    const { apiFetch } = await import("@/lib/api");
    const result = await apiFetch("/projects");
    expect(result).toEqual(successData);
    expect(callCount).toBe(3);
    expect(localStorage.getItem("foreman_access_token")).toBe("new-access");
  });

  it("throws after 401 when refresh token is missing", async () => {
    localStorage.removeItem("foreman_refresh_token");

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ detail: "Unauthorized" }),
    } as unknown as Response);

    const { apiFetch } = await import("@/lib/api");
    await expect(apiFetch("/projects")).rejects.toThrow();
  });

  it("throws after 401 when refresh itself fails", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ detail: "Token expired" }),
        } as unknown as Response);
      }
      // Refresh call → 401 too
      return Promise.resolve({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ detail: "Invalid refresh token" }),
      } as unknown as Response);
    });

    const { apiFetch } = await import("@/lib/api");
    await expect(apiFetch("/projects")).rejects.toThrow();
  });

  it("does not fire concurrent refresh requests (promise lock)", async () => {
    const refreshResponse = {
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "bearer",
    };
    const successData = { id: "1" };

    let refreshCallCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("/auth/refresh")) {
        refreshCallCount++;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(refreshResponse),
              } as unknown as Response),
            10
          )
        );
      }
      if (refreshCallCount === 0) {
        // before refresh completes → 401
        return Promise.resolve({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ detail: "Token expired" }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(successData),
      } as unknown as Response);
    });

    const { apiFetch } = await import("@/lib/api");
    // Fire two concurrent 401-bearing requests
    await Promise.all([apiFetch("/a"), apiFetch("/b")]);
    // Refresh must only have been called once despite two concurrent 401s
    expect(refreshCallCount).toBe(1);
  });
});

// ── Dashboard auth guard ──────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/sidebar", () => ({
  default: () => <nav data-testid="sidebar" />,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle" />,
}));

vi.mock("@/components/offline-indicator", () => ({
  default: () => null,
}));

vi.mock("@/components/pwa-register", () => ({
  default: () => null,
}));

vi.mock("@/components/mobile-nav", () => ({
  default: () => null,
}));

vi.mock("@/components/mobile-time-tracker", () => ({
  default: () => null,
}));

describe("DashboardLayout auth guard", () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders children when access token is present", async () => {
    localStorage.setItem("foreman_access_token", "valid-token");
    const { default: DashboardLayout } = await import(
      "@/app/dashboard/layout"
    );
    render(
      <DashboardLayout>
        <div data-testid="content">Dashboard</div>
      </DashboardLayout>
    );
    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  it("redirects to /login when no access token", async () => {
    const { redirect } = await import("next/navigation");
    localStorage.removeItem("foreman_access_token");

    const { default: DashboardLayout } = await import(
      "@/app/dashboard/layout"
    );
    render(
      <DashboardLayout>
        <div data-testid="content">Dashboard</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(redirect).toHaveBeenCalledWith("/login");
    });
  });
});
