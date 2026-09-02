import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentResponse {
  id: string;
  project_id: string;
  filename: string;
  original_filename: string;
  category: string;
  description: string | null;
  file_size_bytes: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentListResponse {
  data: DocumentResponse[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function listDocuments(
  projectId: string,
  category?: string
): Promise<DocumentListResponse> {
  const params = new URLSearchParams({ offset: "0", limit: "100" });
  if (category) params.set("category", category);
  return apiFetch<DocumentListResponse>(
    `/projects/${projectId}/documents?${params.toString()}`,
    { token: token() }
  );
}

export async function uploadDocument(
  projectId: string,
  file: File,
  category = "other",
  description?: string
): Promise<DocumentResponse> {
  const tok = token();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  if (description) formData.append("description", description);

  const headers: Record<string, string> = {};
  if (tok) headers["Authorization"] = `Bearer ${tok}`;

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  const res = await fetch(`${apiBase}/projects/${projectId}/documents`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `Upload fout ${res.status}`);
  }
  return res.json() as Promise<DocumentResponse>;
}

export async function getDocumentDownloadUrl(
  projectId: string,
  documentId: string
): Promise<string> {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  return `${apiBase}/projects/${projectId}/documents/${documentId}/download`;
}
