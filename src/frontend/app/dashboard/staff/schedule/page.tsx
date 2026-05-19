"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listStaff, listAssignments } from "@/lib/staff";
import { getProjectColor } from "@/lib/agenda";
import type { StaffResponse, StaffAssignmentResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const DUTCH_DAY_ABBR = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
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

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDutchDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function toTimeStr(isoDatetime: string): string {
  const t = isoDatetime.includes("T") ? isoDatetime.split("T")[1] : isoDatetime;
  return t.slice(0, 5);
}

function toDatePart(isoDatetime: string): string {
  return isoDatetime.includes("T") ? isoDatetime.split("T")[0] : isoDatetime.slice(0, 10);
}

function AssignmentBlock({ assignment }: { assignment: StaffAssignmentResponse }) {
  const color = getProjectColor(assignment.project_id);
  const startTime = toTimeStr(assignment.start_at);
  const endTime = toTimeStr(assignment.end_at);

  return (
    <div
      className="rounded p-1.5 mb-1 text-xs border-l-4 bg-card shadow-sm"
      style={{ borderLeftColor: color }}
    >
      {assignment.project_name && (
        <p className="font-semibold text-foreground truncate">{assignment.project_name}</p>
      )}
      <p className="text-muted-foreground">
        {startTime}–{endTime}
      </p>
      {assignment.notes && (
        <p className="text-muted-foreground truncate">{assignment.notes}</p>
      )}
    </div>
  );
}

export default function StaffSchedulePage() {
  const [weekStart, setWeekStart] = useState<string>(() =>
    toISODate(getMondayOf(new Date()))
  );
  const [staff, setStaff] = useState<StaffResponse[]>([]);
  const [assignmentMap, setAssignmentMap] = useState<
    Record<string, Record<string, StaffAssignmentResponse[]>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekDates: string[] = Array.from({ length: 7 }, (_, i) =>
    toISODate(addDays(new Date(weekStart), i))
  );

  const load = useCallback(
    async (ws: string) => {
      setLoading(true);
      setError(null);
      try {
        const staffList = await listStaff(1, 100);
        const members = staffList.data;
        setStaff(members);

        const results = await Promise.all(
          members.map((s) => listAssignments({ staffId: s.id }))
        );

        const map: Record<string, Record<string, StaffAssignmentResponse[]>> = {};
        const weekEnd = toISODate(addDays(new Date(ws), 6));
        members.forEach((s, idx) => {
          map[s.id] = {};
          for (const a of results[idx]) {
            const datePart = toDatePart(a.start_at);
            if (datePart >= ws && datePart <= weekEnd) {
              if (!map[s.id][datePart]) map[s.id][datePart] = [];
              map[s.id][datePart].push(a);
            }
          }
        });
        setAssignmentMap(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fout bij laden");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  function goPrevWeek() {
    setWeekStart((ws) => toISODate(addDays(new Date(ws), -7)));
  }

  function goNextWeek() {
    setWeekStart((ws) => toISODate(addDays(new Date(ws), 7)));
  }

  function goTodayWeek() {
    setWeekStart(toISODate(getMondayOf(new Date())));
  }

  const weekEnd = toISODate(addDays(new Date(weekStart), 6));
  const todayIso = toISODate(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Personeelsplanning</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrevWeek} aria-label="Vorige week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goTodayWeek}>
            Vandaag
          </Button>
          <Button variant="outline" size="sm" onClick={goNextWeek} aria-label="Volgende week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!loading && !error && (
        <p className="text-sm text-muted-foreground">
          Week van {formatDutchDate(weekStart)} t/m {formatDutchDate(weekEnd)}
        </p>
      )}

      {loading && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Laden…</CardContent>
        </Card>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="py-10 text-center text-destructive">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 bg-muted text-muted-foreground font-medium border-b w-40 min-w-[10rem]">
                    Medewerker
                  </th>
                  {weekDates.map((date, idx) => (
                    <th
                      key={date}
                      className={cn(
                        "px-2 py-2 text-center border-b font-medium min-w-[100px]",
                        date === todayIso
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <span className="block text-sm">{DUTCH_DAY_ABBR[idx]}</span>
                      <span className="block text-xs">{formatDutchDate(date)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="px-3 py-2 align-top bg-muted/30 font-medium text-foreground whitespace-nowrap">
                      <p className="truncate max-w-[9rem]">{member.full_name}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </td>
                    {weekDates.map((date) => {
                      const dayAssignments = assignmentMap[member.id]?.[date] ?? [];
                      return (
                        <td
                          key={date}
                          className={cn(
                            "px-1.5 py-1.5 align-top min-h-[60px]",
                            date === todayIso && "bg-primary/5"
                          )}
                        >
                          {dayAssignments.map((a) => (
                            <AssignmentBlock key={a.id} assignment={a} />
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
