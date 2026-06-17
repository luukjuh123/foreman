"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DocumentList } from "@/components/documents/document-list";
import { listProjects } from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";
import type { DocumentCategory } from "@/lib/documents";
import { FileSignature } from "lucide-react";

// ---------------------------------------------------------------------------
// Category tabs for the contracts view
// ---------------------------------------------------------------------------

const CATEGORY_TABS: { key: DocumentCategory | "contract"; label: string }[] = [
  { key: "contract", label: "Contracten" },
  { key: "permit", label: "Vergunningen" },
  { key: "drawing", label: "Tekeningen" },
];

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
        <FileSignature className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">Nog geen contracten</h3>
      <p className="max-w-xs text-xs text-muted-foreground">
        Selecteer een project hierboven om contracten te beheren.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContractenPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [categoryTab, setCategoryTab] = useState<DocumentCategory>("contract");

  useEffect(() => {
    listProjects(1, 100)
      .then((res) => {
        setProjects(res.data);
        if (res.data.length > 0) {
          setSelectedProjectId(res.data[0].id);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Contracten &amp; documenten</h1>
        <p className="text-xs text-muted-foreground">
          Beheer contracten, vergunningen en tekeningen per project.
        </p>
      </div>

      {/* Project selector */}
      <div className="flex items-center gap-3">
        <label className="shrink-0 text-sm font-medium text-muted-foreground">Project:</label>
        {loadingProjects ? (
          <Skeleton className="h-9 w-52" />
        ) : (
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[200px]"
          >
            {projects.length === 0 && (
              <option value="">Geen projecten</option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Document area */}
      {!selectedProjectId ? (
        <EmptyState />
      ) : (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {projects.find((p) => p.id === selectedProjectId)?.name ?? "Project"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={categoryTab} onValueChange={(v) => setCategoryTab(v as DocumentCategory)}>
              <TabsList className="mb-4">
                {CATEGORY_TABS.map(({ key, label }) => (
                  <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
                ))}
              </TabsList>

              {CATEGORY_TABS.map(({ key }) => (
                <TabsContent key={key} value={key}>
                  <DocumentList
                    projectId={selectedProjectId}
                    defaultCategory={key as DocumentCategory}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
