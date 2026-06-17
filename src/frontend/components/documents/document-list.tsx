"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import {
  listDocuments,
  deleteDocument,
  uploadDocument,
  listVersions,
  getDownloadUrl,
  type DocumentResponse,
  type DocumentCategory,
} from "@/lib/documents";
import {
  Upload,
  Download,
  Trash2,
  History,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Category filter chips
// ---------------------------------------------------------------------------

const CATEGORIES: { key: DocumentCategory | "all"; label: string }[] = [
  { key: "all", label: "Alles" },
  { key: "contract", label: "Contract" },
  { key: "permit", label: "Vergunning" },
  { key: "drawing", label: "Tekening" },
  { key: "photo", label: "Foto" },
  { key: "other", label: "Overig" },
];

// ---------------------------------------------------------------------------
// Upload dialog
// ---------------------------------------------------------------------------

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (doc: DocumentResponse) => void;
  projectId: string;
}

function UploadDialog({ open, onClose, onUploaded, projectId }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setCategory("other");
    setDescription("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const doc = await uploadDocument(projectId, file, category, description || undefined);
      onUploaded(doc);
      reset();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Document uploaden</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Bestand *</label>
            <input
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Categorie *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="contract">Contract</option>
              <option value="permit">Vergunning</option>
              <option value="drawing">Tekening</option>
              <option value="photo">Foto</option>
              <option value="other">Overig</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Omschrijving</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionele omschrijving"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              Annuleren
            </Button>
            <Button type="submit" disabled={!file || uploading}>
              <Upload className="mr-1.5 h-4 w-4" />
              {uploading ? "Uploaden…" : "Uploaden"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Version history dialog
// ---------------------------------------------------------------------------

interface VersionHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  document: DocumentResponse;
}

function VersionHistoryDialog({ open, onClose, projectId, document }: VersionHistoryDialogProps) {
  const [versions, setVersions] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listVersions(projectId, document.id)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, projectId, document.id]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Versiegeschiedenis — {document.name}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">v{v.version}</span>
                <span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
                {v.description && (
                  <span className="max-w-[140px] truncate text-xs text-muted-foreground">
                    {v.description}
                  </span>
                )}
                <a
                  href={getDownloadUrl(projectId, v.id)}
                  className="ml-2 flex items-center gap-1 text-xs text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name: string;
  deleting: boolean;
}

function DeleteConfirmDialog({ open, onClose, onConfirm, name, deleting }: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Document verwijderen</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Weet u zeker dat u <span className="font-medium text-foreground">{name}</span> wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Annuleren
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            {deleting ? "Verwijderen…" : "Verwijderen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Document row
// ---------------------------------------------------------------------------

interface DocumentRowProps {
  doc: DocumentResponse;
  projectId: string;
  onDeleted: (id: string) => void;
}

function DocumentRow({ doc, projectId, onDeleted }: DocumentRowProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteDocument(projectId, doc.id);
      onDeleted(doc.id);
    } catch {
      // ignore — keep dialog open to show retry
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  const fileSizeLabel = doc.size_bytes < 1024 * 1024
    ? `${Math.round(doc.size_bytes / 1024)} KB`
    : `${(doc.size_bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <>
      <div className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5 hover:bg-muted/30">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{doc.name}</p>
          <p className="text-xs text-muted-foreground">
            {fileSizeLabel} · {formatDate(doc.created_at)}
            {doc.description && ` · ${doc.description}`}
          </p>
        </div>
        <StatusBadge status={doc.category} className="shrink-0" />
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={getDownloadUrl(projectId, doc.id)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Downloaden"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Versiegeschiedenis"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
            title="Verwijderen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <VersionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        projectId={projectId}
        document={doc}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        name={doc.name}
        deleting={deleting}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// DocumentList (main export)
// ---------------------------------------------------------------------------

interface DocumentListProps {
  projectId: string;
  /** If set, show only this category by default and hide the category filter */
  defaultCategory?: DocumentCategory | "all";
}

export function DocumentList({ projectId, defaultCategory = "all" }: DocumentListProps) {
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "all">(defaultCategory);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const opts = categoryFilter !== "all" ? { category: categoryFilter as DocumentCategory } : {};
    listDocuments(projectId, opts)
      .then((res) => setDocs(res.items))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [projectId, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  function handleUploaded(doc: DocumentResponse) {
    setDocs((prev) => [doc, ...prev]);
  }

  function handleDeleted(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Category filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategoryFilter(key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                categoryFilter === key
                  ? "bg-primary/20 text-primary"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              data-category={key}
            >
              {label}
            </button>
          ))}
        </div>

        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="mr-1.5 h-4 w-4" />
          Uploaden
        </Button>
      </div>

      {/* Document list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-10 text-center">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Geen documenten</p>
          <p className="text-xs text-muted-foreground/70">Upload het eerste document via de knop.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              projectId={projectId}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
        projectId={projectId}
      />
    </div>
  );
}
