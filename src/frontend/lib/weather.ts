/**
 * Weather helper utilities for frontend display.
 *
 * Mirrors the backend thresholds for client-side classification so the UI
 * can classify raw forecast data without an extra API round-trip.
 */

import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeatherDayForecast {
  date: string; // ISO date
  temp_min: number;
  temp_max: number;
  precipitation_mm: number;
  wind_speed_kmh: number;
  weather_code: number;
  description: string;
}

export type WeatherRisk = "good" | "moderate" | "poor";

export interface WeatherDayDisplay extends WeatherDayForecast {
  weather_risk: WeatherRisk;
}

export interface RescheduleSuggestion {
  task_id: string;
  task_name: string;
  project_id: string;
  phase_id: string;
  current_start: string;
  current_end: string;
  suggested_start: string | null;
  suggested_end: string | null;
  weather_risk: "rain" | "wind" | "frost";
  weather_details: string;
}

export interface RescheduleItem {
  task_id: string;
  new_start: string;
  new_end: string;
}

export interface RescheduleResponse {
  updated_count: number;
}

// ---------------------------------------------------------------------------
// Classification helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Classify a day's weather conditions into good / moderate / poor.
 * Mirrors thresholds from app/services/weather/rescheduling.py.
 */
export function classifyWeatherDay(day: {
  precipitation_mm: number;
  wind_speed_kmh: number;
  temp_min: number;
}): WeatherRisk {
  if (day.precipitation_mm > 10 || day.wind_speed_kmh > 60 || day.temp_min <= -2) {
    return "poor";
  }
  if (day.precipitation_mm > 2 || day.wind_speed_kmh >= 40) {
    return "moderate";
  }
  return "good";
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export async function fetchForecast(projectId: string): Promise<WeatherDayDisplay[]> {
  const raw: WeatherDayForecast[] = await apiFetch(
    `/api/v1/weather/forecast?project_id=${projectId}`,
    { headers: { Authorization: `Bearer ${token()}` } }
  );
  return raw.map((d) => ({
    ...d,
    weather_risk: classifyWeatherDay(d),
  }));
}

export async function fetchRescheduleSuggestions(
  projectId: string
): Promise<RescheduleSuggestion[]> {
  return apiFetch(
    `/api/v1/weather/reschedule-suggestions?project_id=${projectId}`,
    { headers: { Authorization: `Bearer ${token()}` } }
  );
}

export async function applyReschedules(
  projectId: string,
  reschedules: RescheduleItem[]
): Promise<RescheduleResponse> {
  return apiFetch(`/api/v1/weather/reschedule`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify({ project_id: projectId, reschedules }),
  });
}
