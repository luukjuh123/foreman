"""Tests for Weather API integration — Phase 19.

Covers:
- Fetch 7-day forecast for a project location
- Weather risk assessment (identifies rain/wind/frost days)
- Forecast cached to avoid hammering external API
- GET /api/v1/weather/forecast?lat=...&lon=... — raw forecast
- GET /api/v1/weather/forecast?project_id=... — forecast for project location
- GET /api/v1/weather/risks?project_id=... — risk summary for agenda/Gantt
- WeatherService unit tests with mocked HTTP
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.weather.client import WeatherService, WeatherDay, WeatherRisk

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


async def _auth(client: AsyncClient, email: str = "boss@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project_with_location(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={
            "name": "Locatie Project",
            "description": "desc",
            "location_lat": 52.3676,
            "location_lon": 4.9041,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# Stub forecast data returned by the mocked WeatherService
STUB_FORECAST = [
    WeatherDay(
        date="2024-06-01",
        temp_min=12.0,
        temp_max=18.0,
        precipitation_mm=0.0,
        wind_speed_kmh=15.0,
        weather_code=0,
        description="Clear sky",
    ),
    WeatherDay(
        date="2024-06-02",
        temp_min=8.0,
        temp_max=14.0,
        precipitation_mm=12.0,
        wind_speed_kmh=45.0,
        weather_code=65,
        description="Heavy rain",
    ),
]


# ---------------------------------------------------------------------------
# WeatherService unit tests (no HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_weather_service_returns_week_forecast() -> None:
    """WeatherService.get_forecast returns a list of WeatherDay objects."""
    svc = WeatherService()
    with patch.object(svc, "_fetch_open_meteo", new=AsyncMock(return_value=STUB_FORECAST)):
        result = await svc.get_forecast(lat=52.37, lon=4.90)
    assert len(result) == 2
    assert result[0].date == "2024-06-01"
    assert result[0].precipitation_mm == 0.0


@pytest.mark.asyncio
async def test_weather_service_identify_rain_risk() -> None:
    """Days with precipitation >= threshold flagged as rain risk."""
    svc = WeatherService()
    risks = svc.assess_risks(STUB_FORECAST)
    rain_risks = [r for r in risks if r.risk_type == "rain"]
    assert len(rain_risks) == 1
    assert rain_risks[0].date == "2024-06-02"


@pytest.mark.asyncio
async def test_weather_service_identify_wind_risk() -> None:
    """Days with wind speed >= 40 km/h flagged as wind risk."""
    svc = WeatherService()
    risks = svc.assess_risks(STUB_FORECAST)
    wind_risks = [r for r in risks if r.risk_type == "wind"]
    assert len(wind_risks) == 1
    assert wind_risks[0].date == "2024-06-02"


@pytest.mark.asyncio
async def test_weather_service_identify_frost_risk() -> None:
    """Days with temp_min <= 0 flagged as frost risk."""
    frost_day = WeatherDay(
        date="2024-01-15",
        temp_min=-3.0,
        temp_max=2.0,
        precipitation_mm=0.0,
        wind_speed_kmh=10.0,
        weather_code=71,
        description="Snow",
    )
    svc = WeatherService()
    risks = svc.assess_risks([frost_day])
    frost_risks = [r for r in risks if r.risk_type == "frost"]
    assert len(frost_risks) == 1
    assert frost_risks[0].date == "2024-01-15"


@pytest.mark.asyncio
async def test_weather_service_no_risk_clear_day() -> None:
    svc = WeatherService()
    clear_day = WeatherDay(
        date="2024-06-10",
        temp_min=14.0,
        temp_max=22.0,
        precipitation_mm=0.0,
        wind_speed_kmh=10.0,
        weather_code=0,
        description="Clear sky",
    )
    risks = svc.assess_risks([clear_day])
    assert risks == []


@pytest.mark.asyncio
async def test_weather_service_caches_result() -> None:
    """Second call with same lat/lon uses cache, not a second HTTP request."""
    svc = WeatherService()
    fetch_mock = AsyncMock(return_value=STUB_FORECAST)
    with patch.object(svc, "_fetch_open_meteo", new=fetch_mock):
        await svc.get_forecast(lat=52.37, lon=4.90)
        await svc.get_forecast(lat=52.37, lon=4.90)
    # Only called once due to cache
    assert fetch_mock.call_count == 1


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_forecast_by_coords(client: AsyncClient) -> None:
    headers = await _auth(client)
    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=STUB_FORECAST),
    ):
        resp = await client.get(
            "/api/v1/weather/forecast?lat=52.37&lon=4.90",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2
    assert body[0]["date"] == "2024-06-01"
    assert "precipitation_mm" in body[0]
    assert "wind_speed_kmh" in body[0]


@pytest.mark.asyncio
async def test_get_forecast_missing_coords(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get("/api/v1/weather/forecast", headers=headers)
    assert resp.status_code == 422  # lat/lon required


@pytest.mark.asyncio
async def test_get_weather_risks(client: AsyncClient) -> None:
    headers = await _auth(client)
    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=STUB_FORECAST),
    ):
        resp = await client.get(
            "/api/v1/weather/risks?lat=52.37&lon=4.90",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list)
    risk_types = {r["risk_type"] for r in body}
    assert "rain" in risk_types
    assert "wind" in risk_types


@pytest.mark.asyncio
async def test_get_forecast_by_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project_with_location(client, headers)
    with patch(
        "app.routers.weather.weather_service.get_forecast",
        new=AsyncMock(return_value=STUB_FORECAST),
    ):
        resp = await client.get(
            f"/api/v1/weather/forecast?project_id={project_id}",
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 2


@pytest.mark.asyncio
async def test_get_forecast_project_no_location(client: AsyncClient) -> None:
    """Project without lat/lon returns 422."""
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": "No Location", "description": "desc"},
        headers=headers,
    )
    project_id = resp.json()["id"]
    result = await client.get(
        f"/api/v1/weather/forecast?project_id={project_id}",
        headers=headers,
    )
    assert result.status_code == 422


@pytest.mark.asyncio
async def test_get_forecast_project_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(
        f"/api/v1/weather/forecast?project_id={uuid.uuid4()}",
        headers=headers,
    )
    assert resp.status_code == 404
