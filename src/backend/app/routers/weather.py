"""Weather router — Phase 19.

Endpoints:
  GET /api/v1/weather/forecast  — 7-day forecast (lat/lon or project_id)
  GET /api/v1/weather/risks     — construction risk summary (lat/lon or project_id)

Both endpoints accept either:
  - ?lat=...&lon=...           (raw coordinates)
  - ?project_id=...            (looks up project's stored location)
"""

import uuid

from app.core.database import get_db
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.weather import WeatherDayResponse, WeatherRiskResponse
from app.services.weather.client import WeatherDay, WeatherRisk, weather_service
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def _day_to_response(day: WeatherDay) -> WeatherDayResponse:
    return WeatherDayResponse(
        date=day.date,
        temp_min=day.temp_min,
        temp_max=day.temp_max,
        precipitation_mm=day.precipitation_mm,
        wind_speed_kmh=day.wind_speed_kmh,
        weather_code=day.weather_code,
        description=day.description,
    )


def _risk_to_response(risk: WeatherRisk) -> WeatherRiskResponse:
    return WeatherRiskResponse(
        date=risk.date,
        risk_type=risk.risk_type,
        severity=risk.severity,
        details=risk.details,
    )


async def _resolve_coords(
    lat: float | None,
    lon: float | None,
    project_id: uuid.UUID | None,
    user: User,
    db: AsyncSession,
) -> tuple[float, float]:
    """Resolve lat/lon from either explicit coords or a project_id.

    Raises 422 if neither is provided, or if the project has no location set.
    Raises 404 if project_id not found or not owned by user.
    """
    if lat is not None and lon is not None:
        return lat, lon

    if project_id is not None:
        result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.owner_id == user.id,
                Project.deleted_at.is_(None),
            )
        )
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.location_lat is None or project.location_lon is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Project has no location set; provide lat/lon or set project location first",
            )
        return project.location_lat, project.location_lon

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="Provide lat and lon query parameters, or a project_id",
    )


@router.get("/forecast", response_model=list[WeatherDayResponse])
async def get_forecast(
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WeatherDayResponse]:
    """Return 7-day weather forecast for a location."""
    resolved_lat, resolved_lon = await _resolve_coords(lat, lon, project_id, current_user, db)
    forecast = await weather_service.get_forecast(lat=resolved_lat, lon=resolved_lon)
    return [_day_to_response(d) for d in forecast]


@router.get("/risks", response_model=list[WeatherRiskResponse])
async def get_weather_risks(
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WeatherRiskResponse]:
    """Return construction weather risks for the next 7 days."""
    resolved_lat, resolved_lon = await _resolve_coords(lat, lon, project_id, current_user, db)
    forecast = await weather_service.get_forecast(lat=resolved_lat, lon=resolved_lon)
    risks = weather_service.assess_risks(forecast)
    return [_risk_to_response(r) for r in risks]
