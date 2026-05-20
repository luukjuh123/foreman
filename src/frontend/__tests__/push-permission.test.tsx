import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/push", () => ({
  isPushSupported: vi.fn(),
  isPushSubscribed: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

describe("PushPermission", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders 'Niet ondersteund' when push is not supported", async () => {
    const { isPushSupported, isPushSubscribed } = await import("@/lib/push");
    (isPushSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (isPushSubscribed as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { default: PushPermission } = await import("@/components/push-permission");
    await act(async () => {
      render(<PushPermission />);
    });

    expect(screen.getByTestId("push-status")).toHaveTextContent("Niet ondersteund");
  });

  it("renders toggle button when push is supported", async () => {
    const { isPushSupported, isPushSubscribed } = await import("@/lib/push");
    (isPushSupported as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (isPushSubscribed as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { default: PushPermission } = await import("@/components/push-permission");
    await act(async () => {
      render(<PushPermission />);
    });

    expect(screen.getByTestId("push-toggle")).toBeInTheDocument();
  });

  it("shows 'Ingeschakeld' status when subscribed", async () => {
    const { isPushSupported, isPushSubscribed } = await import("@/lib/push");
    (isPushSupported as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (isPushSubscribed as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const { default: PushPermission } = await import("@/components/push-permission");
    await act(async () => {
      render(<PushPermission />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("push-status")).toHaveTextContent("Ingeschakeld");
    });
  });

  it("calls subscribeToPush when toggle clicked while unsubscribed", async () => {
    const { isPushSupported, isPushSubscribed, subscribeToPush } = await import("@/lib/push");
    (isPushSupported as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (isPushSubscribed as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (subscribeToPush as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const { default: PushPermission } = await import("@/components/push-permission");
    await act(async () => {
      render(<PushPermission />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("push-toggle")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("push-toggle"));
    });

    expect(subscribeToPush).toHaveBeenCalled();
  });
});
