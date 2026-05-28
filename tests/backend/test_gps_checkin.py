"""Tests for GPS-based construction site check-in/check-out.

Covers:
- Geofence model CRUD
- Check-in inside geofence (success)
- Check-in outside geofence (rejected)
- Check-out creates attendance log with GPS evidence
- Auto time tracking on check-in/out
- Attendance report per project
- Auth enforcement
- Ownership enforcement
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite://"

# Coordinates: Amsterdam city centre
SITE_LAT = 52.3676
SITE_LNG = 4.9041
SITE_RADIUS = 200  # metres

# Inside the geofence (~50 m away)
INSIDE_LAT = 52.3679
INSIDE_LNG = 4.9041

# Outside the geofence (~5 km away)
OUTSIDE_LAT = 52.3200
OUTSIDE_LNG = 4.9400


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


async def _auth(client: AsyncClient, email: str = "worker@example.com") -> dict:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Worker", "password": "secret123"},
    )
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _create_project(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/projects/", json={"name": "BuildSite"}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_geofence(client: AsyncClient, headers: dict, project_id: str) -> dict:
    r = await client.post(
        f"/api/v1/projects/{project_id}/geofence",
        json={"lat": SITE_LAT, "lng": SITE_LNG, "radius_meters": SITE_RADIUS},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Geofence CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_geofence(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    r = await client.post(
        f"/api/v1/projects/{pid}/geofence",
        json={"lat": SITE_LAT, "lng": SITE_LNG, "radius_meters": SITE_RADIUS},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["project_id"] == pid
    assert body["lat"] == SITE_LAT
    assert body["lng"] == SITE_LNG
    assert body["radius_meters"] == SITE_RADIUS


@pytest.mark.asyncio
async def test_get_geofence(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    r = await client.get(f"/api/v1/projects/{pid}/geofence", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["project_id"] == pid


@pytest.mark.asyncio
async def test_get_geofence_404_when_none(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    r = await client.get(f"/api/v1/projects/{pid}/geofence", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_geofence_requires_auth(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    r = await client.post(
        f"/api/v1/projects/{pid}/geofence",
        json={"lat": SITE_LAT, "lng": SITE_LNG, "radius_meters": SITE_RADIUS},
    )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_geofence_other_user_forbidden(client: AsyncClient) -> None:
    owner = await _auth(client, "owner@example.com")
    intruder = await _auth(client, "intruder@example.com")
    pid = await _create_project(client, owner)
    r = await client.post(
        f"/api/v1/projects/{pid}/geofence",
        json={"lat": SITE_LAT, "lng": SITE_LNG, "radius_meters": SITE_RADIUS},
        headers=intruder,
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Check-in
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_checkin_inside_geofence(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    r = await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["project_id"] == pid
    assert body["checked_out_at"] is None
    assert body["checkin_lat"] == INSIDE_LAT
    assert body["checkin_lng"] == INSIDE_LNG


@pytest.mark.asyncio
async def test_checkin_outside_geofence_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    r = await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": OUTSIDE_LAT, "lng": OUTSIDE_LNG},
        headers=headers,
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_checkin_no_geofence_rejected(client: AsyncClient) -> None:
    """Without a geofence configured, check-in is rejected."""
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    r = await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_double_checkin_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    r1 = await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    assert r1.status_code == 201
    r2 = await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    assert r2.status_code == 409


# ---------------------------------------------------------------------------
# Check-out
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_checkout_completes_attendance(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    r = await client.post(
        f"/api/v1/projects/{pid}/checkout",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["checked_out_at"] is not None
    assert body["checkout_lat"] == INSIDE_LAT
    assert body["checkout_lng"] == INSIDE_LNG
    assert body["duration_seconds"] is not None
    assert body["duration_seconds"] >= 0


@pytest.mark.asyncio
async def test_checkout_without_checkin_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    r = await client.post(
        f"/api/v1/projects/{pid}/checkout",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_checkout_outside_geofence_allowed(client: AsyncClient) -> None:
    """Checkout from outside is allowed — worker may have walked away."""
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    r = await client.post(
        f"/api/v1/projects/{pid}/checkout",
        json={"lat": OUTSIDE_LAT, "lng": OUTSIDE_LNG},
        headers=headers,
    )
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Attendance report
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_attendance_report(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    # Complete one attendance cycle
    await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    await client.post(
        f"/api/v1/projects/{pid}/checkout",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    r = await client.get(f"/api/v1/projects/{pid}/attendance", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "data" in body
    assert len(body["data"]) == 1
    entry = body["data"][0]
    assert entry["project_id"] == pid
    assert entry["checkin_lat"] == INSIDE_LAT
    assert entry["checkin_lng"] == INSIDE_LNG
    assert entry["checked_out_at"] is not None


@pytest.mark.asyncio
async def test_attendance_report_includes_open_entry(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    await _create_geofence(client, headers, pid)
    await client.post(
        f"/api/v1/projects/{pid}/checkin",
        json={"lat": INSIDE_LAT, "lng": INSIDE_LNG},
        headers=headers,
    )
    r = await client.get(f"/api/v1/projects/{pid}/attendance", headers=headers)
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1
    assert r.json()["data"][0]["checked_out_at"] is None


@pytest.mark.asyncio
async def test_attendance_report_requires_auth(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project(client, headers)
    r = await client.get(f"/api/v1/projects/{pid}/attendance")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_attendance_report_other_user_forbidden(client: AsyncClient) -> None:
    owner = await _auth(client, "own2@example.com")
    intruder = await _auth(client, "int2@example.com")
    pid = await _create_project(client, owner)
    r = await client.get(f"/api/v1/projects/{pid}/attendance", headers=intruder)
    assert r.status_code == 403
