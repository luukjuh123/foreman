import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Types matching backend schemas/document.py exactly
// ---------------------------------------------------------------------------

export type DocumentCategory = "contract" | "permit" | "drawing" | "photo" | "other";

export interface DocumentResponse {
  id: string;
  project_id: string;
  uploaded_by: string;
  name: string;
  description: string | null;
  category: DocumentCategory;
  mime_type: string;
  size_bytes: number;
  version: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export async function listDocuments(
  projectId: string,
  opts: { category?: DocumentCategory; offset?: number; limit?: number } = {}
): Promise<DocumentListResponse> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  if (opts.offset != null) params.set("offset", String(opts.offset));
  if (opts.limit != null) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<DocumentListResponse>(`/projects/${projectId}/documents${qs}`, {
    token: token(),
  });
}

export async function getDocument(
  projectId: string,
  documentId: string
): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(`/projects/${projectId}/documents/${documentId}`, {
    token: token(),
  });
}

export async function deleteDocument(
  projectId: string,
  documentId: string
): Promise<void> {
  await apiFetch<void>(`/projects/${projectId}/documents/${documentId}`, {
    method: "DELETE",
    token: token(),
  });
}

export async function listVersions(
  projectId: string,
  documentId: string
): Promise<DocumentResponse[]> {
  return apiFetch<DocumentResponse[]>(
    `/projects/${projectId}/documents/${documentId}/versions`,
    { token: token() }
  );
}

/**
 * Upload a new document. Uses multipart/form-data — do NOT set Content-Type;
 * the browser sets it with the boundary automatically.
 */
export async function uploadDocument(
  projectId: string,
  file: File,
  category: DocumentCategory,
  description?: string
): Promise<DocumentResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  if (description) formData.append("description", description);

  const accessToken = token();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  const res = await fetch(`${API_BASE}/projects/${projectId}/documents`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `Upload failed ${res.status}`);
  }

  return res.json() as Promise<DocumentResponse>;
}

/**
 * Upload a new version of an existing document.
 */
export async function uploadVersion(
  projectId: string,
  documentId: string,
  file: File,
  description?: string
): Promise<DocumentResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (description) formData.append("description", description);

  const accessToken = token();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/documents/${documentId}/versions`,
    { method: "POST", headers, body: formData }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `Upload failed ${res.status}`);
  }

  return res.json() as Promise<DocumentResponse>;
}

/**
 * Returns the download URL for a document (requires auth — add token as header not possible
 * for direct anchor links; use window.open or a proxied download).
 */
export function getDownloadUrl(projectId: string, documentId: string): string {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  return `${API_BASE}/projects/${projectId}/documents/${documentId}/download`;
}
