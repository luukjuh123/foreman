"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface WeatherRiskBadgeProps {
  riskType: "rain" | "wind" | "frost";
  details: string;
  className?: string;
}

const RISK_CONFIG = {
  rain: { label: "Regen", icon: "🌧", color: "bg-blue-700 text-blue-100" },
  wind: { label: "Wind", icon: "💨", color: "bg-amber-700 text-amber-100" },
  frost: { label: "Vorst", icon: "❄", color: "bg-cyan-800 text-cyan-100" },
} as const;

/**
 * A compact badge indicating a weather risk type.
 * Shows a tooltip with details on hover.
 */
export function WeatherRiskBadge({ riskType, details, className }: WeatherRiskBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const cfg = RISK_CONFIG[riskType];

  return (
    <div className={cn("relative inline-block", className)}>
      <span
        data-testid="weather-risk-badge"
        className={cn(
          "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium cursor-default",
          cfg.color
        )}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span aria-hidden="true">{cfg.icon}</span>
        {cfg.label}
      </span>

      {showTooltip && (
        <div
          data-testid="weather-badge-tooltip"
          className="absolute bottom-full left-0 mb-1 z-50 rounded bg-gray-900 border border-gray-700 px-2 py-1 text-xs text-gray-200 whitespace-nowrap shadow-lg"
        >
          {details}
        </div>
      )}
    </div>
  );
}
