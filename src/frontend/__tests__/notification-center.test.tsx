import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/notifications"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeNotification = (overrides: Partial<{
  id: string;
  read_at: string | null;
  type: string;
  title: string;
  body: string;
}> = {}) => ({
  id: overrides.id ?? "notif-1",
  user_id: "user-1",
  type: overrides.type ?? "project_update",
  title: overrides.title ?? "Project bijgewerkt",
  body: overrides.body ?? "Fase 1 is voltooid.",
  data: null,
  channels_dispatched: ["in_app"],
  read_at: overrides.read_at ?? null,
  created_at: "2024-03-01T12:00:00Z",
});

// ---------------------------------------------------------------------------
// NotificationBell — unit tests
// ---------------------------------------------------------------------------

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders a bell button", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({ data: [], unread_count: 0, error: null }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationBell } = await import(
      "@/components/notifications/NotificationBell"
    );
    render(<NotificationBell />);
    expect(screen.getByRole("button", { name: /meldingen/i })).toBeInTheDocument();
  });

  it("shows unread badge when unread_count > 0", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({
        data: [makeNotification()],
        unread_count: 3,
        error: null,
      }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationBell } = await import(
      "@/components/notifications/NotificationBell"
    );

    await act(async () => {
      render(<NotificationBell />);
    });

    expect(screen.getByTestId("unread-badge")).toHaveTextContent("3");
  });

  it("does not show badge when unread_count is 0", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({ data: [], unread_count: 0, error: null }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationBell } = await import(
      "@/components/notifications/NotificationBell"
    );

    await act(async () => {
      render(<NotificationBell />);
    });

    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("opens dropdown with notification list on click", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({
        data: [makeNotification({ title: "Test melding" })],
        unread_count: 1,
        error: null,
      }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationBell } = await import(
      "@/components/notifications/NotificationBell"
    );

    await act(async () => {
      render(<NotificationBell />);
    });

    fireEvent.click(screen.getByRole("button", { name: /meldingen/i }));

    expect(screen.getByTestId("notification-dropdown")).toBeInTheDocument();
    expect(screen.getByText("Test melding")).toBeInTheDocument();
  });

  it("shows empty state in dropdown when no notifications", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({ data: [], unread_count: 0, error: null }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationBell } = await import(
      "@/components/notifications/NotificationBell"
    );

    await act(async () => {
      render(<NotificationBell />);
    });

    fireEvent.click(screen.getByRole("button", { name: /meldingen/i }));

    expect(screen.getByTestId("notification-dropdown")).toBeInTheDocument();
    expect(screen.getByText(/geen meldingen/i)).toBeInTheDocument();
  });

  it("calls markNotificationRead when clicking an unread notification", async () => {
    const mockMarkRead = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({
        data: [makeNotification({ id: "notif-42", read_at: null })],
        unread_count: 1,
        error: null,
      }),
      markNotificationRead: mockMarkRead,
    }));

    const { default: NotificationBell } = await import(
      "@/components/notifications/NotificationBell"
    );

    await act(async () => {
      render(<NotificationBell />);
    });

    fireEvent.click(screen.getByRole("button", { name: /meldingen/i }));
    fireEvent.click(screen.getByText("Project bijgewerkt"));

    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith("notif-42");
    });
  });
});

// ---------------------------------------------------------------------------
// Sidebar — Meldingen link
// ---------------------------------------------------------------------------

describe("Sidebar — Notificaties", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Notificaties navigation link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getAllByText("Notificaties").length).toBeGreaterThan(0);
  });

  it("Notificaties link points to /dashboard/notifications", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /notificaties/i });
    expect(links[0]).toHaveAttribute("href", "/dashboard/notifications");
  });
});

// ---------------------------------------------------------------------------
// Notifications page
// ---------------------------------------------------------------------------

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Meldingen heading", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({ data: [], unread_count: 0, error: null }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationsPage } = await import(
      "@/app/dashboard/notifications/page"
    );

    await act(async () => {
      render(<NotificationsPage />);
    });

    expect(screen.getByText("Meldingen")).toBeInTheDocument();
  });

  it("renders Alleen ongelezen filter button", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({ data: [], unread_count: 0, error: null }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationsPage } = await import(
      "@/app/dashboard/notifications/page"
    );

    await act(async () => {
      render(<NotificationsPage />);
    });

    expect(screen.getByRole("button", { name: /alleen ongelezen/i })).toBeInTheDocument();
  });

  it("shows empty state when no notifications", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({ data: [], unread_count: 0, error: null }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationsPage } = await import(
      "@/app/dashboard/notifications/page"
    );

    await act(async () => {
      render(<NotificationsPage />);
    });

    expect(screen.getByTestId("notifications-empty")).toBeInTheDocument();
  });

  it("renders list of notifications from API", async () => {
    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({
        data: [
          makeNotification({ id: "n1", title: "Factuur verstuurd", read_at: null }),
          makeNotification({ id: "n2", title: "Rapport klaar", read_at: "2024-03-01T13:00:00Z" }),
        ],
        unread_count: 1,
        error: null,
      }),
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationsPage } = await import(
      "@/app/dashboard/notifications/page"
    );

    await act(async () => {
      render(<NotificationsPage />);
    });

    expect(screen.getByText("Factuur verstuurd")).toBeInTheDocument();
    expect(screen.getByText("Rapport klaar")).toBeInTheDocument();
  });

  it("filters to unread only when toggle is activated", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: [makeNotification({ id: "n1", read_at: null })],
      unread_count: 1,
      error: null,
    });

    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: mockFetch,
      markNotificationRead: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: NotificationsPage } = await import(
      "@/app/dashboard/notifications/page"
    );

    await act(async () => {
      render(<NotificationsPage />);
    });

    fireEvent.click(screen.getByRole("button", { name: /alleen ongelezen/i }));

    await waitFor(() => {
      // fetchNotifications should be called with unread_only=true
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({ unread_only: true })
      );
    });
  });

  it("marks notification as read when clicking mark-read button", async () => {
    const mockMarkRead = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/notifications", () => ({
      fetchNotifications: vi.fn().mockResolvedValue({
        data: [makeNotification({ id: "n-mark", read_at: null, title: "Te lezen" })],
        unread_count: 1,
        error: null,
      }),
      markNotificationRead: mockMarkRead,
    }));

    const { default: NotificationsPage } = await import(
      "@/app/dashboard/notifications/page"
    );

    await act(async () => {
      render(<NotificationsPage />);
    });

    const markReadBtn = screen.getByTestId("mark-read-n-mark");
    fireEvent.click(markReadBtn);

    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith("n-mark");
    });
  });
});
