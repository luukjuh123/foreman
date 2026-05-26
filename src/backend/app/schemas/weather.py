"""Pydantic schemas for Weather API responses."""

from pydantic import BaseModel


class WeatherDayResponse(BaseModel):
    date: str
    temp_min: float
    temp_max: float
    precipitation_mm: float
    wind_speed_kmh: float
    weather_code: int
    description: str


class WeatherRiskResponse(BaseModel):
    date: str
    risk_type: str  # rain | wind | frost
    severity: str  # warning | danger
    details: str
