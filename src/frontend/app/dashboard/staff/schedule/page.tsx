"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
  hourly_rate_cents: number;
  active: boolean;
}

interface StaffListResponse {
  data: StaffMember[];
  total: number;
  page: number;
  per_page: number;
}

interface ProjectItem {
  id: string;
  name: string;
  status: string;
}

interface ProjectListResponse {
  data: ProjectItem[];
  total: number;
  page: number;
  per_page: number;
}

interface StaffAssignment {
  id: string;
  staff_id: string;
  project_id: string;
  task_id: string | null;
  start_at: string;
  end_at: string;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Returns Monday of the week containing the given date. */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Format a Date as YYYY-MM-DD */
function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Format a Date as e.g. "18 mei" */
function formatShortDate(date: Date): string {
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

const WEEKDAY_NAMES = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];

// Project color palette — deterministic from project id
const COLORS = [
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-green-100 text-green-800 border-green-200",
  "bg-purple-100 text-purple-800 border-purple-200",
  "bg-orange-100 text-orange-800 border-orange-200",
  "bg-pink-100 text-pink-800 border-pink-200",
  "bg-teal-100 text-teal-800 border-teal-200",
  "bg-yellow-100 text-yellow-800 border-yellow-200",
  "bg-red-100 text-red-800 border-red-200",
];

function projectColor(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) & 0xffff;
  }
  return COLORS[hash % COLORS.length];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StaffSchedulePage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [projects, setProjects] = useState<Map<string, string>>(new Map());
  const [assignments, setAssignments] = useState<Map<string, StaffAssignment[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Weekday dates for the current week (Mon–Fri)
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const loadData = useCallback(
    async (monday: Date) => {
      setLoading(true);
      try {
        // Fetch staff and projects in parallel
        const [staffRes, projectRes] = await Promise.all([
          apiFetch<StaffListResponse>("/staff/?page=1&per_page=100"),
          apiFetch<ProjectListResponse>("/projects/?page=1&per_page=100"),
        ]);

        const activeStaff = staffRes.data.filter((s) => s.active);
        setStaff(activeStaff);

        const projectMap = new Map<string, string>();
        for (const p of projectRes.data) {
          projectMap.set(p.id, p.name);
        }
        setProjects(projectMap);

        // Fetch assignments for each active staff member in parallel
        const weekEnd = addDays(monday, 6);
        const startParam = toISODate(monday);
        const endParam = toISODate(weekEnd);

        const assignmentResults = await Promise.all(
          activeStaff.map((s) =>
            apiFetch<StaffAssignment[]>(
              `/assignments/?staff_id=${s.id}&start_after=${startParam}&end_before=${endParam}`
            ).catch(() => [] as StaffAssignment[])
          )
        );

        const newMap = new Map<string, StaffAssignment[]>();
        for (let i = 0; i < activeStaff.length; i++) {
          newMap.set(activeStaff[i].id, assignmentResults[i]);
        }
        setAssignments(newMap);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadData(weekStart);
  }, [weekStart, loadData]);

  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));

  // Check if any assignments exist for this week
  const hasAnyAssignment = Array.from(assignments.values()).some((list) => list.length > 0);

  // Returns assignments for a specific staff member on a specific day
  function getAssignmentsForDay(staffId: string, day: Date): StaffAssignment[] {
    const dayStr = toISODate(day);
    return (assignments.get(staffId) ?? []).filter((a) => {
      const aDate = a.start_at.slice(0, 10);
      return aDate === dayStr;
    });
  }

  const weekLabel = `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 4))}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Personeelsplanning</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevWeek} aria-label="Vorige week">
            <ChevronLeft className="h-4 w-4" />
            Vorige
          </Button>
          <span className="text-sm font-medium text-muted-foreground min-w-[140px] text-center">
            {weekLabel}
          </span>
          <Button variant="outline" size="sm" onClick={nextWeek} aria-label="Volgende week">
            Volgende
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen actief personeel gevonden.</p>
      ) : !hasAnyAssignment ? (
        <p className="text-sm text-muted-foreground">Geen inplanningen voor deze week.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {/* Staff column header */}
                <th className="w-40 min-w-[10rem] border border-border bg-muted px-3 py-2 text-left font-semibold text-muted-foreground">
                  Medewerker
                </th>
                {weekDays.map((day, i) => (
                  <th
                    key={i}
                    className="border border-border bg-muted px-3 py-2 text-left font-semibold text-muted-foreground"
                  >
                    <div>{WEEKDAY_NAMES[i]}</div>
                    <div className="text-xs font-normal">{formatShortDate(day)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="hover:bg-muted/30">
                  {/* Staff name + role */}
                  <td className="border border-border px-3 py-2 align-top">
                    <p className="font-medium text-foreground">{member.full_name}</p>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </td>
                  {/* Day cells */}
                  {weekDays.map((day, di) => {
                    const dayAssignments = getAssignmentsForDay(member.id, day);
                    return (
                      <td key={di} className="border border-border px-2 py-1 align-top">
                        <div className="flex flex-col gap-1">
                          {dayAssignments.map((a) => {
                            const projectName = projects.get(a.project_id) ?? a.project_id;
                            return (
                              <div
                                key={a.id}
                                className={`rounded border px-2 py-1 text-xs font-medium ${projectColor(a.project_id)}`}
                              >
                                {projectName}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
