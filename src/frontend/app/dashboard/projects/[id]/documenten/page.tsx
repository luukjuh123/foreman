"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Upload, Trash2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { ProjectHubTabBar } from "@/components/project-hub/ProjectHubTabBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentResponse {
  id: string;
  project_id: string;
  uploaded_by: string;
  name: string;
  description: string | null;
  category: string;
  mime_type: string;
  size_bytes: number;
  version: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  contract: "Contract",
  permit: "Vergunning",
  drawing: "Tekening",
  photo: "Foto",
  other: "Overig",
};

const CATEGORIES = ["contract", "permit", "drawing", "photo", "other"] as const;
type Category = (typeof CATEGORIES)[number];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDocDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Document row
// ---------------------------------------------------------------------------

function DocumentRow({
  doc,
  projectId,
  onDelete,
}: {
  doc: DocumentResponse;
  projectId: string;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Document "${doc.name}" verwijderen?`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/projects/${projectId}/documents/${doc.id}`, {
        method: "DELETE",
      });
      onDelete(doc.id);
    } catch {
      // silently ignore
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{doc.name}</p>
          <p className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[doc.category] ?? doc.category} · v{doc.version} ·{" "}
            {formatFileSize(doc.size_bytes)} · {formatDocDate(doc.created_at)}
          </p>
          {doc.description && (
            <p className="text-xs text-muted-foreground truncate">{doc.description}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"}/projects/${projectId}/documents/${doc.id}/download`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Download ${doc.name}`}
          className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          aria-label={`Verwijder ${doc.name}`}
          disabled={deleting}
          onClick={handleDelete}
          className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload form
// ---------------------------------------------------------------------------

function UploadForm({
  projectId,
  onUploaded,
}: {
  projectId: string;
  onUploaded: (doc: DocumentResponse) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<Category>("other");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    if (description) form.append("description", description);

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("foreman_access_token")
          : null;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"}/projects/${projectId}/documents`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Upload mislukt (${res.status})`);
      }
      const doc: DocumentResponse = await res.json();
      onUploaded(doc);
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Document uploaden</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="doc-category" className="mb-1 block text-sm font-medium">
                Categorie
              </label>
              <select
                id="doc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="doc-description" className="mb-1 block text-sm font-medium">
                Omschrijving (optioneel)
              </label>
              <input
                id="doc-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Bijv. getekend contract"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label htmlFor="doc-file" className="mb-1 block text-sm font-medium">
              Bestand (max 50 MB)
            </label>
            <input
              ref={fileRef}
              id="doc-file"
              type="file"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={uploading} size="sm">
            <Upload className="mr-1.5 h-4 w-4" />
            {uploading ? "Uploaden…" : "Uploaden"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentenPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    apiFetch<DocumentListResponse>(`/projects/${projectId}/documents`)
      .then((res) => setDocs(res.items))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered =
    categoryFilter === "all"
      ? docs
      : docs.filter((d) => d.category === categoryFilter);

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/projects/${projectId}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar project
        </Button>
      </Link>

      <ProjectHubTabBar projectId={projectId} />

      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Documenten</h2>
        <p className="text-sm text-muted-foreground">
          Contracten, vergunningen en tekeningen voor dit project.
        </p>
      </div>

      <UploadForm
        projectId={projectId}
        onUploaded={(doc) => setDocs((prev) => [doc, ...prev])}
      />

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {["all", ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoryFilter(c)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === c
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {c === "all" ? "Alles" : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {categoryFilter === "all"
                ? "Nog geen documenten geüpload."
                : `Geen ${CATEGORY_LABELS[categoryFilter] ?? categoryFilter} gevonden.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              projectId={projectId}
              onDelete={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
