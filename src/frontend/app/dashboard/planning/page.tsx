"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { listProjects } from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";
import { MultiProjectGantt } from "@/components/planning/MultiProjectGantt";
import type { ZoomLevel } from "@/components/planning/GanttTimeline";

const ZOOM_LABELS: { level: ZoomLevel; label: string; testId: string }[] = [
  { level: "week", label: "Week", testId: "zoom-week" },
  { level: "month", label: "Maand", testId: "zoom-month" },
  { level: "quarter", label: "Kwartaal", testId: "zoom-quarter" },
];

export default function PlanningPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("month");

  useEffect(() => {
    listProjects(1, 100)
      .then((res) => {
        // Only show active projects in the planning view
        const active = res.data.filter((p) => p.status === "active");
        setProjects(active);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleProjectClick(projectId: string) {
    router.push(`/dashboard/projects/${projectId}`);
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarRange className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Planning</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Gecombineerde tijdlijn van alle actieve projecten
            </p>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-[#1a1f2e] p-1">
          {ZOOM_LABELS.map(({ level, label, testId }) => (
            <button
              key={level}
              data-testid={testId}
              onClick={() => setZoomLevel(level)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                zoomLevel === level
                  ? "bg-amber-500 text-black"
                  : "text-muted-foreground hover:text-foreground hover:bg-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {projects.length === 0 ? (
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <CalendarRange className="h-12 w-12 text-gray-600 mb-4" />
          <p className="text-lg font-semibold text-gray-400">Geen actieve projecten</p>
          <p className="text-sm text-gray-600 mt-1">
            Zet een project op actief om het hier te zien.
          </p>
        </div>
      ) : (
        <div className="w-full overflow-hidden" style={{ height: "calc(100vh - 180px)" }}>
          <MultiProjectGantt
            projects={projects}
            zoomLevel={zoomLevel}
            onProjectClick={handleProjectClick}
          />
        </div>
      )}
    </div>
  );
}
