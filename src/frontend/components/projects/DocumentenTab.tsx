"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Download } from "lucide-react";
import {
  listDocuments,
  uploadDocument,
  getDocumentDownloadUrl,
  formatFileSize,
} from "@/lib/documents";
import type { DocumentResponse } from "@/lib/documents";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  contract: "Contract",
  permit: "Vergunning",
  drawing: "Tekening",
  invoice: "Factuur",
  photo: "Foto",
  other: "Overig",
};

interface DocumentenTabProps {
  projectId: string;
}

export function DocumentenTab({ projectId }: DocumentenTabProps) {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listDocuments(projectId);
      setDocuments(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(projectId, file);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDownload(doc: DocumentResponse) {
    const url = await getDocumentDownloadUrl(projectId, doc.id);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Documenten</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-testid="upload-button"
        >
          <Upload className="mr-1.5 h-4 w-4" />
          {uploading ? "Uploaden…" : "Uploaden"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={handleUpload}
          data-testid="file-input"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen documenten geüpload.</p>
      ) : (
        <div className="space-y-2" data-testid="document-list">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 px-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{doc.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[doc.category] ?? doc.category} ·{" "}
                      {formatFileSize(doc.file_size_bytes)} · {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownload(doc)}
                  aria-label={`Download ${doc.original_filename}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
