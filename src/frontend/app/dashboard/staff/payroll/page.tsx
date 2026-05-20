"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DollarSign, Plus, ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { StaffResponse, StaffListResponse, ProjectListResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayrollProjectBreakdown {
  project_id: string | null;
  hours: number;
  gross_cents: number;
}

interface PayrollSummary {
  staff_id: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  gross_cents: number;
  by_project: PayrollProjectBreakdown[];
}

interface TimeEntryCreate {
  staff_id: string;
  work_date: string;
  hours: number;
  project_id?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function formatHours(h: number): string {
  return h.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function currentMonthEnd(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Log Hours Modal
// ---------------------------------------------------------------------------

interface LogHoursModalProps {
  staff: StaffResponse[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function LogHoursModal({ staff, projects, onClose, onSaved }: LogHoursModalProps) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: TimeEntryCreate = {
      staff_id: staffId,
      work_date: workDate,
      hours: parseFloat(hours),
      project_id: projectId || undefined,
      notes: notes || undefined,
    };
    try {
      await apiFetch("/payroll/time-entries", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Uren Registreren</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Sluiten">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="log-staff" className="text-sm font-medium">Medewerker</label>
              <select
                id="log-staff"
                aria-label="Medewerker"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="log-project" className="text-sm font-medium">Project (optioneel)</label>
              <select
                id="log-project"
                aria-label="Project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Geen project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="log-date" className="text-sm font-medium">Datum</label>
              <Input
                id="log-date"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="log-hours" className="text-sm font-medium">Uren</label>
              <Input
                id="log-hours"
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="log-notes" className="text-sm font-medium">Notities</label>
              <Input
                id="log-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optioneel"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Annuleren
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Opslaan…" : "Opslaan"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff Payroll Row (expandable)
// ---------------------------------------------------------------------------

interface StaffRowProps {
  member: StaffResponse;
  summary: PayrollSummary | null;
  projectMap: Record<string, string>;
}

function StaffPayrollRow({ member, summary, projectMap }: StaffRowProps) {
  const [expanded, setExpanded] = useState(false);

  const totalHours = summary?.total_hours ?? 0;
  const grossCents = summary?.gross_cents ?? 0;

  return (
    <>
      <tr
        data-testid={`row-${member.id}`}
        className="cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm font-medium">{member.full_name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{member.role}</td>
        <td className="px-4 py-3 text-sm tabular-nums" data-testid={`hours-${member.id}`}>
          {formatHours(totalHours)}
        </td>
        <td className="px-4 py-3 text-sm tabular-nums font-medium" data-testid={`gross-${member.id}`}>
          {formatMoney(grossCents)}
        </td>
      </tr>

      {expanded && summary && (
        <tr data-testid={`breakdown-${member.id}`}>
          <td colSpan={4} className="px-4 pb-3">
            <div className="ml-6 rounded-md border border-border bg-muted/30 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Project</th>
                    <th className="px-3 py-2 text-left font-medium">Uren</th>
                    <th className="px-3 py-2 text-left font-medium">Bedrag</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_project.map((bp, idx) => (
                    <tr key={idx} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">
                        {bp.project_id ? (projectMap[bp.project_id] ?? bp.project_id) : "— Geen project —"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatHours(bp.hours)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(bp.gross_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PayrollOverviewPage() {
  const [periodStart, setPeriodStart] = useState(currentMonthStart());
  const [periodEnd, setPeriodEnd] = useState(currentMonthEnd());
  const [staff, setStaff] = useState<StaffResponse[]>([]);
  const [summaries, setSummaries] = useState<Record<string, PayrollSummary>>({});
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showLogHours, setShowLogHours] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, projectsRes] = await Promise.all([
        apiFetch<StaffListResponse>("/staff/?page=1&per_page=100"),
        apiFetch<ProjectListResponse>("/projects/?page=1&per_page=100"),
      ]);
      const activeStaff = staffRes.data;
      setStaff(activeStaff);

      const pMap: Record<string, string> = {};
      for (const p of projectsRes.data) {
        pMap[p.id] = p.name;
      }
      setProjectMap(pMap);

      const payrollResults = await Promise.all(
        activeStaff.map((s) =>
          apiFetch<PayrollSummary>(
            `/payroll/staff/${s.id}/payroll?period_start=${periodStart}&period_end=${periodEnd}`
          ).catch(() => null)
        )
      );

      const newSummaries: Record<string, PayrollSummary> = {};
      payrollResults.forEach((summary, idx) => {
        if (summary) {
          newSummaries[activeStaff[idx].id] = summary;
        }
      });
      setSummaries(newSummaries);
    } catch {
      // silently degrade — individual rows show 0
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalHours = Object.values(summaries).reduce((acc, s) => acc + s.total_hours, 0);
  const totalGross = Object.values(summaries).reduce((acc, s) => acc + s.gross_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Verloning</h1>
        </div>
        <Button size="sm" onClick={() => setShowLogHours(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Uren registreren
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="period-start" className="text-sm text-muted-foreground whitespace-nowrap">
                Van
              </label>
              <input
                id="period-start"
                data-testid="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="period-end" className="text-sm text-muted-foreground whitespace-nowrap">
                Tot en met
              </label>
              <input
                id="period-end"
                data-testid="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Overzicht per medewerker</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          {loading ? (
            <div className="px-4 py-6 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Medewerker
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Functie
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Uren
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Bruto loon
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {staff.map((member) => (
                  <StaffPayrollRow
                    key={member.id}
                    member={member}
                    summary={summaries[member.id] ?? null}
                    projectMap={projectMap}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="px-4 py-3 text-sm" colSpan={2}>Totaal</td>
                  <td className="px-4 py-3 text-sm tabular-nums" data-testid="total-hours">
                    {formatHours(totalHours)}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums" data-testid="total-gross">
                    {formatMoney(totalGross)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {showLogHours && (
        <LogHoursModal
          staff={staff}
          projects={Object.entries(projectMap).map(([id, name]) => ({ id, name }))}
          onClose={() => setShowLogHours(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
