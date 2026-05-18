"use client";

import React from "react";

interface GanttTimelineProps {
  startDate: Date;
  endDate: Date;
  dayWidthPx: number;
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function GanttTimeline({ startDate, endDate, dayWidthPx }: GanttTimelineProps) {
  const days: Date[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return (
    <div className="flex sticky top-0 z-10 bg-[#1a1f2e] border-b border-gray-700">
      {days.map((day, i) => {
        const isMonday = day.getDay() === 1;
        const weekNum = isoWeekNumber(day);
        return (
          <div
            key={i}
            data-testid="gantt-day-cell"
            className="relative flex-shrink-0 border-r border-gray-700/50 text-center"
            style={{ width: `${dayWidthPx}px` }}
          >
            {isMonday && (
              <div
                data-testid="gantt-week-marker"
                className="absolute top-0 left-0 w-full text-[9px] text-amber-400 font-semibold px-0.5 leading-tight"
              >
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
