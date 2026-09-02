"""Outdoor weather risk service — Phase 20.

Identifies which active project processes are weather-sensitive (outdoor) and
flags days in a forecast where those processes should not be scheduled.

Outdoor process slugs:
  schilderen   — painting (no rain, frost)
  stucen       — plastering (no rain, frost)
  dakwerk      — roofing (no rain, high wind)
  metselwerk   — masonry (no rain, frost)
  voegwerk     — pointing/grouting (no rain, frost)

Risk thresholds are inherited from the weather client (rain >=5mm, wind >=40kmh,
frost <=0°C). Severity 'danger' is applied when rain >=20mm or wind >=70kmh.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.weather.client import (
    _FROST_THRESHOLD_C,
    _RAIN_THRESHOLD_MM,
    _WIND_THRESHOLD_KMH,
    WeatherDay,
)

# Slugs recognised as outdoor-sensitive construction processes.
# Extend this set when new outdoor process types are added.
OUTDOOR_PROCESS_SLUGS: frozenset[str] = frozenset(
    {
        "schilderen",
        "stucen",
        "dakwerk",
        "metselwerk",
        "voegwerk",
    }
)


@dataclass
class OutdoorProcessRisk:
    """A weather risk flagged against a specific outdoor process on a specific day."""

    date: str  # ISO 8601 date string
    process_slug: str
    risk_type: str  # "rain" | "wind" | "frost"
    severity: str  # "warning" | "danger"
    details: str  # Human-readable NL explanation


class OutdoorWeatherRiskService:
    """Assesses weather risks for a set of outdoor construction process slugs."""

    def assess_outdoor_risks(
        self,
        forecast: list[WeatherDay],
        outdoor_slugs: list[str],
    ) -> list[OutdoorProcessRisk]:
        """Return OutdoorProcessRisk entries for every (day, process) that is at risk.

        `outdoor_slugs` is the list of process slugs actually present on the
        project, pre-filtered to only those in OUTDOOR_PROCESS_SLUGS.
        """
        if not outdoor_slugs:
            return []

        risks: list[OutdoorProcessRisk] = []
        for day in forecast:
            day_risks = self._day_risks(day)
            for risk_type, severity, details in day_risks:
                for slug in outdoor_slugs:
                    risks.append(
                        OutdoorProcessRisk(
                            date=day.date,
                            process_slug=slug,
                            risk_type=risk_type,
                            severity=severity,
                            details=details,
                        )
                    )
        return risks

    def _day_risks(self, day: WeatherDay) -> list[tuple[str, str, str]]:
        """Return list of (risk_type, severity, details) for a single day."""
        result: list[tuple[str, str, str]] = []

        if day.precipitation_mm >= _RAIN_THRESHOLD_MM:
            severity = "danger" if day.precipitation_mm >= 20.0 else "warning"
            result.append(
                (
                    "rain",
                    severity,
                    f"{day.precipitation_mm:.1f} mm neerslag verwacht",
                )
            )

        if day.wind_speed_kmh >= _WIND_THRESHOLD_KMH:
            severity = "danger" if day.wind_speed_kmh >= 70.0 else "warning"
            result.append(
                (
                    "wind",
                    severity,
                    f"Windstoten tot {day.wind_speed_kmh:.0f} km/h",
                )
            )

        if day.temp_min <= _FROST_THRESHOLD_C:
            result.append(
                (
                    "frost",
                    "warning",
                    f"Minimumtemperatuur {day.temp_min:.1f} °C — vorst mogelijk",
                )
            )

        return result

    def to_ai_constraints(self, risks: list[OutdoorProcessRisk]) -> list[dict]:
        """Convert outdoor risks to AI planning optimizer constraint dicts.

        Each entry signals to the scheduling engine that `process_slug`
        should not be scheduled on `date`.
        """
        return [
            {
                "date": r.date,
                "process_slug": r.process_slug,
                "constraint_type": f"no_outdoor_{r.risk_type}",
                "severity": r.severity,
                "details": r.details,
            }
            for r in risks
        ]
