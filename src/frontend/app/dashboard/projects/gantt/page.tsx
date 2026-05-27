"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart2 } from "lucide-react";
import { listProjects } from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";
import { MultiProjectGantt } from "@/components/gantt/MultiProjectGantt";

export default function MultiProjectGanttPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects(1, 50)
      .then((res) => {
        // Show only active projects
        const active = res.data.filter((p) => p.status === "active");
        setProjects(active);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/projects"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar projecten
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <BarChart2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Multi-project Gantt</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gecombineerde tijdlijn van alle actieve projecten
          </p>
        </div>
      </div>

      <MultiProjectGantt projects={projects} />
    </div>
  );
}
