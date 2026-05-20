import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/settings"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

// Also mock theme-provider so SettingsPage doesn't explode
vi.mock("@/lib/theme-provider", () => ({
  useTheme: vi.fn(() => ({ theme: "system", setTheme: vi.fn() })),
}));

const mockPrefs = {
  user_id: "user-1",
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: true,
  type_overrides: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderSettingsPage() {
  const { default: SettingsPage } = await import(
    "@/app/dashboard/settings/page"
  );
  await act(async () => {
    render(<SettingsPage />);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Notification settings — SettingsPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows loading state while fetching preferences", async () => {
    const { apiFetch } = await import("@/lib/api");
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}) // never resolves → stays loading
    );

    const { default: SettingsPage } = await import(
      "@/app/dashboard/settings/page"
    );
    render(<SettingsPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders three toggle switches after loading preferences", async () => {
    const { apiFetch } = await import("@/lib/api");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockPrefs,
      error: null,
    });

    await renderSettingsPage();

    expect(screen.getByLabelText(/in-app/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/push/i)).toBeInTheDocument();
  });

  it("reflects fetched preference values in toggle checked state", async () => {
    const { apiFetch } = await import("@/lib/api");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ...mockPrefs, in_app_enabled: true, email_enabled: false, push_enabled: true },
      error: null,
    });

    await renderSettingsPage();

    const inApp = screen.getByLabelText(/in-app/i) as HTMLInputElement;
    const email = screen.getByLabelText(/e-mail/i) as HTMLInputElement;
    const push = screen.getByLabelText(/push/i) as HTMLInputElement;

    expect(inApp.checked).toBe(true);
    expect(email.checked).toBe(false);
    expect(push.checked).toBe(true);
  });

  it("calls PUT /notifications/preferences when toggling a switch", async () => {
    const { apiFetch } = await import("@/lib/api");
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: mockPrefs, error: null }) // GET
      .mockResolvedValueOnce({ data: { ...mockPrefs, email_enabled: true }, error: null }); // PUT

    await renderSettingsPage();

    const emailToggle = screen.getByLabelText(/e-mail/i);
    fireEvent.click(emailToggle);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/notifications/preferences",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  it("shows success feedback after saving", async () => {
    const { apiFetch } = await import("@/lib/api");
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: mockPrefs, error: null })
      .mockResolvedValueOnce({ data: { ...mockPrefs, email_enabled: true }, error: null });

    await renderSettingsPage();

    const emailToggle = screen.getByLabelText(/e-mail/i);
    fireEvent.click(emailToggle);

    await waitFor(() => {
      expect(screen.getByText(/opgeslagen/i)).toBeInTheDocument();
    });
  });

  it("shows error feedback when save fails", async () => {
    const { apiFetch } = await import("@/lib/api");
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: mockPrefs, error: null })
      .mockRejectedValueOnce(new Error("Server error"));

    await renderSettingsPage();

    const pushToggle = screen.getByLabelText(/push/i);
    fireEvent.click(pushToggle);

    await waitFor(() => {
      expect(screen.getByText(/fout/i)).toBeInTheDocument();
    });
  });
});
