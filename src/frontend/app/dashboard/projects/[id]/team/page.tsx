"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatHourlyRate } from "@/lib/staff";
import type { StaffResponse, StaffAssignmentResponse } from "@/lib/types";
import type { SubcontractorAssignment, SubcontractorResponse } from "@/lib/subcontractors";
import { ProjectHubTabBar } from "@/components/project-hub/ProjectHubTabBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffAssignmentWithStaff extends StaffAssignmentResponse {
  staff?: StaffResponse;
}

// ---------------------------------------------------------------------------
// Staff section
// ---------------------------------------------------------------------------

function StaffSection({ projectId }: { projectId: string }) {
  const [assignments, setAssignments] = useState<StaffAssignmentWithStaff[]>([]);
  const [staff, setStaff] = useState<StaffResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<{ data: StaffAssignmentResponse[]; total: number }>(
        `/staff/assignments/?project_id=${projectId}`
      ).catch(() => ({ data: [], total: 0 })),
      apiFetch<{ data: StaffResponse[]; total: number }>(
        `/staff/?per_page=100`
      ).catch(() => ({ data: [], total: 0 })),
    ])
      .then(([assignRes, staffRes]) => {
        const staffMap = new Map(staffRes.data.map((s) => [s.id, s]));
        const enriched = assignRes.data.map((a) => ({
          ...a,
          staff: staffMap.get(a.staff_id),
        }));
        // Deduplicate by staff_id (keep first assignment per staff member)
        const seen = new Set<string>();
        const deduped = enriched.filter((a) => {
          if (seen.has(a.staff_id)) return false;
          seen.add(a.staff_id);
          return true;
        });
        setAssignments(deduped);
        setStaff(staffRes.data);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="py-6 text-center">
        <Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Geen medewerkers toegewezen aan dit project.
        </p>
        <Link
          href="/dashboard/staff"
          className="mt-1 inline-block text-sm text-primary hover:underline"
        >
          Naar personeelsbeheer
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {assignments.map((a) => {
        const member = a.staff;
        return (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {member?.full_name ?? `Medewerker ${a.staff_id.slice(0, 8)}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {member?.role ?? "—"}
                {member && ` · ${formatHourlyRate(member.hourly_rate_cents)}/uur`}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                member?.active
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {member?.active ? "Actief" : "Inactief"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcontractor section
// ---------------------------------------------------------------------------

interface AssignmentListResponse {
  data: SubcontractorAssignment[];
  total: number;
}

function SubcontractorSection({ projectId }: { projectId: string }) {
  const [assignments, setAssignments] = useState<
    (SubcontractorAssignment & { sub?: SubcontractorResponse })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<AssignmentListResponse>(
        `/subcontractors/assignments/?project_id=${projectId}&per_page=50`
      ).catch(() => ({ data: [], total: 0 })),
      apiFetch<{ data: SubcontractorResponse[]; total: number }>(
        `/subcontractors/?per_page=100`
      ).catch(() => ({ data: [], total: 0 })),
    ])
      .then(([asgRes, subRes]) => {
        const subMap = new Map(subRes.data.map((s) => [s.id, s]));
        const enriched = asgRes.data.map((a) => ({
          ...a,
          sub: subMap.get(a.subcontractor_id),
        }));
        setAssignments(enriched);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1].map((i) => (
          <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="py-6 text-center">
        <Building2 className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Geen onderaannemers gekoppeld aan dit project.
        </p>
        <Link
          href="/dashboard/subcontractors"
          className="mt-1 inline-block text-sm text-primary hover:underline"
        >
          Naar onderaannemersbeheer
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {assignments.map((a) => {
        const sub = a.sub;
        const rate = a.hourly_rate_cents ?? sub?.hourly_rate_cents;
        return (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {sub?.company_name ?? `Onderaannemer ${a.subcontractor_id.slice(0, 8)}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {sub?.specialties?.join(", ") || "—"}
                {rate && ` · ${formatHourlyRate(rate)}/uur`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

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
        <h2 className="text-xl font-semibold">Team</h2>
        <p className="text-sm text-muted-foreground">
          Toegewezen medewerkers en onderaannemers voor dit project.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Medewerkers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StaffSection projectId={projectId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Onderaannemers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SubcontractorSection projectId={projectId} />
        </CardContent>
      </Card>
    </div>
  );
}
