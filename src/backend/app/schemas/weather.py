"""Schemas for weather forecast data."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class WeatherDay(BaseModel):
    date: date
    temp_max_c: float
    temp_min_c: float
    precipitation_mm: float
    wind_speed_max_kmh: float
    weather_code: int
    weather_description: str
    work_risk: Literal["good", "moderate", "poor"]


class WeatherForecastResponse(BaseModel):
    latitude: float
    longitude: float
    days: list[WeatherDay]
    fetched_at: datetime


class RiskSummaryDay(BaseModel):
    date: date
    work_risk: Literal["good", "moderate", "poor"]


class WeatherDayResponse(BaseModel):
    """Response schema matching WeatherDay dataclass from the weather service client."""

    date: str
    temp_min: float
    temp_max: float
    precipitation_mm: float
    wind_speed_kmh: float
    weather_code: int
    description: str


class WeatherRiskResponse(BaseModel):
    """Response schema matching WeatherRisk dataclass from the weather service client."""

    date: str
    risk_type: str
    severity: str
    details: str


# ---------------------------------------------------------------------------
# Rescheduling schemas (Phase 21)
# ---------------------------------------------------------------------------


class RescheduleSuggestion(BaseModel):
    """A suggested rescheduling for a single outdoor task affected by bad weather."""

    task_id: str
    task_name: str
    project_id: str
    phase_id: str
    current_start: str  # ISO date
    current_end: str  # ISO date
    suggested_start: str | None  # ISO date, None if no good day found in forecast
    suggested_end: str | None  # ISO date, None if no good day found in forecast
    weather_risk: str  # "rain" | "wind" | "frost"
    weather_details: str  # human-readable explanation


class RescheduleItem(BaseModel):
    """A single task rescheduling request (accepted by the user)."""

    task_id: str
    new_start: str  # ISO date
    new_end: str  # ISO date


class RescheduleRequest(BaseModel):
    """Batch of rescheduling confirmations to apply."""

    project_id: str
    reschedules: list[RescheduleItem]


class RescheduleResponse(BaseModel):
    """Result of applying a batch of reschedules."""

    updated_count: int
