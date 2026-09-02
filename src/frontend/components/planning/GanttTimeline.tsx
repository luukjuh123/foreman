"use client";

import React from "react";

export type ZoomLevel = "week" | "month" | "quarter";

export interface GanttTimelineProps {
  startDate: Date;
  endDate: Date;
  dayWidthPx: number;
  zoomLevel: ZoomLevel;
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

export function GanttTimeline({ startDate, endDate, dayWidthPx, zoomLevel }: GanttTimelineProps) {
  const days: Date[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  if (zoomLevel === "week") {
    // Day-level markers with week numbers
    return (
      <div
        data-testid="multi-gantt-timeline-header"
        className="flex sticky top-0 z-10 bg-[#1a1f2e] border-b border-gray-700"
      >
        {days.map((day, i) => {
          const isMonday = day.getDay() === 1;
          const weekNum = isoWeekNumber(day);
          return (
            <div
              key={i}
              className="relative flex-shrink-0 border-r border-gray-700/50 text-center"
              style={{ width: `${dayWidthPx}px` }}
            >
              {isMonday && (
                <div className="absolute top-0 left-0 w-full text-[9px] text-amber-400 font-semibold px-0.5 leading-tight">
                  W{weekNum}
                </div>
              )}
              <span className="block text-[10px] text-gray-500 mt-3 leading-none">
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  if (zoomLevel === "quarter") {
    // Month-level markers for quarter view
    const months: { label: string; widthPx: number }[] = [];
    let prevMonth = -1;
    let monthDays = 0;
    for (const day of days) {
      const m = day.getMonth();
      if (m !== prevMonth) {
        if (prevMonth !== -1) months.push({ label: MONTH_NAMES[prevMonth], widthPx: monthDays * dayWidthPx });
        prevMonth = m;
        monthDays = 1;
      } else {
        monthDays++;
      }
    }
    if (prevMonth !== -1) months.push({ label: MONTH_NAMES[prevMonth], widthPx: monthDays * dayWidthPx });

    return (
      <div
        data-testid="multi-gantt-timeline-header"
        className="flex sticky top-0 z-10 bg-[#1a1f2e] border-b border-gray-700"
      >
        {months.map((m, i) => (
          <div
            key={i}
            className="flex-shrink-0 border-r border-gray-700/50 text-center"
            style={{ width: `${m.widthPx}px` }}
          >
            <span className="block text-[11px] text-gray-400 py-2 font-medium truncate px-1">
              {m.label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // month view — week-level markers
  const weeks: { label: string; widthPx: number }[] = [];
  let prevWeek = -1;
  let weekDays = 0;
  for (const day of days) {
    const w = isoWeekNumber(day);
    if (w !== prevWeek) {
      if (prevWeek !== -1) weeks.push({ label: `W${prevWeek}`, widthPx: weekDays * dayWidthPx });
      prevWeek = w;
      weekDays = 1;
    } else {
      weekDays++;
    }
  }
  if (prevWeek !== -1) weeks.push({ label: `W${prevWeek}`, widthPx: weekDays * dayWidthPx });

  return (
    <div
      data-testid="multi-gantt-timeline-header"
      className="flex sticky top-0 z-10 bg-[#1a1f2e] border-b border-gray-700"
    >
      {weeks.map((w, i) => (
        <div
          key={i}
          className="flex-shrink-0 border-r border-gray-700/50 text-center"
          style={{ width: `${w.widthPx}px` }}
        >
          <span className="block text-[11px] text-amber-400 py-2 font-semibold truncate px-1">
            {w.label}
          </span>
        </div>
      ))}
    </div>
  );
}
