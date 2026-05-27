import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/staff"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeCert = (overrides: Partial<{
  id: string;
  staff_id: string;
  cert_type: string;
  cert_name: string;
  issued_at: string;
  expires_at: string;
  document_path: string | null;
}> = {}) => ({
  id: overrides.id ?? "cert-1",
  staff_id: overrides.staff_id ?? "staff-1",
  cert_type: overrides.cert_type ?? "VCA",
  cert_name: overrides.cert_name ?? "VCA Basis",
  issued_at: overrides.issued_at ?? "2024-01-01",
  expires_at: overrides.expires_at ?? "2027-01-01",
  document_path: overrides.document_path ?? null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeCompliance = (overrides: Partial<{
  total_staff: number;
  total_certifications: number;
  expired_count: number;
  expiring_soon_count: number;
  valid_count: number;
}> = {}) => ({
  total_staff: overrides.total_staff ?? 3,
  total_certifications: overrides.total_certifications ?? 5,
  expired_count: overrides.expired_count ?? 1,
  expiring_soon_count: overrides.expiring_soon_count ?? 1,
  valid_count: overrides.valid_count ?? 3,
});

// ---------------------------------------------------------------------------
// CertificationTab tests
// ---------------------------------------------------------------------------

describe("CertificationTab — loading state", () => {
  it("shows loading while fetching certifications", async () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const { default: CertificationTab } = await import(
      "@/components/staff/certification-tab"
    );
    render(<CertificationTab staffId="staff-1" />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("CertificationTab — empty state", () => {
  it("shows no certifications message when empty", async () => {
    mockApiFetch.mockResolvedValue([]);

    const { default: CertificationTab } = await import(
      "@/components/staff/certification-tab"
    );
    render(<CertificationTab staffId="staff-1" />);

    await waitFor(() => {
      expect(screen.getByText(/geen certificeringen/i)).toBeInTheDocument();
    });
  });
});

describe("CertificationTab — renders certifications", () => {
  it("renders cert type and name", async () => {
    mockApiFetch.mockResolvedValue([
      makeCert({ cert_type: "VCA", cert_name: "VCA Basis" }),
      makeCert({ id: "cert-2", cert_type: "BHV", cert_name: "BHV Cursus" }),
    ]);

    const { default: CertificationTab } = await import(
      "@/components/staff/certification-tab"
    );
    render(<CertificationTab staffId="staff-1" />);

    await waitFor(() => {
      expect(screen.getByText("VCA")).toBeInTheDocument();
      expect(screen.getByText("VCA Basis")).toBeInTheDocument();
      expect(screen.getByText("BHV")).toBeInTheDocument();
      expect(screen.getByText("BHV Cursus")).toBeInTheDocument();
    });
  });

  it("renders expiry dates in Dutch format (dd-MM-yyyy)", async () => {
    mockApiFetch.mockResolvedValue([
      makeCert({ expires_at: "2027-03-15" }),
    ]);

    const { default: CertificationTab } = await import(
      "@/components/staff/certification-tab"
    );
    render(<CertificationTab staffId="staff-1" />);

    await waitFor(() => {
      expect(screen.getByText(/15-03-2027/)).toBeInTheDocument();
    });
  });

  it("shows expired badge for past expiry", async () => {
    mockApiFetch.mockResolvedValue([
      makeCert({ expires_at: "2020-01-01" }),
    ]);

    const { default: CertificationTab } = await import(
      "@/components/staff/certification-tab"
    );
    render(<CertificationTab staffId="staff-1" />);

    await waitFor(() => {
      expect(screen.getByText(/verlopen/i)).toBeInTheDocument();
    });
  });

  it("shows add certification button", async () => {
    mockApiFetch.mockResolvedValue([]);

    const { default: CertificationTab } = await import(
      "@/components/staff/certification-tab"
    );
    render(<CertificationTab staffId="staff-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /certificering toevoegen/i })).toBeInTheDocument();
    });
  });
});

describe("CertificationTab — add certification dialog", () => {
  it("opens add dialog on button click", async () => {
    mockApiFetch.mockResolvedValue([]);

    const { default: CertificationTab } = await import(
      "@/components/staff/certification-tab"
    );
    render(<CertificationTab staffId="staff-1" />);

    await waitFor(() => screen.getByRole("button", { name: /certificering toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /certificering toevoegen/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/naam/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ExpiryTimeline tests
// ---------------------------------------------------------------------------

describe("ExpiryTimeline — renders", () => {
  it("shows expiry timeline heading", async () => {
    mockApiFetch.mockResolvedValue([
      makeCert({ cert_name: "VCA Basis", expires_at: "2027-06-01" }),
    ]);

    const { default: ExpiryTimeline } = await import(
      "@/components/staff/expiry-timeline"
    );
    render(<ExpiryTimeline />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /verlooptijdlijn/i })).toBeInTheDocument();
    });
  });

  it("renders cert entries from the expiring-soon API", async () => {
    mockApiFetch.mockResolvedValue([
      makeCert({ cert_name: "VCA Basis", expires_at: "2027-06-01" }),
      makeCert({ id: "cert-2", cert_name: "BHV Cursus", expires_at: "2027-08-15" }),
    ]);

    const { default: ExpiryTimeline } = await import(
      "@/components/staff/expiry-timeline"
    );
    render(<ExpiryTimeline />);

    await waitFor(() => {
      expect(screen.getByText("VCA Basis")).toBeInTheDocument();
      expect(screen.getByText("BHV Cursus")).toBeInTheDocument();
    });
  });

  it("shows empty message when no expiring certs", async () => {
    mockApiFetch.mockResolvedValue([]);

    const { default: ExpiryTimeline } = await import(
      "@/components/staff/expiry-timeline"
    );
    render(<ExpiryTimeline />);

    await waitFor(() => {
      expect(screen.getByText(/geen verlopen/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ComplianceOverview tests
// ---------------------------------------------------------------------------

describe("ComplianceOverview — renders stats", () => {
  it("shows team-wide compliance heading", async () => {
    mockApiFetch.mockResolvedValue(makeCompliance());

    const { default: ComplianceOverview } = await import(
      "@/components/staff/compliance-overview"
    );
    render(<ComplianceOverview />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /compliance/i })).toBeInTheDocument();
    });
  });

  it("shows total staff count", async () => {
    mockApiFetch.mockResolvedValue(makeCompliance({ total_staff: 7, total_certifications: 2, valid_count: 2, expired_count: 0, expiring_soon_count: 0 }));

    const { default: ComplianceOverview } = await import(
      "@/components/staff/compliance-overview"
    );
    render(<ComplianceOverview />);

    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  it("shows expired count", async () => {
    mockApiFetch.mockResolvedValue(makeCompliance({ expired_count: 2 }));

    const { default: ComplianceOverview } = await import(
      "@/components/staff/compliance-overview"
    );
    render(<ComplianceOverview />);

    await waitFor(() => {
      expect(screen.getAllByText(/2/).length).toBeGreaterThan(0);
    });
  });

  it("shows valid count", async () => {
    mockApiFetch.mockResolvedValue(makeCompliance({ valid_count: 4 }));

    const { default: ComplianceOverview } = await import(
      "@/components/staff/compliance-overview"
    );
    render(<ComplianceOverview />);

    await waitFor(() => {
      expect(screen.getAllByText(/4/).length).toBeGreaterThan(0);
    });
  });

  it("shows loading state", async () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const { default: ComplianceOverview } = await import(
      "@/components/staff/compliance-overview"
    );
    render(<ComplianceOverview />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});
