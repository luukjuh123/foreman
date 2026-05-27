"""Tests for weather-aware auto-rescheduling endpoints.

Endpoints under test:
  GET /api/v1/weather/reschedule-suggestions?project_id=...
  POST /api/v1/weather/reschedule

Strategy: spin up an in-memory SQLite DB, register+login a test user, create a
project with lat/lon, create tasks with outdoor-sensitive names on specific
dates, then mock the weather service to return deterministic forecasts so we
can assert which tasks get flagged.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
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
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "reschedule@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test", "password": "testpass123"},
    )
    assert resp.status_code in (200, 201), resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _make_project_with_tasks(
    client: AsyncClient,
    headers: dict,
    *,
    project_name: str = "Bouw",
    task_configs: list[dict],
) -> dict:
    """Create a project with location, a phase, and tasks. Returns project dict."""
    proj_resp = await client.post(
        "/api/v1/projects/",
        json={
            "name": project_name,
            "description": "Test project",
            "status": "active",
        },
        headers=headers,
    )
    assert proj_resp.status_code == 201, proj_resp.text
    project = proj_resp.json()

    # Set project location (Amsterdam)
    loc_resp = await client.put(
        f"/api/v1/projects/{project['id']}",
        json={"name": project_name, "status": "active", "location_lat": 52.37, "location_lon": 4.89},
        headers=headers,
    )
    assert loc_resp.status_code == 200, loc_resp.text

    # Create a phase
    phase_resp = await client.post(
        f"/api/v1/projects/{project['id']}/phases",
        json={"name": "Fase 1", "order_index": 0, "status": "active"},
        headers=headers,
    )
    assert phase_resp.status_code == 201, phase_resp.text
    phase = phase_resp.json()

    # Create tasks
    for tc in task_configs:
        task_resp = await client.post(
            f"/api/v1/projects/{project['id']}/phases/{phase['id']}/tasks",
            json={
                "name": tc["name"],
                "status": "todo",
                "priority": 1,
                "start_date": tc["start_date"],
                "end_date": tc["end_date"],
            },
            headers=headers,
        )
        assert task_resp.status_code == 201, task_resp.text

    # Re-fetch the full project to get task IDs
    full = await client.get(f"/api/v1/projects/{project['id']}", headers=headers)
    return full.json()


def _make_forecast(overrides: dict[str, dict]) -> list[WeatherDay]:
    """Build a 7-day forecast starting today. overrides maps date_iso -> field overrides."""
    today = date.today()
    days = []
    for i in range(7):
        d = today + timedelta(days=i)
        iso = d.isoformat()
        base = {
            "date": iso,
            "temp_min": 10.0,
            "temp_max": 20.0,
            "precipitation_mm": 0.0,
            "wind_speed_kmh": 10.0,
            "weather_code": 1,
            "description": "Mainly clear",
        }
        base.update(overrides.get(iso, {}))
        days.append(WeatherDay(**base))
    return days


# ---------------------------------------------------------------------------
# Unit tests for the rescheduling service
# ---------------------------------------------------------------------------


def test_is_outdoor_sensitive_true():
    from app.services.weather.rescheduling import is_outdoor_sensitive

    assert is_outdoor_sensitive("Dakdekken fase 2")
    assert is_outdoor_sensitive("Schilderwerk buitengevel")
    assert is_outdoor_sensitive("Betonvloer storten")
    assert is_outdoor_sensitive("Stucco buitenmuur")
    assert is_outdoor_sensitive("Voegwerk metselwerk")


def test_is_outdoor_sensitive_false():
    from app.services.weather.rescheduling import is_outdoor_sensitive

    assert not is_outdoor_sensitive("Elektra aanleggen")
    assert not is_outdoor_sensitive("Sanitair installatie")
    assert not is_outdoor_sensitive("Tegelwerk badkamer")


def test_is_bad_weather_rain():
    from app.services.weather.rescheduling import is_bad_weather

    day = WeatherDay(
        date="2025-01-01",
        temp_min=10.0,
        temp_max=20.0,
        precipitation_mm=10.0,  # > 5mm threshold
        wind_speed_kmh=10.0,
        weather_code=63,
        description="Moderate rain",
    )
    assert is_bad_weather(day)


def test_is_bad_weather_wind():
    from app.services.weather.rescheduling import is_bad_weather

    day = WeatherDay(
        date="2025-01-01",
        temp_min=10.0,
        temp_max=20.0,
        precipitation_mm=0.0,
        wind_speed_kmh=50.0,  # > 40 km/h threshold
        weather_code=1,
        description="Mainly clear",
    )
    assert is_bad_weather(day)


def test_is_bad_weather_frost():
    from app.services.weather.rescheduling import is_bad_weather

    day = WeatherDay(
        date="2025-01-01",
        temp_min=1.0,  # <= 2°C threshold
        temp_max=8.0,
        precipitation_mm=0.0,
        wind_speed_kmh=10.0,
        weather_code=0,
        description="Clear sky",
    )
    assert is_bad_weather(day)


def test_is_bad_weather_good():
    from app.services.weather.rescheduling import is_bad_weather

    day = WeatherDay(
        date="2025-01-01",
        temp_min=8.0,
        temp_max=20.0,
        precipitation_mm=2.0,  # below threshold
        wind_speed_kmh=20.0,
        weather_code=1,
        description="Mainly clear",
    )
    assert not is_bad_weather(day)


def test_find_next_good_day():
    from app.services.weather.rescheduling import find_next_good_day

    today = date.today()
    bad_days = {today.isoformat(), (today + timedelta(days=1)).isoformat()}
    good_day = today + timedelta(days=2)
    forecast = _make_forecast({})  # all good weather

    result = find_next_good_day(
        from_date=today,
        forecast_map={d.date: d for d in forecast},
        skip_dates=bad_days,
    )
    # Should return today or next good day (first day not in skip_dates)
    assert result is not None
    assert result.isoformat() not in bad_days


def test_find_next_good_day_no_good_day_in_forecast():
    """When all forecast days are bad, returns None."""
    from app.services.weather.rescheduling import find_next_good_day

    today = date.today()
    # Make all days rainy
    overrides = {
        (today + timedelta(days=i)).isoformat(): {"precipitation_mm": 20.0}
        for i in range(7)
    }
    forecast = _make_forecast(overrides)
    result = find_next_good_day(
        from_date=today,
        forecast_map={d.date: d for d in forecast},
        skip_dates=set(),
    )
    assert result is None


# ---------------------------------------------------------------------------
# Integration tests — GET /api/v1/weather/reschedule-suggestions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reschedule_suggestions_flags_outdoor_task_on_bad_day(client):
    """An outdoor task scheduled on a rainy day should appear in suggestions."""
    headers = await _auth_headers(client)
    today = date.today()
    rain_day = (today + timedelta(days=1)).isoformat()

    project = await _make_project_with_tasks(
        client,
        headers,
        task_configs=[
            {
                "name": "Dakdekken fase 1",
                "start_date": rain_day,
                "end_date": rain_day,
            }
        ],
    )
    project_id = project["id"]

    forecast = _make_forecast({rain_day: {"precipitation_mm": 15.0}})

    with patch(
        "app.services.weather.client.weather_service.get_forecast",
        new=AsyncMock(return_value=forecast),
    ):
        resp = await client.get(
            f"/api/v1/weather/reschedule-suggestions?project_id={project_id}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data) == 1
    suggestion = data[0]
    assert suggestion["task_name"] == "Dakdekken fase 1"
    assert suggestion["current_start"] == rain_day
    assert suggestion["weather_risk"] in ("rain", "wind", "frost")


@pytest.mark.asyncio
async def test_reschedule_suggestions_ignores_indoor_task(client):
    """An indoor task on a rainy day should NOT appear in suggestions."""
    headers = await _auth_headers(client, email="indoor@example.com")
    today = date.today()
    rain_day = (today + timedelta(days=1)).isoformat()

    project = await _make_project_with_tasks(
        client,
        headers,
        task_configs=[
            {
                "name": "Elektra aanleggen",
                "start_date": rain_day,
                "end_date": rain_day,
            }
        ],
    )
    project_id = project["id"]
    forecast = _make_forecast({rain_day: {"precipitation_mm": 15.0}})

    with patch(
        "app.services.weather.client.weather_service.get_forecast",
        new=AsyncMock(return_value=forecast),
    ):
        resp = await client.get(
            f"/api/v1/weather/reschedule-suggestions?project_id={project_id}",
            headers=headers,
        )

    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_reschedule_suggestions_requires_project_id(client):
    headers = await _auth_headers(client, email="noid@example.com")
    resp = await client.get("/api/v1/weather/reschedule-suggestions", headers=headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_reschedule_suggestions_project_not_found(client):
    headers = await _auth_headers(client, email="notfound@example.com")
    resp = await client.get(
        f"/api/v1/weather/reschedule-suggestions?project_id={uuid.uuid4()}",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reschedule_suggestions_no_location_returns_empty(client):
    """Project without location coordinates should return empty list (no weather data)."""
    headers = await _auth_headers(client, email="noloc@example.com")
    today = date.today()
    day_iso = (today + timedelta(days=1)).isoformat()

    proj_resp = await client.post(
        "/api/v1/projects/",
        json={"name": "No Location", "status": "active"},
        headers=headers,
    )
    project_id = proj_resp.json()["id"]

    phase_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases",
        json={"name": "F1", "order_index": 0, "status": "active"},
        headers=headers,
    )
    phase_id = phase_resp.json()["id"]

    await client.post(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
        json={"name": "Dakdekken", "status": "todo", "priority": 1,
              "start_date": day_iso, "end_date": day_iso},
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/weather/reschedule-suggestions?project_id={project_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Integration tests — POST /api/v1/weather/reschedule
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reschedule_apply_moves_task(client):
    """POSTing a reschedule batch should update task start_date and end_date."""
    headers = await _auth_headers(client, email="apply@example.com")
    today = date.today()
    original_day = (today + timedelta(days=1)).isoformat()
    new_day = (today + timedelta(days=3)).isoformat()

    project = await _make_project_with_tasks(
        client,
        headers,
        task_configs=[
            {
                "name": "Dakdekken",
                "start_date": original_day,
                "end_date": original_day,
            }
        ],
    )
    project_id = project["id"]
    task_id = project["phases"][0]["tasks"][0]["id"]
    phase_id = project["phases"][0]["id"]

    body = {
        "project_id": project_id,
        "reschedules": [
            {
                "task_id": task_id,
                "new_start": new_day,
                "new_end": new_day,
            }
        ],
    }
    resp = await client.post("/api/v1/weather/reschedule", json=body, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["updated_count"] == 1

    # Verify task was actually updated by re-fetching the project
    proj_resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert proj_resp.status_code == 200
    updated_project = proj_resp.json()
    tasks = [t for phase in updated_project["phases"] for t in phase["tasks"]]
    updated_task = next((t for t in tasks if t["id"] == task_id), None)
    assert updated_task is not None
    assert updated_task["start_date"] == new_day
    assert updated_task["end_date"] == new_day


@pytest.mark.asyncio
async def test_reschedule_apply_wrong_project_returns_404(client):
    headers = await _auth_headers(client, email="wrong@example.com")
    body = {
        "project_id": str(uuid.uuid4()),
        "reschedules": [
            {
                "task_id": str(uuid.uuid4()),
                "new_start": date.today().isoformat(),
                "new_end": date.today().isoformat(),
            }
        ],
    }
    resp = await client.post("/api/v1/weather/reschedule", json=body, headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reschedule_apply_empty_list_returns_zero(client):
    headers = await _auth_headers(client, email="empty@example.com")
    proj_resp = await client.post(
        "/api/v1/projects/",
        json={"name": "P", "status": "active"},
        headers=headers,
    )
    project_id = proj_resp.json()["id"]

    body = {"project_id": project_id, "reschedules": []}
    resp = await client.post("/api/v1/weather/reschedule", json=body, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["updated_count"] == 0
