import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/push", () => ({
  subscribeToPush: vi.fn(),
}));

import { subscribeToPush } from "@/lib/push";
import { PushPermission } from "@/components/push-permission";

// jsdom doesn't have PushManager; inject it for the duration of each test
let hadPushManager = false;

function setupPushManager() {
  if (!("PushManager" in window)) {
    (window as unknown as Record<string, unknown>).PushManager = class {};
    hadPushManager = false;
  } else {
    hadPushManager = true;
  }
}

function teardownPushManager() {
  if (!hadPushManager) {
    delete (window as unknown as Record<string, unknown>).PushManager;
  }
}

describe("PushPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    teardownPushManager();
  });

  it("renders nothing when PushManager is unavailable", () => {
    const { container } = render(<PushPermission token="test-token" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders enable button when PushManager is available", () => {
    setupPushManager();
    render(<PushPermission token="test-token" />);
    expect(screen.getByText("Inschakelen")).toBeTruthy();
  });

  it("calls subscribeToPush with the token on button click", async () => {
    setupPushManager();
    vi.mocked(subscribeToPush).mockResolvedValueOnce(true);
    render(<PushPermission token="my-jwt" />);
    fireEvent.click(screen.getByText("Inschakelen"));
    await waitFor(() => {
      expect(subscribeToPush).toHaveBeenCalledWith("my-jwt");
    });
  });

  it("shows denied message when subscription returns false", async () => {
    setupPushManager();
    vi.mocked(subscribeToPush).mockResolvedValueOnce(false);
    render(<PushPermission token="test-token" />);
    fireEvent.click(screen.getByText("Inschakelen"));
    await waitFor(() => {
      expect(screen.getByText(/geblokkeerd/i)).toBeTruthy();
    });
  });

  it("dismisses banner when X is clicked", () => {
    setupPushManager();
    render(<PushPermission token="test-token" />);
    fireEvent.click(screen.getByLabelText("Sluiten"));
    expect(screen.queryByText("Inschakelen")).toBeNull();
  });
});
