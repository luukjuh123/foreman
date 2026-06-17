import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("@/lib/documents", () => ({
  listDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  uploadDocument: vi.fn(),
  listVersions: vi.fn(),
  getDownloadUrl: vi.fn((pid, did) => `/api/v1/projects/${pid}/documents/${did}/download`),
}));

import {
  listDocuments,
  uploadDocument,
} from "@/lib/documents";
import type { DocumentResponse } from "@/lib/documents";

const mockDocs: DocumentResponse[] = [
  {
    id: "doc-1",
    project_id: "proj-1",
    uploaded_by: "user-1",
    name: "contract.pdf",
    description: "Hoofdcontract",
    category: "contract",
    mime_type: "application/pdf",
    size_bytes: 204800,
    version: 1,
    parent_id: null,
    created_at: "2024-03-01T10:00:00Z",
    updated_at: "2024-03-01T10:00:00Z",
  },
  {
    id: "doc-2",
    project_id: "proj-1",
    uploaded_by: "user-1",
    name: "tekening_v1.dwg",
    description: null,
    category: "drawing",
    mime_type: "application/octet-stream",
    size_bytes: 1024000,
    version: 1,
    parent_id: null,
    created_at: "2024-04-01T10:00:00Z",
    updated_at: "2024-04-01T10:00:00Z",
  },
];

describe("DocumentList component", () => {
  beforeEach(() => {
    vi.mocked(listDocuments).mockResolvedValue({ items: mockDocs, total: 2 });
  });

  it("renders documents after loading", async () => {
    const { DocumentList } = await import("@/components/documents/document-list");
    render(<DocumentList projectId="proj-1" />);
    await waitFor(() => {
      expect(screen.getByText("contract.pdf")).toBeInTheDocument();
      expect(screen.getByText("tekening_v1.dwg")).toBeInTheDocument();
    });
  });

  it("renders category badges for each document", async () => {
    const { DocumentList } = await import("@/components/documents/document-list");
    render(<DocumentList projectId="proj-1" />);
    await waitFor(() => {
      expect(screen.getByText("Contract")).toBeInTheDocument();
      expect(screen.getByText("Tekening")).toBeInTheDocument();
    });
  });

  it("filters by category when chip is clicked", async () => {
    vi.mocked(listDocuments)
      .mockResolvedValueOnce({ items: mockDocs, total: 2 })
      .mockResolvedValueOnce({ items: [mockDocs[0]], total: 1 });

    const { DocumentList } = await import("@/components/documents/document-list");
    render(<DocumentList projectId="proj-1" />);
    await waitFor(() => screen.getByText("contract.pdf"));

    const contractChip = screen.getByText("Contract", { selector: "button" });
    fireEvent.click(contractChip);

    await waitFor(() => {
      expect(listDocuments).toHaveBeenCalledWith("proj-1", { category: "contract" });
    });
  });

  it("renders upload dialog when Uploaden button is clicked", async () => {
    const { DocumentList } = await import("@/components/documents/document-list");
    render(<DocumentList projectId="proj-1" />);

    const uploadBtn = screen.getByRole("button", { name: /uploaden/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByText("Document uploaden")).toBeInTheDocument();
    });
  });

  it("upload dialog requires file before submitting", async () => {
    const { DocumentList } = await import("@/components/documents/document-list");
    render(<DocumentList projectId="proj-1" />);

    fireEvent.click(screen.getByRole("button", { name: /uploaden/i }));
    await waitFor(() => screen.getByText("Document uploaden"));

    // Submit button should be disabled when no file selected
    const submitBtn = screen.getByRole("button", { name: /^uploaden$/i });
    expect(submitBtn).toBeDisabled();
  });

  it("calls listDocuments with project id on mount", async () => {
    const { DocumentList } = await import("@/components/documents/document-list");
    render(<DocumentList projectId="proj-99" />);
    await waitFor(() => {
      expect(listDocuments).toHaveBeenCalledWith("proj-99", {});
    });
  });

  it("shows empty state when no documents", async () => {
    vi.mocked(listDocuments).mockResolvedValue({ items: [], total: 0 });
    const { DocumentList } = await import("@/components/documents/document-list");
    render(<DocumentList projectId="proj-1" />);
    await waitFor(() => {
      expect(screen.getByText("Geen documenten")).toBeInTheDocument();
    });
  });
});
