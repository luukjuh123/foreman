"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { autofillPlanning, applyPlanning, PlanningProposal } from "@/lib/planning";
import type { ProjectResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDutchDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
}

function buildTaskMap(project: ProjectResponse): Record<string, string> {
  const map: Record<string, string> = {};
  for (const phase of project.phases) {
    for (const task of phase.tasks) {
      map[task.id] = task.name;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  project: ProjectResponse;
}

export default function AIPlanningPanel({ project }: Props) {
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposals, setProposals] = useState<PlanningProposal[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const taskMap = buildTaskMap(project);
  const startDate = project.start_date ?? new Date().toISOString().split("T")[0];

  async function handleGenerate() {
    setError(null);
    setSuccessCount(null);
    setGenerating(true);
    try {
      const result = await autofillPlanning({
        project_id: project.id,
        start_date: startDate,
      });
      setProposals(result.proposals);
      setSelected(new Set(result.proposals.map((p) => p.task_id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleApply() {
    if (!proposals) return;
    setError(null);
    setApplying(true);
    try {
      const result = await applyPlanning({
        project_id: project.id,
        task_ids: proposals.filter((p) => selected.has(p.task_id)).map((p) => p.task_id),
        start_date: startDate,
      });
      setSuccessCount(result.updated_count);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  function toggleProposal(taskId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  return (
    <Card className="bg-[#1a1f2e] border-[#2a2f3e]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-gray-200">AI-planning</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
        >
          {generating ? "Bezig met genereren…" : "AI-planning genereren"}
        </Button>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Success */}
        {successCount !== null && (
          <p className="text-sm text-green-400">{successCount} taken bijgewerkt</p>
        )}

        {/* Proposals */}
        {proposals && proposals.length > 0 && (
          <div className="space-y-3">
            <ul className="space-y-2">
              {proposals.map((proposal) => (
                <li
                  key={proposal.task_id}
                  className="flex items-start gap-3 rounded-md bg-[#0f1117] p-3"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-amber-500"
                    checked={selected.has(proposal.task_id)}
                    onChange={() => toggleProposal(proposal.task_id)}
                  />
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-200">
                        {taskMap[proposal.task_id] ?? proposal.task_id}
                      </span>
                      {proposal.is_critical && (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                          Kritiek pad
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {formatDutchDate(proposal.proposed_start_date)} –{" "}
                      {formatDutchDate(proposal.proposed_end_date)}
                    </p>
                    <p className="text-xs text-gray-500">{proposal.reasoning}</p>
                  </div>
                </li>
              ))}
            </ul>

            <Button
              onClick={handleApply}
              disabled={applying || selected.size === 0}
              variant="outline"
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
            >
              {applying ? "Toepassen…" : "Geselecteerde toepassen"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
