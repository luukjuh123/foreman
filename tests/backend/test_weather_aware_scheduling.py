"""Tests for weather-aware scheduling integration.

Covers:
- is_outdoor_process() classification
- compute_schedule() skipping rainy/storm days for outdoor tasks
- Agenda endpoints returning weather_risk per day
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.planning.autofill import compute_schedule
from app.services.planning.cpm import CpmTask
from app.services.weather import is_outdoor_process
from app.services.weather.client import WeatherDay

TEST_DB_URL = "sqlite+aiosqlite://"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    # Route AuditLogMiddleware (if present) to the test SQLite DB instead of postgres.
    app.state.audit_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "weather@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "WeatherUser", "password": "testpass123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_weather_day(
    d: date,
    *,
    precipitation_mm: float = 0.0,
    wind_speed_kmh: float = 10.0,
    temp_min: float = 10.0,
    temp_max: float = 20.0,
    weather_code: int = 0,
) -> WeatherDay:
    """Build a WeatherDay (from services/weather/client.py) for a given date."""
    return WeatherDay(
        date=d.isoformat(),
        temp_min=temp_min,
        temp_max=temp_max,
        precipitation_mm=precipitation_mm,
        wind_speed_kmh=wind_speed_kmh,
        weather_code=weather_code,
        description="Clear sky",
    )


# ---------------------------------------------------------------------------
# Unit tests — is_outdoor_process()
# ---------------------------------------------------------------------------


def test_schilderen_is_outdoor():
    assert is_outdoor_process("schilderen") is True


def test_dakwerk_is_outdoor():
    assert is_outdoor_process("Dakwerk") is True


def test_voegen_is_outdoor():
    assert is_outdoor_process("voegen") is True


def test_metselwerk_is_outdoor():
    assert is_outdoor_process("Metselwerk") is True


def test_ramen_schilderen_is_outdoor():
    assert is_outdoor_process("ramen schilderen") is True


def test_stucen_is_not_outdoor():
    assert is_outdoor_process("stucen") is False


def test_electra_is_not_outdoor():
    assert is_outdoor_process("Elektra trekken") is False


def test_tegels_is_not_outdoor():
    assert is_outdoor_process("tegels leggen") is False


def test_loodgieterswerk_is_not_outdoor():
    assert is_outdoor_process("loodgieterswerk") is False


# ---------------------------------------------------------------------------
# Unit tests — compute_schedule() with weather forecast
# ---------------------------------------------------------------------------


def test_schedule_outdoor_task_skips_poor_risk_day():
    """Outdoor task start date must not land on a poor-risk day (heavy rain)."""
    start = date(2026, 6, 2)
    # Day 0 = heavy rain (poor), day 1 = clear (good)
    forecast = [
        _make_weather_day(start, precipitation_mm=15.0),         # poor
        _make_weather_day(start + timedelta(days=1)),             # good
        _make_weather_day(start + timedelta(days=2)),             # good
        _make_weather_day(start + timedelta(days=3)),             # good
        _make_weather_day(start + timedelta(days=4)),             # good
        _make_weather_day(start + timedelta(days=5)),             # good
        _make_weather_day(start + timedelta(days=6)),             # good
    ]

    tasks = [CpmTask(id="t1", name="schilderen", duration_hours=8.0, dependencies=[])]
    proposals = compute_schedule(
        tasks,
        start_date=start,
        working_hours_per_day=8,
        weather_forecast=forecast,
    )
    assert len(proposals) == 1
    # Must NOT start on the rainy day
    assert proposals[0].proposed_start_date != start
    assert proposals[0].proposed_start_date == start + timedelta(days=1)


def test_schedule_indoor_task_not_affected_by_rain():
    """Indoor task start date is unchanged even when the start day has heavy rain."""
    start = date(2026, 6, 2)
    forecast = [
        _make_weather_day(start, precipitation_mm=15.0),  # poor
        _make_weather_day(start + timedelta(days=1)),
    ]

    tasks = [CpmTask(id="t1", name="stucen", duration_hours=8.0, dependencies=[])]
    proposals = compute_schedule(
        tasks,
        start_date=start,
        working_hours_per_day=8,
        weather_forecast=forecast,
    )
    assert proposals[0].proposed_start_date == start


def test_schedule_outdoor_task_moderate_rain_not_blocked():
    """Moderate rain (< 10mm) does not block outdoor scheduling — only poor risk does."""
    start = date(2026, 6, 2)
    forecast = [
        _make_weather_day(start, precipitation_mm=5.0),   # moderate
        _make_weather_day(start + timedelta(days=1)),
    ]

    tasks = [CpmTask(id="t1", name="dakwerk", duration_hours=8.0, dependencies=[])]
    proposals = compute_schedule(
        tasks,
        start_date=start,
        working_hours_per_day=8,
        weather_forecast=forecast,
    )
    # moderate risk does NOT block → start on the requested day
    assert proposals[0].proposed_start_date == start


def test_schedule_without_forecast_unchanged():
    """No forecast provided → behaviour identical to before (no weather awareness)."""
    start = date(2026, 6, 2)
    tasks = [CpmTask(id="t1", name="schilderen", duration_hours=8.0, dependencies=[])]
    proposals = compute_schedule(
        tasks,
        start_date=start,
        working_hours_per_day=8,
        weather_forecast=None,
    )
    assert proposals[0].proposed_start_date == start


def test_schedule_reasoning_mentions_weather_when_skipped():
    """When a day is skipped due to weather, the reasoning must say so."""
    start = date(2026, 6, 2)
    forecast = [
        _make_weather_day(start, precipitation_mm=15.0),  # poor
        _make_weather_day(start + timedelta(days=1)),
        _make_weather_day(start + timedelta(days=2)),
    ]
    tasks = [CpmTask(id="t1", name="voegen", duration_hours=8.0, dependencies=[])]
    proposals = compute_schedule(
        tasks,
        start_date=start,
        working_hours_per_day=8,
        weather_forecast=forecast,
    )
    assert "weather" in proposals[0].reasoning.lower()


def test_schedule_outdoor_task_storm_blocked():
    """High wind (> 60 km/h) also qualifies as poor risk and blocks outdoor tasks."""
    start = date(2026, 6, 2)
    forecast = [
        _make_weather_day(start, wind_speed_kmh=70.0),   # poor (storm)
        _make_weather_day(start + timedelta(days=1)),
        _make_weather_day(start + timedelta(days=2)),
    ]
    tasks = [CpmTask(id="t1", name="metselwerk", duration_hours=8.0, dependencies=[])]
    proposals = compute_schedule(
        tasks,
        start_date=start,
        working_hours_per_day=8,
        weather_forecast=forecast,
    )
    assert proposals[0].proposed_start_date == start + timedelta(days=1)


# ---------------------------------------------------------------------------
# Integration tests — agenda endpoints include weather_risk
# ---------------------------------------------------------------------------


def _fake_open_meteo_response(start: date, days: int = 7, heavy_rain: bool = False) -> dict:
    """Build a fake Open-Meteo API response for the given date range."""
    dates = [(start + timedelta(days=i)).isoformat() for i in range(days)]
    precip = 15.0 if heavy_rain else 0.5
    return {
        "latitude": 52.3676,
        "longitude": 4.9041,
        "daily": {
            "time": dates,
            "temperature_2m_max": [18.0] * days,
            "temperature_2m_min": [10.0] * days,
            "precipitation_sum": [precip] * days,
            "wind_speed_10m_max": [25.0] * days,
            "weather_code": [1] * days,
        },
    }


def _build_forecast_from_response(fake_response: dict) -> list:
    """Convert a fake Open-Meteo API response dict into a list of WeatherDay objects."""
    from app.services.weather.client import WeatherDay as _WD

    daily = fake_response["daily"]
    days = []
    for i, date_str in enumerate(daily["time"]):
        code = daily.get("weather_code", daily.get("weathercode", [0] * 7))[i]
        days.append(
            _WD(
                date=date_str,
                temp_min=daily["temperature_2m_min"][i],
                temp_max=daily["temperature_2m_max"][i],
                precipitation_mm=daily["precipitation_sum"][i] or 0.0,
                wind_speed_kmh=daily["wind_speed_10m_max"][i] or 0.0,
                weather_code=code,
                description="Test day",
            )
        )
    return days


def _patch_open_meteo(fake_response: dict):
    """Patch weather_service.get_forecast to return pre-built WeatherDay objects.

    Bypasses the TTL cache by patching the method directly on the singleton.
    """
    forecast = _build_forecast_from_response(fake_response)

    async def _fake_get_forecast(lat: float, lon: float) -> list:
        return forecast

    return patch("app.services.weather.client.weather_service.get_forecast", side_effect=_fake_get_forecast)


@pytest.mark.asyncio
async def test_agenda_week_includes_weather_risk(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    monday = date(2026, 6, 1)  # a Monday
    fake = _fake_open_meteo_response(monday, days=7)

    with _patch_open_meteo(fake):
        resp = await client.get(
            f"/api/agenda/week?week_start={monday.isoformat()}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "days" in data
    for day in data["days"]:
        assert "weather_risk" in day, f"Missing weather_risk on day {day['date']}"
        assert day["weather_risk"] in ("good", "moderate", "poor", None)


@pytest.mark.asyncio
async def test_agenda_week_poor_risk_when_heavy_rain(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    monday = date(2026, 6, 1)
    fake = _fake_open_meteo_response(monday, days=7, heavy_rain=True)

    with _patch_open_meteo(fake):
        resp = await client.get(
            f"/api/agenda/week?week_start={monday.isoformat()}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.text
    days = resp.json()["days"]
    # All days should be "poor" with 15mm rain
    assert all(d["weather_risk"] == "poor" for d in days)


@pytest.mark.asyncio
async def test_agenda_day_includes_weather_risk(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    target = date(2026, 6, 3)
    fake = _fake_open_meteo_response(target, days=1)

    with _patch_open_meteo(fake):
        resp = await client.get(
            f"/api/agenda/day?day={target.isoformat()}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "weather_risk" in body


@pytest.mark.asyncio
async def test_agenda_range_includes_weather_risk(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    start = date(2026, 6, 1)
    end = date(2026, 6, 3)
    fake = _fake_open_meteo_response(start, days=3)

    with _patch_open_meteo(fake):
        resp = await client.get(
            f"/api/agenda/range?start={start.isoformat()}&end={end.isoformat()}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.text
    days = resp.json()
    assert len(days) == 3
    for day in days:
        assert "weather_risk" in day


@pytest.mark.asyncio
async def test_agenda_weather_risk_graceful_on_fetch_error(client: AsyncClient) -> None:
    """If weather fetch fails, agenda still returns data with weather_risk as None."""
    headers = await _auth_headers(client)
    target = date(2026, 6, 3)

    async def _raise(*args, **kwargs):
        raise Exception("network error")

    with patch("app.services.weather.client.weather_service.get_forecast", side_effect=_raise):
        resp = await client.get(
            f"/api/agenda/day?day={target.isoformat()}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "weather_risk" in body
    assert body["weather_risk"] is None
