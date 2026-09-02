"""Weather router — Phase 19 + 21.

Endpoints:
  GET /api/v1/weather/forecast                   — 7-day forecast (lat/lon or project_id)
  GET /api/v1/weather/risks                      — construction risk summary (lat/lon or project_id)
  GET /api/v1/weather/reschedule-suggestions     — outdoor tasks affected by bad weather
  POST /api/v1/weather/reschedule                — apply a batch of reschedulings

Both forecast/risks endpoints accept either:
  - ?lat=...&lon=...           (raw coordinates)
  - ?project_id=...            (looks up project's stored location)

reschedule-suggestions requires ?project_id=...
"""

import logging
import uuid
from datetime import timedelta

from app.core.database import get_db
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.weather import (
    RescheduleRequest,
    RescheduleResponse,
    RescheduleSuggestion,
    WeatherDayResponse,
    WeatherRiskResponse,
)
from app.services.weather.client import WeatherDay, WeatherRisk, weather_service
from app.services.weather.rescheduling import (
    find_next_good_day,
    is_bad_weather,
    is_outdoor_sensitive,
    weather_risk_type,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

log = logging.getLogger(__name__)

router = APIRouter()


_DAY_FIELDS = ("date", "temp_min", "temp_max", "precipitation_mm", "wind_speed_kmh", "weather_code", "description")
_RISK_FIELDS = ("date", "risk_type", "severity", "details")

_day_to_response = lambda d: WeatherDayResponse(**{k: getattr(d, k) for k in _DAY_FIELDS})
_risk_to_response = lambda r: WeatherRiskResponse(**{k: getattr(r, k) for k in _RISK_FIELDS})


async def _resolve_coords(
    lat: float | None, lon: float | None, project_id: uuid.UUID | None, user: User, db: AsyncSession,
) -> tuple[float, float]:
    """Resolve lat/lon from explicit coords or a project_id."""
    if lat is not None and lon is not None:
        return lat, lon
    if project_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Provide lat and lon query parameters, or a project_id")
    project = (await db.execute(select(Project).where(Project.id == project_id, Project.owner_id == user.id, Project.deleted_at.is_(None)))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.location_lat is None or project.location_lon is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Project has no location set; provide lat/lon or set project location first")
    return project.location_lat, project.location_lon


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


async def _load_project_with_tasks(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project | None:
    """Load a project with phases/tasks, returning None if not found."""
    return (await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id, Project.deleted_at.is_(None))
        .options(selectinload(Project.phases).selectinload(Phase.tasks))
    )).scalar_one_or_none()


@router.get("/reschedule-suggestions", response_model=list[RescheduleSuggestion])
async def get_reschedule_suggestions(
    project_id: uuid.UUID = Query(..., description="Project to analyse for weather rescheduling"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RescheduleSuggestion]:
    """Return outdoor tasks scheduled on bad-weather days with suggested new dates.

    Only tasks with both start_date and end_date set are considered.
    Only tasks with outdoor-sensitive names are flagged.
    The project must have location_lat and location_lon set; if not, returns an empty list.
    """
    project = await _load_project_with_tasks(project_id, current_user, db)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if project.location_lat is None or project.location_lon is None:
        return []

    # Fetch forecast
    try:
        forecast = await weather_service.get_forecast(lat=project.location_lat, lon=project.location_lon)
    except Exception:
        log.warning("Weather fetch failed for project %s; skipping rescheduling", project_id)
        return []

    forecast_map = {d.date: d for d in forecast}

    suggestions: list[RescheduleSuggestion] = []
    suggested_dates: set[str] = set()

    for phase in project.phases:
        for task in phase.tasks:
            if task.start_date is None or task.end_date is None or not is_outdoor_sensitive(task.name):
                continue

            span = (task.end_date - task.start_date).days + 1
            bad_day = next(
                (wd for i in range(span)
                 if (wd := forecast_map.get((task.start_date + timedelta(days=i)).isoformat())) and is_bad_weather(wd)),
                None,
            )
            if bad_day is None:
                continue

            task_duration = (task.end_date - task.start_date).days
            next_good = find_next_good_day(from_date=task.start_date, forecast_map=forecast_map, skip_dates=suggested_dates)
            suggested_start_iso = next_good.isoformat() if next_good else None
            suggested_end = (next_good + timedelta(days=task_duration)).isoformat() if next_good else None
            if suggested_start_iso:
                suggested_dates.add(suggested_start_iso)

            suggestions.append(RescheduleSuggestion(
                task_id=str(task.id), task_name=task.name,
                project_id=str(project.id), phase_id=str(phase.id),
                current_start=task.start_date.isoformat(), current_end=task.end_date.isoformat(),
                suggested_start=suggested_start_iso, suggested_end=suggested_end,
                weather_risk=weather_risk_type(bad_day), weather_details=_build_risk_details(bad_day),
            ))

    return suggestions


def _build_risk_details(day: WeatherDay) -> str:
    """Build a human-readable description of why a day is bad."""
    parts = [s for cond, s in (
        (day.precipitation_mm > 5.0, f"{day.precipitation_mm:.1f} mm neerslag"),
        (day.wind_speed_kmh > 40.0, f"wind {day.wind_speed_kmh:.0f} km/h"),
        (day.temp_min <= 2.0, f"minimumtemperatuur {day.temp_min:.1f} °C"),
    ) if cond]
    return "; ".join(parts) if parts else day.description


@router.post("/reschedule", response_model=RescheduleResponse)
async def apply_reschedule(
    body: RescheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RescheduleResponse:
    """Apply a batch of rescheduling confirmations — updates task start/end dates."""
    from datetime import date as _date

    project = await _load_project_with_tasks(uuid.UUID(body.project_id), current_user, db)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not body.reschedules:
        return RescheduleResponse(updated_count=0)

    task_map = {str(t.id): t for ph in project.phases for t in ph.tasks}
    updated = 0
    for item in body.reschedules:
        if (task := task_map.get(item.task_id)) is None:
            continue
        task.start_date, task.end_date = _date.fromisoformat(item.new_start), _date.fromisoformat(item.new_end)
        db.add(task)
        updated += 1

    await db.commit()
    return RescheduleResponse(updated_count=updated)
