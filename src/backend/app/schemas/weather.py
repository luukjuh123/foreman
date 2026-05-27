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
