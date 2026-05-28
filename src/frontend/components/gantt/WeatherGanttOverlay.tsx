"use client";

import React from "react";
import type { WeatherDayDisplay, WeatherRisk } from "@/lib/weather";
import { cn } from "@/lib/utils";

interface WeatherGanttOverlayProps {
  startDate: Date;
  endDate: Date;
  dayWidthPx: number;
  forecast: WeatherDayDisplay[];
}

const RISK_ICON: Record<WeatherRisk, string> = {
  good: "☀",
  moderate: "🌦",
  poor: "🌧",
};

const RISK_BG: Record<WeatherRisk, string> = {
  good: "bg-emerald-900/20",
  moderate: "bg-amber-900/30",
  poor: "bg-red-900/40",
};

/**
 * Renders a row of per-day weather indicators aligned with the Gantt timeline.
 * Positioned below the day header row.
 */
export function WeatherGanttOverlay({
  startDate,
  endDate,
  dayWidthPx,
  forecast,
}: WeatherGanttOverlayProps) {
  const forecastMap = new Map(forecast.map((d) => [d.date, d]));

  const days: Date[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return (
    <div
      data-testid="weather-gantt-overlay"
      className="flex sticky top-10 z-10 bg-[#0f1117] border-b border-gray-700/50"
      style={{ height: "20px" }}
    >
      {days.map((day, i) => {
        const iso = toIso(day);
        const wd = forecastMap.get(iso);
        const risk: WeatherRisk = wd?.weather_risk ?? "good";
        const icon = wd ? RISK_ICON[risk] : "";
        const title = wd
          ? `${wd.description} — ${wd.precipitation_mm}mm neerslag, ${wd.wind_speed_kmh}km/h wind, min ${wd.temp_min}°C`
          : "";

        return (
          <div
            key={i}
            data-testid="weather-day-cell"
            data-testid-risk={wd ? `weather-risk-${risk}` : undefined}
            title={title}
            className={cn(
              "flex-shrink-0 flex items-center justify-center border-r border-gray-700/30 text-[10px]",
              RISK_BG[risk]
            )}
            style={{ width: `${dayWidthPx}px` }}
          >
            {/* Extra testid element so queries can find by risk level */}
            {wd && (
              <span data-testid={`weather-risk-${risk}`} className="leading-none">
                {icon}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
