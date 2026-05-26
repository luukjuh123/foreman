"""Weather router — 7-day forecast and work-risk summary."""

from __future__ import annotations

from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.weather import RiskSummaryDay, WeatherForecastResponse
from app.services.weather import WeatherService
from fastapi import APIRouter, Depends, Query

router = APIRouter()


def _weather_service() -> WeatherService:
    return WeatherService()


@router.get("/forecast", response_model=WeatherForecastResponse)
async def get_forecast(
    latitude: float | None = Query(None, description="Latitude (defaults to Amsterdam)"),
    longitude: float | None = Query(None, description="Longitude (defaults to Amsterdam)"),
    _current_user: User = Depends(get_current_user),
    service: WeatherService = Depends(_weather_service),
) -> WeatherForecastResponse:
    """Return a 7-day weather forecast with work-risk assessment per day."""
    return await service.get_forecast(latitude=latitude, longitude=longitude)


@router.get("/forecast/risk-summary", response_model=list[RiskSummaryDay])
async def get_risk_summary(
    latitude: float | None = Query(None, description="Latitude (defaults to Amsterdam)"),
    longitude: float | None = Query(None, description="Longitude (defaults to Amsterdam)"),
    _current_user: User = Depends(get_current_user),
    service: WeatherService = Depends(_weather_service),
) -> list[RiskSummaryDay]:
    """Return just the work-risk label per day — suitable for a dashboard widget."""
    forecast = await service.get_forecast(latitude=latitude, longitude=longitude)
    return [RiskSummaryDay(date=day.date, work_risk=day.work_risk) for day in forecast.days]
