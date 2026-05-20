import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/settings/subscription"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockSubscription = {
  id: "sub_123",
  tier: "pro",
  status: "active",
  project_limit: 50,
  current_period_end: "2026-06-19T00:00:00Z",
  trial_ends_at: null,
};

const mockUsage = {
  project_count: 12,
  user_count: 5,
  storage_bytes: 2147483648, // 2 GB
};

const mockTrialingSubscription = {
  ...mockSubscription,
  tier: "starter",
  status: "trialing",
  trial_ends_at: "2026-05-26T00:00:00Z",
};

describe("SubscriptionSettingsPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders the page heading", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByRole("heading", { name: /abonnement/i })).toBeInTheDocument();
  });

  it("displays the current plan tier name", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("plan-tier-name")).toHaveTextContent("Pro");
  });

  it("displays active status badge", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByText(/actief/i)).toBeInTheDocument();
  });

  it("renders usage stats: project count", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("usage-project-count")).toHaveTextContent("12");
  });

  it("renders usage stats: user count", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("usage-user-count")).toHaveTextContent("5");
  });

  it("renders usage stats: storage", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("usage-storage")).toBeInTheDocument();
  });

  it("shows trial banner when status is trialing", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockTrialingSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("trial-banner")).toBeInTheDocument();
  });

  it("does not show trial banner when status is active", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.queryByTestId("trial-banner")).not.toBeInTheDocument();
  });

  it("shows loading skeleton while fetching", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    render(<Page />);

    expect(screen.getByTestId("subscription-loading")).toBeInTheDocument();
  });

  it("shows period end date", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path === "/billing/subscription") return Promise.resolve(mockSubscription);
        if (path === "/billing/usage") return Promise.resolve(mockUsage);
        return Promise.reject(new Error("unknown path"));
      }),
    }));

    const { default: Page } = await import("@/app/dashboard/settings/subscription/page");

    await act(async () => {
      render(<Page />);
    });

    // Period end: 19-06-2026 in Dutch locale
    expect(screen.getByTestId("period-end-date")).toBeInTheDocument();
  });
});
