"""Tests for Phase 20 weather integration — outdoor process risk flagging.

Covers:
- OUTDOOR_PROCESS_SLUGS contains the required Dutch construction process types
- OutdoorWeatherRiskService.assess_outdoor_risks returns flagged processes for risky days
- GET /api/v1/weather/risks/{project_id} — outdoor risk report + notification dispatch
- GET /api/v1/weather/ai-constraints/{project_id} — AI planning constraint payload
- Notification dispatched when at least one "danger" risk exists
- No notification when all days are clear
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.notifications.dispatcher_dep import get_default_dispatcher
from app.services.notifications.engine import NotificationDispatcher
from app.services.weather.client import WeatherDay, WeatherRisk
from app.services.weather.outdoor_risks import (
    OUTDOOR_PROCESS_SLUGS,
    OutdoorProcessRisk,
    OutdoorWeatherRiskService,
)

TEST_DB_URL = "sqlite+aiosqlite://"

# ---------------------------------------------------------------------------
# Stub data
# ---------------------------------------------------------------------------

_CLEAR_DAY = WeatherDay(
    date="2024-07-01",
    temp_min=15.0,
    temp_max=24.0,
    precipitation_mm=0.0,
    wind_speed_kmh=12.0,
    weather_code=0,
    description="Clear sky",
)

_RAIN_DAY = WeatherDay(
    date="2024-07-02",
    temp_min=10.0,
    temp_max=16.0,
    precipitation_mm=25.0,  # >= 20mm → "danger"
    wind_speed_kmh=25.0,
    weather_code=65,
    description="Heavy rain",
)

_FROST_DAY = WeatherDay(
    date="2024-01-10",
    temp_min=-4.0,
    temp_max=1.0,
    precipitation_mm=0.0,
    wind_speed_kmh=8.0,
    weather_code=71,
    description="Slight snow",
)

_STUB_FORECAST_RISKY = [_CLEAR_DAY, _RAIN_DAY]
_STUB_FORECAST_CLEAR = [_CLEAR_DAY]
_STUB_FORECAST_FROST = [_FROST_DAY]


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
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def client_no_dispatch(app_with_db):
    """Client with notification dispatcher stubbed out (no channels)."""
    app, _ = app_with_db
    null_dispatcher = NotificationDispatcher(channels=[])
    app.dependency_overrides[get_default_dispatcher] = lambda: null_dispatcher
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_default_dispatcher, None)


async def _auth(client: AsyncClient, email: str = "owner@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Owner", "password": "supersecret"},
    )
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _create_project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={
            "name": "Verbouwing",
            "description": "test",
            "location_lat": 52.3676,
            "location_lon": 4.9041,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _add_process_to_project(
    client: AsyncClient, headers: dict, project_id: str, slug: str
) -> None:
    # Ensure the process exists
    resp = await client.post(
        "/api/v1/processes/",
        json={"slug": slug, "name": slug.title(), "unit": "m2"},
        headers=headers,
    )
    # 201 or 409 (already exists) are both fine
    assert resp.status_code in (201, 409), resp.text
    process_id = resp.json().get("id") if resp.status_code == 201 else None

    if process_id is None:
        # fetch by slug
        list_resp = await client.get("/api/v1/processes/", headers=headers)
        assert list_resp.status_code == 200, list_resp.text
        items = list_resp.json()
        match = next((p for p in items if p["slug"] == slug), None)
        assert match is not None, f"process slug {slug!r} not found"
        process_id = match["id"]

    link_resp = await client.post(
        f"/api/v1/projects/{project_id}/processes",
        json={"process_id": process_id},
        headers=headers,
    )
    assert link_resp.status_code in (200, 201, 409), link_resp.text


# ---------------------------------------------------------------------------
# Unit tests — OutdoorWeatherRiskService (no HTTP, no DB)
# ---------------------------------------------------------------------------


def test_outdoor_process_slugs_contains_required_types() -> None:
    """OUTDOOR_PROCESS_SLUGS must include the five mandatory Dutch process types."""
    required = {"schilderen", "stucen", "dakwerk", "metselwerk", "voegwerk"}
    assert required.issubset(OUTDOOR_PROCESS_SLUGS)


def test_outdoor_risk_service_flags_rain_day() -> None:
    """Rain day should produce an OutdoorProcessRisk for each outdoor process."""
    svc = OutdoorWeatherRiskService()
    outdoor_slugs = ["schilderen", "dakwerk"]
    risks = svc.assess_outdoor_risks(_STUB_FORECAST_RISKY, outdoor_slugs)

    rain_risks = [r for r in risks if r.risk_type == "rain"]
    assert len(rain_risks) > 0
    # Both outdoor processes should appear on the rain day
    process_slugs_flagged = {r.process_slug for r in rain_risks}
    assert "schilderen" in process_slugs_flagged
    assert "dakwerk" in process_slugs_flagged


def test_outdoor_risk_service_no_risks_clear_day() -> None:
    svc = OutdoorWeatherRiskService()
    risks = svc.assess_outdoor_risks(_STUB_FORECAST_CLEAR, ["schilderen"])
    assert risks == []


def test_outdoor_risk_service_flags_frost_day() -> None:
    svc = OutdoorWeatherRiskService()
    risks = svc.assess_outdoor_risks(_STUB_FORECAST_FROST, ["stucen", "metselwerk"])
    frost_risks = [r for r in risks if r.risk_type == "frost"]
    assert len(frost_risks) == 2  # one per outdoor process
    assert {r.process_slug for r in frost_risks} == {"stucen", "metselwerk"}


def test_outdoor_risk_service_no_outdoor_processes() -> None:
    """When project has no outdoor processes, result is always empty."""
    svc = OutdoorWeatherRiskService()
    risks = svc.assess_outdoor_risks(_STUB_FORECAST_RISKY, [])
    assert risks == []


def test_outdoor_risk_service_severity_danger_on_heavy_rain() -> None:
    """Precipitation >= 20mm should be 'danger' severity."""
    svc = OutdoorWeatherRiskService()
    risks = svc.assess_outdoor_risks([_RAIN_DAY], ["dakwerk"])
    rain_risks = [r for r in risks if r.risk_type == "rain"]
    assert any(r.severity == "danger" for r in rain_risks)


def test_outdoor_risk_dataclass_fields() -> None:
    """OutdoorProcessRisk must expose: date, process_slug, risk_type, severity, details."""
    risk = OutdoorProcessRisk(
        date="2024-07-02",
        process_slug="schilderen",
        risk_type="rain",
        severity="danger",
        details="18.0 mm neerslag verwacht",
    )
    assert risk.date == "2024-07-02"
    assert risk.process_slug == "schilderen"
    assert risk.risk_type == "rain"
    assert risk.severity == "danger"


# ---------------------------------------------------------------------------
# AI constraint feed unit tests
# ---------------------------------------------------------------------------


def test_outdoor_risk_service_ai_constraints_structure() -> None:
    """ai_constraints returns a list of dicts suitable for the planning optimizer."""
    svc = OutdoorWeatherRiskService()
    risks = svc.assess_outdoor_risks(_STUB_FORECAST_RISKY, ["schilderen"])
    constraints = svc.to_ai_constraints(risks)
    assert isinstance(constraints, list)
    for c in constraints:
        assert "date" in c
        assert "process_slug" in c
        assert "constraint_type" in c
        assert "severity" in c


def test_outdoor_risk_service_ai_constraints_empty_when_no_risks() -> None:
    svc = OutdoorWeatherRiskService()
    constraints = svc.to_ai_constraints([])
    assert constraints == []


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_outdoor_risks_returns_list(client_no_dispatch: AsyncClient) -> None:
    headers = await _auth(client_no_dispatch)
    project_id = await _create_project(client_no_dispatch, headers)
    await _add_process_to_project(client_no_dispatch, headers, project_id, "schilderen")

    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=_STUB_FORECAST_RISKY),
    ):
        resp = await client_no_dispatch.get(
            f"/api/v1/weather/risks/{project_id}",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list)
    # Must include rain risk for schilderen
    assert any(r["process_slug"] == "schilderen" and r["risk_type"] == "rain" for r in body)


@pytest.mark.asyncio
async def test_get_outdoor_risks_empty_when_no_outdoor_processes(
    client_no_dispatch: AsyncClient,
) -> None:
    headers = await _auth(client_no_dispatch, "nooutdoor@example.com")
    project_id = await _create_project(client_no_dispatch, headers)
    # Add only an indoor process (not in OUTDOOR_PROCESS_SLUGS)
    resp = await client_no_dispatch.post(
        "/api/v1/processes/",
        json={"slug": "tegelzetten", "name": "Tegelzetten", "unit": "m2"},
        headers=headers,
    )
    assert resp.status_code in (201, 409), resp.text
    process_id = resp.json().get("id") if resp.status_code == 201 else None
    if process_id is None:
        list_resp = await client_no_dispatch.get("/api/v1/processes/", headers=headers)
        process_id = next(p["id"] for p in list_resp.json() if p["slug"] == "tegelzetten")
    link_resp = await client_no_dispatch.post(
        f"/api/v1/projects/{project_id}/processes",
        json={"process_id": process_id},
        headers=headers,
    )
    assert link_resp.status_code in (200, 201, 409)

    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=_STUB_FORECAST_RISKY),
    ):
        resp = await client_no_dispatch.get(
            f"/api/v1/weather/risks/{project_id}",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_outdoor_risks_404_unknown_project(client_no_dispatch: AsyncClient) -> None:
    headers = await _auth(client_no_dispatch, "user404@example.com")
    resp = await client_no_dispatch.get(
        f"/api/v1/weather/risks/{uuid.uuid4()}",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_outdoor_risks_dispatches_notification(client_no_dispatch: AsyncClient) -> None:
    """When danger risks are present, a notification should be dispatched."""
    headers = await _auth(client_no_dispatch, "notif@example.com")
    project_id = await _create_project(client_no_dispatch, headers)
    await _add_process_to_project(client_no_dispatch, headers, project_id, "dakwerk")

    dispatch_mock = AsyncMock()
    null_dispatcher = MagicMock()
    null_dispatcher.dispatch = dispatch_mock
    client_no_dispatch.app.dependency_overrides[get_default_dispatcher] = (
        lambda: null_dispatcher
    )

    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=_STUB_FORECAST_RISKY),
    ):
        resp = await client_no_dispatch.get(
            f"/api/v1/weather/risks/{project_id}",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    # Notification should have been dispatched
    assert dispatch_mock.called


@pytest.mark.asyncio
async def test_get_outdoor_risks_no_notification_when_clear(
    client_no_dispatch: AsyncClient,
) -> None:
    """No notification when forecast is clear."""
    headers = await _auth(client_no_dispatch, "clear@example.com")
    project_id = await _create_project(client_no_dispatch, headers)
    await _add_process_to_project(client_no_dispatch, headers, project_id, "schilderen")

    dispatch_mock = AsyncMock()
    null_dispatcher = MagicMock()
    null_dispatcher.dispatch = dispatch_mock
    client_no_dispatch.app.dependency_overrides[get_default_dispatcher] = (
        lambda: null_dispatcher
    )

    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=_STUB_FORECAST_CLEAR),
    ):
        resp = await client_no_dispatch.get(
            f"/api/v1/weather/risks/{project_id}",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    assert not dispatch_mock.called


@pytest.mark.asyncio
async def test_get_ai_constraints_returns_list(client_no_dispatch: AsyncClient) -> None:
    headers = await _auth(client_no_dispatch, "ai@example.com")
    project_id = await _create_project(client_no_dispatch, headers)
    await _add_process_to_project(client_no_dispatch, headers, project_id, "stucen")

    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=_STUB_FORECAST_RISKY),
    ):
        resp = await client_no_dispatch.get(
            f"/api/v1/weather/ai-constraints/{project_id}",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list)
    for c in body:
        assert "date" in c
        assert "process_slug" in c
        assert "constraint_type" in c
        assert "severity" in c


@pytest.mark.asyncio
async def test_get_ai_constraints_empty_on_clear_forecast(
    client_no_dispatch: AsyncClient,
) -> None:
    headers = await _auth(client_no_dispatch, "aiclear@example.com")
    project_id = await _create_project(client_no_dispatch, headers)
    await _add_process_to_project(client_no_dispatch, headers, project_id, "voegwerk")

    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=_STUB_FORECAST_CLEAR),
    ):
        resp = await client_no_dispatch.get(
            f"/api/v1/weather/ai-constraints/{project_id}",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    assert resp.json() == []
