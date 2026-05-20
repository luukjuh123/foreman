import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("PwaRegister", () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset navigator.serviceWorker
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("renders without crashing", async () => {
    const { default: PwaRegister } = await import("@/components/pwa-register");
    const { container } = render(<PwaRegister />);
    expect(container).toBeDefined();
  });

  it("shows nothing when no installPrompt has fired", async () => {
    const { default: PwaRegister } = await import("@/components/pwa-register");
    const { container } = render(<PwaRegister />);
    // No install banner should be visible
    expect(container.firstChild).toBeNull();
  });

  it("registers service worker on mount when supported", async () => {
    const registerMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock },
      writable: true,
      configurable: true,
    });

    const { default: PwaRegister } = await import("@/components/pwa-register");
    await act(async () => {
      render(<PwaRegister />);
    });

    expect(registerMock).toHaveBeenCalledWith("/sw.js");
  });

  it("shows install banner when beforeinstallprompt fires", async () => {
    const { default: PwaRegister } = await import("@/components/pwa-register");

    await act(async () => {
      render(<PwaRegister />);
    });

    // Simulate beforeinstallprompt event
    const mockPrompt = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    };

    await act(async () => {
      const event = Object.assign(new Event("beforeinstallprompt"), mockPrompt);
      window.dispatchEvent(event);
    });

    expect(screen.getByText(/installeer foreman als app/i)).toBeInTheDocument();
  });

  it("shows install button when banner is visible", async () => {
    const { default: PwaRegister } = await import("@/components/pwa-register");

    await act(async () => {
      render(<PwaRegister />);
    });

    const mockPrompt = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    };

    await act(async () => {
      const event = Object.assign(new Event("beforeinstallprompt"), mockPrompt);
      window.dispatchEvent(event);
    });

    expect(screen.getByRole("button", { name: /installeren/i })).toBeInTheDocument();
  });

  it("hides banner when dismiss button is clicked", async () => {
    const { default: PwaRegister } = await import("@/components/pwa-register");

    await act(async () => {
      render(<PwaRegister />);
    });

    const mockPrompt = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    };

    await act(async () => {
      const event = Object.assign(new Event("beforeinstallprompt"), mockPrompt);
      window.dispatchEvent(event);
    });

    const closeButton = screen.getByRole("button", { name: /sluiten/i });

    await act(async () => {
      fireEvent.click(closeButton);
    });

    expect(screen.queryByText(/installeer foreman als app/i)).not.toBeInTheDocument();
  });
});
