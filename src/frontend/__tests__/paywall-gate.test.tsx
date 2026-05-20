import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as billingLib from "@/lib/billing";

// Mock Next.js Link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock billing lib — vi.fn() stubs controlled per-test
vi.mock("@/lib/billing", () => ({
  getSubscription: vi.fn(),
  getUsage: vi.fn(),
  createCheckout: vi.fn(),
}));

const FREE_SUB: billingLib.Subscription = {
  id: "sub_free",
  tier: "free",
  status: "active",
  project_limit: 3,
  current_period_end: "2026-06-01T00:00:00Z",
  trial_ends_at: null,
};

const STARTER_SUB: billingLib.Subscription = {
  id: "sub_starter",
  tier: "starter",
  status: "active",
  project_limit: null,
  current_period_end: "2026-06-01T00:00:00Z",
  trial_ends_at: null,
};

describe("PaywallGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when user tier is sufficient (free accessing free feature)", async () => {
    vi.mocked(billingLib.getSubscription).mockResolvedValue(FREE_SUB);

    const { default: PaywallGate } = await import("@/components/paywall-gate");
    render(
      <PaywallGate requiredTier="free" feature="Basis Projecten">
        <div data-testid="protected-content">Toegankelijke content</div>
      </PaywallGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /upgraden/i })).not.toBeInTheDocument();
  });

  it("renders children when user tier exceeds required (starter accessing free feature)", async () => {
    vi.mocked(billingLib.getSubscription).mockResolvedValue(STARTER_SUB);

    const { default: PaywallGate } = await import("@/components/paywall-gate");
    render(
      <PaywallGate requiredTier="free" feature="Basis Projecten">
        <div data-testid="protected-content">Toegankelijke content</div>
      </PaywallGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
  });

  it("renders upgrade prompt when free user accesses starter feature", async () => {
    vi.mocked(billingLib.getSubscription).mockResolvedValue(FREE_SUB);

    const { default: PaywallGate } = await import("@/components/paywall-gate");
    render(
      <PaywallGate requiredTier="starter" feature="AI Planning">
        <div data-testid="protected-content">Beveiligde content</div>
      </PaywallGate>
    );

    await waitFor(() => {
      expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    });

    expect(screen.getByText(/AI Planning/i)).toBeInTheDocument();
    expect(screen.getByText(/starter/i)).toBeInTheDocument();
    const upgradeLink = screen.getByRole("link", { name: /upgraden/i });
    expect(upgradeLink).toHaveAttribute("href", "/pricing");
  });

  it("renders upgrade prompt when starter user accesses pro feature", async () => {
    vi.mocked(billingLib.getSubscription).mockResolvedValue(STARTER_SUB);

    const { default: PaywallGate } = await import("@/components/paywall-gate");
    render(
      <PaywallGate requiredTier="pro" feature="Voice AI">
        <div data-testid="protected-content">Pro content</div>
      </PaywallGate>
    );

    await waitFor(() => {
      expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Voice AI/i)).toBeInTheDocument();
    const upgradeLink = screen.getByRole("link", { name: /upgraden/i });
    expect(upgradeLink).toHaveAttribute("href", "/pricing");
  });

  it("renders nothing while fetching subscription (loading state)", async () => {
    // Never resolves during this test
    vi.mocked(billingLib.getSubscription).mockReturnValue(new Promise(() => {}));

    const { default: PaywallGate } = await import("@/components/paywall-gate");
    const { container } = render(
      <PaywallGate requiredTier="starter" feature="AI Planning">
        <div data-testid="protected-content">Content</div>
      </PaywallGate>
    );

    // Neither content nor upgrade prompt shown while loading
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /upgraden/i })).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});

describe("UpgradeBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders upgrade banner for free tier users", async () => {
    const { default: UpgradeBanner } = await import("@/components/upgrade-banner");
    render(<UpgradeBanner tier="free" />);

    expect(screen.getByText(/gratis plan/i)).toBeInTheDocument();
    expect(screen.getByText(/starter/i)).toBeInTheDocument();
    const upgradeLink = screen.getByRole("link", { name: /upgraden/i });
    expect(upgradeLink).toHaveAttribute("href", "/pricing");
  });

  it("does not render for starter tier users", async () => {
    const { default: UpgradeBanner } = await import("@/components/upgrade-banner");
    const { container } = render(<UpgradeBanner tier="starter" />);
    expect(container.firstChild).toBeNull();
  });

  it("does not render for pro tier users", async () => {
    const { default: UpgradeBanner } = await import("@/components/upgrade-banner");
    const { container } = render(<UpgradeBanner tier="pro" />);
    expect(container.firstChild).toBeNull();
  });

  it("can be dismissed and stores dismissal in localStorage", async () => {
    const user = userEvent.setup();
    const { default: UpgradeBanner } = await import("@/components/upgrade-banner");
    render(<UpgradeBanner tier="free" />);

    expect(screen.getByText(/gratis plan/i)).toBeInTheDocument();

    const dismissButton = screen.getByRole("button", { name: /sluiten/i });
    await user.click(dismissButton);

    expect(screen.queryByText(/gratis plan/i)).not.toBeInTheDocument();
    const stored = localStorage.getItem("upgrade_banner_dismissed_until");
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(Date.now());
  });

  it("does not render when dismissed within 7 days", async () => {
    // Dismiss until 6 days from now (still active)
    localStorage.setItem(
      "upgrade_banner_dismissed_until",
      String(Date.now() + 6 * 24 * 60 * 60 * 1000)
    );

    const { default: UpgradeBanner } = await import("@/components/upgrade-banner");
    const { container } = render(<UpgradeBanner tier="free" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders again after 7-day dismissal window has passed", async () => {
    // Dismissal expired 1 day ago
    localStorage.setItem(
      "upgrade_banner_dismissed_until",
      String(Date.now() - 24 * 60 * 60 * 1000)
    );

    const { default: UpgradeBanner } = await import("@/components/upgrade-banner");
    render(<UpgradeBanner tier="free" />);
    expect(screen.getByText(/gratis plan/i)).toBeInTheDocument();
  });
});

describe("billing lib", () => {
  it("exports getSubscription, getUsage, createCheckout", () => {
    expect(typeof billingLib.getSubscription).toBe("function");
    expect(typeof billingLib.getUsage).toBe("function");
    expect(typeof billingLib.createCheckout).toBe("function");
  });
});
