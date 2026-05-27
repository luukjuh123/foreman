"""Tests for staff certification CRUD, compliance, and expiry-check endpoints.

RED phase — these tests must FAIL until the implementation is in place.
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
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_staff(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": "Jan Bouwer", "role": "carpenter", "hourly_rate_cents": 3500},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Certification CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_certification(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    resp = await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={
            "cert_type": "VCA",
            "cert_name": "VCA Basis",
            "issued_at": "2024-01-15",
            "expires_at": "2027-01-15",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["cert_type"] == "VCA"
    assert body["cert_name"] == "VCA Basis"
    assert body["issued_at"] == "2024-01-15"
    assert body["expires_at"] == "2027-01-15"
    assert body["staff_id"] == staff_id
    assert "id" in body


@pytest.mark.asyncio
async def test_create_certification_all_types(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    for cert_type in ("VCA", "BHV", "crane_license", "asbestos", "other"):
        resp = await client.post(
            f"/api/v1/staff/{staff_id}/certifications",
            json={
                "cert_type": cert_type,
                "cert_name": f"{cert_type} cert",
                "issued_at": "2024-01-01",
                "expires_at": "2027-01-01",
            },
            headers=headers,
        )
        assert resp.status_code == 201, f"{cert_type}: {resp.text}"


@pytest.mark.asyncio
async def test_create_certification_invalid_type_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    resp = await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={
            "cert_type": "UNKNOWN_TYPE",
            "cert_name": "Bad cert",
            "issued_at": "2024-01-01",
            "expires_at": "2027-01-01",
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_certification_expiry_before_issued_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    resp = await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={
            "cert_type": "VCA",
            "cert_name": "Bad dates",
            "issued_at": "2024-06-01",
            "expires_at": "2024-01-01",  # before issued
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_certifications(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "VCA", "cert_name": "VCA", "issued_at": "2024-01-01", "expires_at": "2027-01-01"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "BHV", "cert_name": "BHV", "issued_at": "2024-02-01", "expires_at": "2026-02-01"},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/staff/{staff_id}/certifications", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 2
    types = {c["cert_type"] for c in body}
    assert types == {"VCA", "BHV"}


@pytest.mark.asyncio
async def test_get_certification(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    create_resp = await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "BHV", "cert_name": "BHV Basis", "issued_at": "2024-03-01", "expires_at": "2026-03-01"},
        headers=headers,
    )
    cert_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/staff/{staff_id}/certifications/{cert_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["cert_name"] == "BHV Basis"


@pytest.mark.asyncio
async def test_update_certification(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    create_resp = await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "VCA", "cert_name": "Old Name", "issued_at": "2024-01-01", "expires_at": "2027-01-01"},
        headers=headers,
    )
    cert_id = create_resp.json()["id"]

    resp = await client.put(
        f"/api/v1/staff/{staff_id}/certifications/{cert_id}",
        json={"cert_name": "Updated Name"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["cert_name"] == "Updated Name"
    # unchanged fields stay
    assert resp.json()["cert_type"] == "VCA"


@pytest.mark.asyncio
async def test_delete_certification(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    create_resp = await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "asbestos", "cert_name": "Asbestos", "issued_at": "2024-01-01", "expires_at": "2027-01-01"},
        headers=headers,
    )
    cert_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/staff/{staff_id}/certifications/{cert_id}", headers=headers)
    assert resp.status_code == 204

    # confirm gone
    resp = await client.get(f"/api/v1/staff/{staff_id}/certifications/{cert_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_certification_not_found_for_other_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner1@example.com")
    h2 = await _auth(client, "owner2@example.com")
    staff_id = await _create_staff(client, h1)

    create_resp = await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "VCA", "cert_name": "VCA", "issued_at": "2024-01-01", "expires_at": "2027-01-01"},
        headers=h1,
    )
    cert_id = create_resp.json()["id"]

    # h2 cannot see or touch it (staff itself is not accessible)
    resp = await client.get(f"/api/v1/staff/{staff_id}/certifications", headers=h2)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Expiry checks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expiring_soon_endpoint(client: AsyncClient) -> None:
    """GET /api/v1/staff/certifications/expiring-soon returns certs expiring within the window."""
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    # Cert expiring in 20 days — should appear in 30-day window
    from datetime import date, timedelta

    soon = (date.today() + timedelta(days=20)).isoformat()
    far = (date.today() + timedelta(days=200)).isoformat()

    await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "VCA", "cert_name": "Soon VCA", "issued_at": "2024-01-01", "expires_at": soon},
        headers=headers,
    )
    await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "BHV", "cert_name": "Far BHV", "issued_at": "2024-01-01", "expires_at": far},
        headers=headers,
    )

    resp = await client.get("/api/v1/staff/certifications/expiring-soon?days=30", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    cert_names = [c["cert_name"] for c in body]
    assert "Soon VCA" in cert_names
    assert "Far BHV" not in cert_names


@pytest.mark.asyncio
async def test_expiring_soon_default_window_is_30_days(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    from datetime import date, timedelta

    soon = (date.today() + timedelta(days=25)).isoformat()

    await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "VCA", "cert_name": "VCA Soon", "issued_at": "2024-01-01", "expires_at": soon},
        headers=headers,
    )

    resp = await client.get("/api/v1/staff/certifications/expiring-soon", headers=headers)
    assert resp.status_code == 200
    names = [c["cert_name"] for c in resp.json()]
    assert "VCA Soon" in names


@pytest.mark.asyncio
async def test_expiring_soon_excludes_already_expired(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    from datetime import date, timedelta

    past = (date.today() - timedelta(days=5)).isoformat()

    await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "VCA", "cert_name": "Expired VCA", "issued_at": "2020-01-01", "expires_at": past},
        headers=headers,
    )

    resp = await client.get("/api/v1/staff/certifications/expiring-soon?days=30", headers=headers)
    assert resp.status_code == 200
    names = [c["cert_name"] for c in resp.json()]
    assert "Expired VCA" not in names


# ---------------------------------------------------------------------------
# Compliance overview
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compliance_overview(client: AsyncClient) -> None:
    """GET /api/v1/staff/compliance returns team-wide cert coverage stats."""
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    from datetime import date, timedelta

    future = (date.today() + timedelta(days=365)).isoformat()

    await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "VCA", "cert_name": "VCA", "issued_at": "2024-01-01", "expires_at": future},
        headers=headers,
    )

    resp = await client.get("/api/v1/staff/compliance", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "total_staff" in body
    assert "total_certifications" in body
    assert "expired_count" in body
    assert "expiring_soon_count" in body
    assert "valid_count" in body
    assert body["total_staff"] == 1
    assert body["total_certifications"] == 1
    assert body["valid_count"] == 1
    assert body["expired_count"] == 0


@pytest.mark.asyncio
async def test_compliance_expired_cert_counted(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    from datetime import date, timedelta

    past = (date.today() - timedelta(days=10)).isoformat()

    await client.post(
        f"/api/v1/staff/{staff_id}/certifications",
        json={"cert_type": "VCA", "cert_name": "Expired", "issued_at": "2020-01-01", "expires_at": past},
        headers=headers,
    )

    resp = await client.get("/api/v1/staff/compliance", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["expired_count"] == 1
    assert body["valid_count"] == 0


@pytest.mark.asyncio
async def test_unauthenticated_cert_rejected(client: AsyncClient) -> None:
    # Without auth header — must be 401 or 403
    fake_id = "00000000-0000-0000-0000-000000000001"
    resp = await client.get(f"/api/v1/staff/{fake_id}/certifications")
    assert resp.status_code in (401, 403)
