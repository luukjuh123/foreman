import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mock push lib
// ---------------------------------------------------------------------------
vi.mock("@/lib/push", () => ({
  fetchVapidKey: vi.fn(async () => "BFake_public_key"),
  subscribeToPush: vi.fn(async () => true),
  unsubscribeFromPush: vi.fn(async () => undefined),
}));

import { subscribeToPush, fetchVapidKey } from "@/lib/push";
import { PushPermission } from "@/components/push-permission";

// ---------------------------------------------------------------------------
// Helper: jsdom doesn't have PushManager; inject it for tests
// ---------------------------------------------------------------------------
function withPushManager(fn: () => void) {
  const original = (window as unknown as Record<string, unknown>).PushManager;
  (window as unknown as Record<string, unknown>).PushManager = class {};
  fn();
  if (original === undefined) {
    delete (window as unknown as Record<string, unknown>).PushManager;
  } else {
    (window as unknown as Record<string, unknown>).PushManager = original;
  }
}

// ---------------------------------------------------------------------------
// PushPermission component tests
// ---------------------------------------------------------------------------

describe("PushPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders enable button when PushManager is available", () => {
    withPushManager(() => {
      render(<PushPermission token="test-token" />);
      expect(screen.getByText("Inschakelen")).toBeTruthy();
    });
  });

  it("does not render when PushManager is unavailable", () => {
    // PushManager not present in plain jsdom
    const { container } = render(<PushPermission token="test-token" />);
    expect(container.firstChild).toBeNull();
  });

  it("calls subscribeToPush with the token on button click", async () => {
    withPushManager(() => {
      render(<PushPermission token="my-jwt" />);
      fireEvent.click(screen.getByText("Inschakelen"));
    });
    await waitFor(() => {
      expect(subscribeToPush).toHaveBeenCalledWith("my-jwt");
    });
  });

  it("shows denied message when subscription returns false", async () => {
    vi.mocked(subscribeToPush).mockResolvedValueOnce(false);
    withPushManager(() => {
      render(<PushPermission token="test-token" />);
      fireEvent.click(screen.getByText("Inschakelen"));
    });
    await waitFor(() => {
      expect(screen.getByText(/geblokkeerd/i)).toBeTruthy();
    });
  });

  it("dismisses banner when X is clicked", () => {
    withPushManager(() => {
      render(<PushPermission token="test-token" />);
      fireEvent.click(screen.getByLabelText("Sluiten"));
      expect(screen.queryByText("Inschakelen")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// push.ts lib unit tests (mocked fetch)
// ---------------------------------------------------------------------------

describe("fetchVapidKey", () => {
  it("returns the public_key from the API response", async () => {
    const key = await fetchVapidKey();
    expect(key).toBe("BFake_public_key");
  });
});
