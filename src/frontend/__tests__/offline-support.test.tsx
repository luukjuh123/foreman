import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
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

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe("isOnline", () => {
  it("returns true when navigator.onLine is true", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const { isOnline } = await import("@/lib/offline");
    expect(isOnline()).toBe(true);
  });

  it("returns false when navigator.onLine is false", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { isOnline } = await import("@/lib/offline");
    expect(isOnline()).toBe(false);
  });
});

describe("getQueue", () => {
  it("returns empty array when nothing queued", async () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    const { getQueue } = await import("@/lib/offline");
    expect(getQueue()).toEqual([]);
  });

  it("returns empty array on malformed JSON", async () => {
    localStorageMock.getItem.mockReturnValueOnce("not-json");
    const { getQueue } = await import("@/lib/offline");
    expect(getQueue()).toEqual([]);
  });
});

describe("queueOfflineRequest", () => {
  it("stores a request in localStorage", async () => {
    const { queueOfflineRequest, getQueue } = await import("@/lib/offline");
    queueOfflineRequest("/api/projects", "POST", '{"name":"test"}');
    expect(localStorageMock.setItem).toHaveBeenCalled();
    // getItem returns [] initially, so after one call setItem has persisted one item
    const call = localStorageMock.setItem.mock.calls[0];
    const stored = JSON.parse(call[1]);
    expect(stored).toHaveLength(1);
    expect(stored[0].url).toBe("/api/projects");
    expect(stored[0].method).toBe("POST");
    expect(stored[0].body).toBe('{"name":"test"}');
    expect(stored[0].id).toBeDefined();
    expect(stored[0].timestamp).toBeDefined();
  });

  it("appends to existing queue", async () => {
    const existing = [{ id: "x", url: "/api/old", method: "GET", body: null, timestamp: 1 }];
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(existing));
    const { queueOfflineRequest } = await import("@/lib/offline");
    queueOfflineRequest("/api/new", "DELETE", null);
    const call = localStorageMock.setItem.mock.calls[0];
    const stored = JSON.parse(call[1]);
    expect(stored).toHaveLength(2);
    expect(stored[1].url).toBe("/api/new");
  });
});

describe("flushOfflineQueue", () => {
  it("does nothing when queue is empty", async () => {
    localStorageMock.getItem.mockReturnValueOnce("[]");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { flushOfflineQueue } = await import("@/lib/offline");
    await flushOfflineQueue();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("replays queued requests and clears queue on success", async () => {
    const queued = [{ id: "1", url: "/api/tasks", method: "POST", body: '{"x":1}', timestamp: 1 }];
    localStorageMock.getItem
      .mockReturnValueOnce(JSON.stringify(queued)) // getQueue call
      .mockReturnValueOnce(null); // token lookup
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { flushOfflineQueue } = await import("@/lib/offline");
    await flushOfflineQueue();

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST" }));
    // remaining should be empty
    const setCall = localStorageMock.setItem.mock.calls.find(
      (c) => c[0] === "foreman_offline_queue"
    );
    expect(JSON.parse(setCall![1])).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("keeps failed requests in queue", async () => {
    const queued = [{ id: "1", url: "/api/tasks", method: "POST", body: null, timestamp: 1 }];
    localStorageMock.getItem
      .mockReturnValueOnce(JSON.stringify(queued))
      .mockReturnValueOnce(null);
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const { flushOfflineQueue } = await import("@/lib/offline");
    await flushOfflineQueue();

    const setCall = localStorageMock.setItem.mock.calls.find(
      (c) => c[0] === "foreman_offline_queue"
    );
    expect(JSON.parse(setCall![1])).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

describe("OfflineIndicator", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("hides indicator when online", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const { default: OfflineIndicator } = await import("@/components/offline-indicator");
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("shows banner when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { default: OfflineIndicator } = await import("@/components/offline-indicator");
    render(<OfflineIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("shows banner when offline event fires", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const { default: OfflineIndicator } = await import("@/components/offline-indicator");
    render(<OfflineIndicator />);
    expect(screen.queryByRole("status")).toBeNull();

    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("hides banner when online event fires", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { default: OfflineIndicator } = await import("@/components/offline-indicator");
    render(<OfflineIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByRole("status")).toBeNull();
  });
});
