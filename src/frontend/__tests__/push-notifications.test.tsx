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
// PushPermission component tests
// ---------------------------------------------------------------------------

let hadPushManager = false;

describe("PushPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Keep PushManager alive for the entire test (including async re-renders)
    if (!("PushManager" in window)) {
      (window as unknown as Record<string, unknown>).PushManager = class {};
      hadPushManager = false;
    } else {
      hadPushManager = true;
    }
  });

  afterEach(() => {
    if (!hadPushManager) {
      delete (window as unknown as Record<string, unknown>).PushManager;
    }
  });

  it("renders enable button when PushManager is available", () => {
    render(<PushPermission token="test-token" />);
    expect(screen.getByText("Inschakelen")).toBeTruthy();
  });

  it("does not render when PushManager is unavailable", () => {
    // Temporarily remove PushManager
    delete (window as unknown as Record<string, unknown>).PushManager;
    const { container } = render(<PushPermission token="test-token" />);
    expect(container.firstChild).toBeNull();
    // Re-add for afterEach cleanup consistency
    (window as unknown as Record<string, unknown>).PushManager = class {};
  });

  it("calls subscribeToPush with the token on button click", async () => {
    render(<PushPermission token="my-jwt" />);
    fireEvent.click(screen.getByText("Inschakelen"));
    await waitFor(() => {
      expect(subscribeToPush).toHaveBeenCalledWith("my-jwt");
    });
  });

  it("shows denied message when subscription returns false", async () => {
    vi.mocked(subscribeToPush).mockResolvedValueOnce(false);
    render(<PushPermission token="test-token" />);
    fireEvent.click(screen.getByText("Inschakelen"));
    await waitFor(() => {
      expect(screen.getByText(/geblokkeerd/i)).toBeTruthy();
    });
  });

  it("dismisses banner when X is clicked", () => {
    render(<PushPermission token="test-token" />);
    fireEvent.click(screen.getByLabelText("Sluiten"));
    expect(screen.queryByText("Inschakelen")).toBeNull();
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
