"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getProject } from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { OverzichtTab } from "@/components/projects/OverzichtTab";
import { PlanningTab } from "@/components/projects/PlanningTab";
import { FinancienTab } from "@/components/projects/FinancienTab";
import { DocumentenTab } from "@/components/projects/DocumentenTab";
import { TeamTab } from "@/components/projects/TeamTab";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabKey = "overzicht" | "planning" | "financien" | "documenten" | "team";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overzicht", label: "Overzicht" },
  { key: "planning", label: "Planning" },
  { key: "financien", label: "Financiën" },
  { key: "documenten", label: "Documenten" },
  { key: "team", label: "Team" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Resolve the active tab from ?tab= query param, default "overzicht"
  const rawTab = searchParams.get("tab") ?? "overzicht";
  const activeTab: TabKey = TABS.some((t) => t.key === rawTab)
    ? (rawTab as TabKey)
    : "overzicht";

  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);
      getProject(id)
        .then(setProject)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  function switchTab(tab: TabKey) {
    if (!projectId) return;
    const url = `/dashboard/projects/${projectId}?tab=${tab}`;
    router.push(url);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Terug
          </Button>
        </Link>
        <p className="text-sm text-destructive">{error ?? "Project niet gevonden."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Polished header */}
      <ProjectHeader project={project} />

      {/* Tab bar */}
      <div
        className="flex flex-wrap gap-1 border-b pb-0"
        role="tablist"
        aria-label="Project tabs"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => switchTab(tab.key)}
            data-testid={`tab-${tab.key}`}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === "overzicht" && <OverzichtTab project={project} />}
        {activeTab === "planning" && <PlanningTab projectId={project.id} />}
        {activeTab === "financien" && (
          <FinancienTab projectId={project.id} budgetCents={project.budget_cents} />
        )}
        {activeTab === "documenten" && <DocumentenTab projectId={project.id} />}
        {activeTab === "team" && (
          <TeamTab
            projectId={project.id}
            phases={project.phases.map((p) => ({ id: p.id, name: p.name }))}
          />
        )}
      </div>
    </div>
  );
}
