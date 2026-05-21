"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import TimeTracker from "@/components/time-tracking/TimeTracker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unit: string;
  created_at: string;
  updated_at: string;
}

interface ProjectProcessResponse {
  id: string;
  project_id: string;
  process_id: string;
  notes: string | null;
  created_at: string;
  process: ProcessResponse;
}

interface ProjectProcessListResponse {
  data: ProjectProcessResponse[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TimeTrackingPage({ params }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [processes, setProcesses] = useState<ProjectProcessResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);
      const token = getAccessToken();
      apiFetch<ProjectProcessListResponse>(`/processes/projects/${id}`, token ? { token } : {})
        .then((res) => {
          setProcesses(res.data);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        {projectId && (
          <Link href={`/dashboard/projects/${projectId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Terug
            </Button>
          </Link>
        )}
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href={`/dashboard/projects/${projectId}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar project
        </Button>
      </Link>

      {/* Header */}
      <h1 className="text-2xl font-bold text-foreground">Tijdregistratie</h1>

      {/* Process list */}
      {projectId && <TimeTracker projectId={projectId} />}
    </div>
  );
}
