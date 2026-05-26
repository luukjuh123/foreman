"""Tests for weather service and router.

Tests risk assessment as unit tests (no external calls).
Router tests mock the httpx call to Open-Meteo.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.weather import WeatherService, assess_work_risk

TEST_DB_URL = "sqlite+aiosqlite://"


# ---------------------------------------------------------------------------
# Fixtures — identical pattern to test_staff.py
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
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Unit tests — risk assessment logic (no I/O)
# ---------------------------------------------------------------------------


def test_risk_good_clear_day():
    risk = assess_work_risk(precipitation_mm=0.0, wind_speed_kmh=20.0, temp_min_c=5.0)
    assert risk == "good"


def test_risk_poor_heavy_rain():
    risk = assess_work_risk(precipitation_mm=15.0, wind_speed_kmh=20.0, temp_min_c=5.0)
    assert risk == "poor"


def test_risk_poor_exact_threshold_rain():
    # > 10mm is poor; exactly 10 is NOT poor — boundary test
    risk = assess_work_risk(precipitation_mm=10.0, wind_speed_kmh=20.0, temp_min_c=5.0)
    assert risk == "moderate"


def test_risk_poor_strong_wind():
    risk = assess_work_risk(precipitation_mm=0.0, wind_speed_kmh=65.0, temp_min_c=5.0)
    assert risk == "poor"


def test_risk_poor_frost():
    risk = assess_work_risk(precipitation_mm=0.0, wind_speed_kmh=10.0, temp_min_c=-5.0)
    assert risk == "poor"


def test_risk_poor_exact_frost_threshold():
    # < -2C is poor; exactly -2 is NOT poor
    risk = assess_work_risk(precipitation_mm=0.0, wind_speed_kmh=10.0, temp_min_c=-2.0)
    assert risk == "good"


def test_risk_moderate_light_rain():
    risk = assess_work_risk(precipitation_mm=5.0, wind_speed_kmh=20.0, temp_min_c=5.0)
    assert risk == "moderate"


def test_risk_moderate_wind():
    risk = assess_work_risk(precipitation_mm=0.0, wind_speed_kmh=50.0, temp_min_c=5.0)
    assert risk == "moderate"


def test_risk_moderate_exact_lower_precip_bound():
    # >= 2mm and <= 10mm is moderate (if not poor)
    risk = assess_work_risk(precipitation_mm=2.0, wind_speed_kmh=20.0, temp_min_c=5.0)
    assert risk == "moderate"


def test_risk_good_just_below_moderate_precip():
    # < 2mm is good (no other issues)
    risk = assess_work_risk(precipitation_mm=1.9, wind_speed_kmh=20.0, temp_min_c=5.0)
    assert risk == "good"


def test_risk_poor_beats_moderate():
    # both poor wind and moderate rain → poor wins
    risk = assess_work_risk(precipitation_mm=5.0, wind_speed_kmh=70.0, temp_min_c=5.0)
    assert risk == "poor"


# ---------------------------------------------------------------------------
# Helpers — build a fake Open-Meteo response
# ---------------------------------------------------------------------------


def _fake_open_meteo_response(days: int = 7) -> dict:
    base_date = date(2026, 5, 21)
    dates = [(base_date.replace(day=base_date.day + i)).isoformat() for i in range(days)]
    return {
        "latitude": 52.3676,
        "longitude": 4.9041,
        "daily": {
            "time": dates,
            "temperature_2m_max": [18.0] * days,
            "temperature_2m_min": [10.0] * days,
            "precipitation_sum": [0.5] * days,
            "windspeed_10m_max": [25.0] * days,
            "weathercode": [1] * days,
        },
    }


# ---------------------------------------------------------------------------
# Router integration tests (mocked HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_forecast_returns_7_days(client: AsyncClient) -> None:
    headers = await _auth(client)
    fake_response = _fake_open_meteo_response(7)

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = fake_response

    with patch("app.services.weather.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.get("/api/v1/weather/forecast", headers=headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["days"]) == 7
    assert body["latitude"] == 52.3676
    assert body["longitude"] == 4.9041
    assert "fetched_at" in body


@pytest.mark.asyncio
async def test_forecast_uses_custom_coords(client: AsyncClient) -> None:
    headers = await _auth(client)
    fake_response = _fake_open_meteo_response(7)
    fake_response["latitude"] = 51.9225
    fake_response["longitude"] = 4.4792

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = fake_response

    with patch("app.services.weather.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.get(
            "/api/v1/weather/forecast?latitude=51.9225&longitude=4.4792",
            headers=headers,
        )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_forecast_day_has_good_risk_for_calm_weather(client: AsyncClient) -> None:
    headers = await _auth(client)
    fake_response = _fake_open_meteo_response(7)
    # Calm, no rain, warm

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = fake_response

    with patch("app.services.weather.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.get("/api/v1/weather/forecast", headers=headers)

    days = resp.json()["days"]
    assert all(d["work_risk"] == "good" for d in days)


@pytest.mark.asyncio
async def test_forecast_day_has_poor_risk_for_heavy_rain(client: AsyncClient) -> None:
    headers = await _auth(client)
    fake_response = _fake_open_meteo_response(7)
    fake_response["daily"]["precipitation_sum"] = [15.0] * 7

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = fake_response

    with patch("app.services.weather.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.get("/api/v1/weather/forecast", headers=headers)

    days = resp.json()["days"]
    assert all(d["work_risk"] == "poor" for d in days)


@pytest.mark.asyncio
async def test_risk_summary_endpoint(client: AsyncClient) -> None:
    headers = await _auth(client)
    fake_response = _fake_open_meteo_response(7)

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = fake_response

    with patch("app.services.weather.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = await client.get("/api/v1/weather/forecast/risk-summary", headers=headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 7
    first = body[0]
    assert "date" in first
    assert "work_risk" in first
    # Only these two keys in summary
    assert set(first.keys()) == {"date", "work_risk"}


@pytest.mark.asyncio
async def test_forecast_unauthenticated_rejected(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/weather/forecast")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_risk_summary_unauthenticated_rejected(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/weather/forecast/risk-summary")
    assert resp.status_code in (401, 403)
