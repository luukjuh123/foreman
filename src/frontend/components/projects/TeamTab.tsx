"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { SubcontractorResponse, SubcontractorListResponse } from "@/lib/subcontractors";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TeamTabProps {
  projectId: string;
  phases: { id: string; name: string }[];
}

interface PhaseAssignment {
  phaseName: string;
  phaseId: string;
  assignments: { id: string; subcontractor_id: string; hourly_rate_cents: number | null }[];
}

export function TeamTab({ phases }: TeamTabProps) {
  const [phaseAssignments, setPhaseAssignments] = useState<PhaseAssignment[]>([]);
  const [subMap, setSubMap] = useState<Record<string, SubcontractorResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch all subcontractors for name lookup
        const subList = await apiFetch<SubcontractorListResponse>(
          "/subcontractors/?page=1&per_page=200"
        );
        const map: Record<string, SubcontractorResponse> = {};
        for (const s of subList.data) map[s.id] = s;
        setSubMap(map);

        // Fetch assignments per phase
        const results: PhaseAssignment[] = await Promise.all(
          phases.map(async (ph) => {
            const res = await apiFetch<{
              data: { id: string; subcontractor_id: string; hourly_rate_cents: number | null }[];
            }>(`/subcontractors/assignments/phase/${ph.id}`);
            return {
              phaseName: ph.name,
              phaseId: ph.id,
              assignments: res.data,
            };
          })
        );
        setPhaseAssignments(results);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [phases]);

  const hasAssignments = phaseAssignments.some((pa) => pa.assignments.length > 0);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Team &amp; Onderaannemers</h2>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !hasAssignments ? (
        <p className="text-sm text-muted-foreground">
          Geen onderaannemers toegewezen.{" "}
          <Link href="/dashboard/subcontractors" className="underline hover:text-foreground">
            Beheer onderaannemers
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          {phaseAssignments
            .filter((pa) => pa.assignments.length > 0)
            .map((pa) => (
              <div key={pa.phaseId} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{pa.phaseName}</h3>
                {pa.assignments.map((a) => {
                  const sub = subMap[a.subcontractor_id];
                  return (
                    <Card key={a.id}>
                      <CardContent className="flex items-center gap-3 py-3 px-4">
                        <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {sub?.company_name ?? a.subcontractor_id}
                          </p>
                          {a.hourly_rate_cents != null && (
                            <p className="text-xs text-muted-foreground">
                              Tarief:{" "}
                              {new Intl.NumberFormat("nl-NL", {
                                style: "currency",
                                currency: "EUR",
                              }).format(a.hourly_rate_cents / 100)}
                              /uur
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
