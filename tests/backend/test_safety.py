"""Tests for safety & compliance endpoints — TDD red-green-refactor.

Covers:
- SafetyCertification CRUD + expiry filter
- update_cert_statuses utility
- SafetyIncident CRUD + stats
- RIEChecklist CRUD
- Dashboard endpoint
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

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
    # Give the audit middleware a session factory pointing at the test DB
    app.state.audit_session_factory = session_factory
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


async def _create_project(client: AsyncClient, headers: dict, name: str = "Bouwproject A") -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": name, "description": "Test project"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


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
async def test_create_certification_for_staff(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "VCA_BASIS",
            "cert_name": "VCA Basis",
            "issued_date": "2024-01-15",
            "expiry_date": "2026-01-15",
            "issuing_body": "Stichting VCA",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["cert_type"] == "VCA_BASIS"
    assert body["cert_name"] == "VCA Basis"
    assert body["staff_id"] == staff_id
    assert body["company_wide"] is False
    assert body["status"] in ("active", "expiring_soon", "expired")


@pytest.mark.asyncio
async def test_create_company_wide_certification(client: AsyncClient) -> None:
    headers = await _auth(client)

    resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "company_wide": True,
            "cert_type": "ARBO",
            "cert_name": "ARBO Bedrijfscertificaat",
            "issued_date": "2023-06-01",
            "expiry_date": "2025-06-01",
            "issuing_body": "Arbodienst NL",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["company_wide"] is True
    assert body["staff_id"] is None


@pytest.mark.asyncio
async def test_list_certifications(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    # Create two certs
    for cert_type in ("VCA_BASIS", "BHV"):
        await client.post(
            "/api/v1/safety/certifications/",
            json={
                "staff_id": staff_id,
                "cert_type": cert_type,
                "cert_name": f"{cert_type} cert",
                "issued_date": "2024-01-01",
                "expiry_date": "2026-01-01",
                "issuing_body": "Test",
            },
            headers=headers,
        )

    resp = await client.get("/api/v1/safety/certifications/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["data"]) == 2


@pytest.mark.asyncio
async def test_list_certifications_filter_by_staff(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "VCA_BASIS",
            "cert_name": "VCA Basis",
            "issued_date": "2024-01-01",
            "expiry_date": "2026-01-01",
            "issuing_body": "Stichting VCA",
        },
        headers=headers,
    )
    # company-wide cert — should NOT appear when filtering by staff_id
    await client.post(
        "/api/v1/safety/certifications/",
        json={
            "company_wide": True,
            "cert_type": "ARBO",
            "cert_name": "ARBO",
            "issued_date": "2024-01-01",
            "expiry_date": "2026-01-01",
            "issuing_body": "Arbodienst",
        },
        headers=headers,
    )

    resp = await client.get(f"/api/v1/safety/certifications/?staff_id={staff_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["data"][0]["cert_type"] == "VCA_BASIS"


@pytest.mark.asyncio
async def test_get_certification(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    create_resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "EHBO",
            "cert_name": "EHBO",
            "issued_date": "2024-01-01",
            "expiry_date": "2026-01-01",
            "issuing_body": "Rode Kruis",
        },
        headers=headers,
    )
    cert_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/safety/certifications/{cert_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == cert_id


@pytest.mark.asyncio
async def test_update_certification(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    create_resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "VCA_VOL",
            "cert_name": "VCA Vol",
            "issued_date": "2024-01-01",
            "expiry_date": "2026-01-01",
            "issuing_body": "Stichting VCA",
        },
        headers=headers,
    )
    cert_id = create_resp.json()["id"]

    resp = await client.put(
        f"/api/v1/safety/certifications/{cert_id}",
        json={"issuing_body": "Updated Body"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["issuing_body"] == "Updated Body"


@pytest.mark.asyncio
async def test_delete_certification(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    create_resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "VCA_BASIS",
            "cert_name": "VCA Basis",
            "issued_date": "2024-01-01",
            "expiry_date": "2026-01-01",
            "issuing_body": "Stichting VCA",
        },
        headers=headers,
    )
    cert_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/safety/certifications/{cert_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/v1/safety/certifications/{cert_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_certification_not_accessible_by_other_user(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "thief@example.com")
    staff_id = await _create_staff(client, h1)

    create_resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "VCA_BASIS",
            "cert_name": "VCA Basis",
            "issued_date": "2024-01-01",
            "expiry_date": "2026-01-01",
            "issuing_body": "Stichting VCA",
        },
        headers=h1,
    )
    cert_id = create_resp.json()["id"]

    assert (await client.get(f"/api/v1/safety/certifications/{cert_id}", headers=h2)).status_code == 404


# ---------------------------------------------------------------------------
# Expiring certs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expiring_certifications_endpoint(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    today = date.today()
    expiring_soon = (today + timedelta(days=15)).isoformat()
    not_expiring = (today + timedelta(days=90)).isoformat()
    already_expired = (today - timedelta(days=5)).isoformat()

    # cert expiring soon
    await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "VCA_BASIS",
            "cert_name": "Expiring Soon",
            "issued_date": "2022-01-01",
            "expiry_date": expiring_soon,
            "issuing_body": "Test",
        },
        headers=headers,
    )
    # cert not expiring
    await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "BHV",
            "cert_name": "Not Expiring",
            "issued_date": "2024-01-01",
            "expiry_date": not_expiring,
            "issuing_body": "Test",
        },
        headers=headers,
    )
    # cert already expired
    await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "EHBO",
            "cert_name": "Already Expired",
            "issued_date": "2020-01-01",
            "expiry_date": already_expired,
            "issuing_body": "Test",
        },
        headers=headers,
    )

    resp = await client.get("/api/v1/safety/certifications/expiring", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # Should include expiring_soon cert (within 30 days) but not the 90-day one
    # The expired one should NOT appear in "expiring" (it's past)
    names = [c["cert_name"] for c in data]
    assert "Expiring Soon" in names
    assert "Not Expiring" not in names


# ---------------------------------------------------------------------------
# Certification status update utility
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cert_status_reflects_expiry(client: AsyncClient) -> None:
    """Certs created with past expiry_date should have status='expired'."""
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    past_date = (date.today() - timedelta(days=10)).isoformat()

    resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "VCA_BASIS",
            "cert_name": "Expired Cert",
            "issued_date": "2020-01-01",
            "expiry_date": past_date,
            "issuing_body": "Stichting VCA",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "expired"


@pytest.mark.asyncio
async def test_cert_status_expiring_soon(client: AsyncClient) -> None:
    """Certs expiring within 30 days should have status='expiring_soon'."""
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    soon = (date.today() + timedelta(days=20)).isoformat()

    resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "BHV",
            "cert_name": "Expiring Soon Cert",
            "issued_date": "2022-01-01",
            "expiry_date": soon,
            "issuing_body": "Test",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "expiring_soon"


@pytest.mark.asyncio
async def test_cert_status_active(client: AsyncClient) -> None:
    """Certs expiring beyond 30 days should have status='active'."""
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)

    future = (date.today() + timedelta(days=90)).isoformat()

    resp = await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "ARBO",
            "cert_name": "Active Cert",
            "issued_date": "2024-01-01",
            "expiry_date": future,
            "issuing_body": "Arbodienst",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "active"


# ---------------------------------------------------------------------------
# SafetyIncident CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_safety_incident(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        "/api/v1/safety/incidents/",
        json={
            "project_id": project_id,
            "incident_date": "2025-01-10",
            "severity": "minor",
            "description": "Kleine val van steiger",
            "corrective_action": "Leuning hersteld",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["severity"] == "minor"
    assert body["project_id"] == project_id
    assert body["resolved_at"] is None


@pytest.mark.asyncio
async def test_list_safety_incidents(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    for severity in ("near_miss", "major"):
        await client.post(
            "/api/v1/safety/incidents/",
            json={
                "project_id": project_id,
                "incident_date": "2025-01-10",
                "severity": severity,
                "description": f"Incident {severity}",
                "corrective_action": "Actie ondernomen",
            },
            headers=headers,
        )

    resp = await client.get("/api/v1/safety/incidents/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2


@pytest.mark.asyncio
async def test_list_safety_incidents_filter_by_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_a = await _create_project(client, headers, "Project A")
    project_b = await _create_project(client, headers, "Project B")

    await client.post(
        "/api/v1/safety/incidents/",
        json={
            "project_id": project_a,
            "incident_date": "2025-01-10",
            "severity": "minor",
            "description": "Incident A",
            "corrective_action": "Actie",
        },
        headers=headers,
    )
    await client.post(
        "/api/v1/safety/incidents/",
        json={
            "project_id": project_b,
            "incident_date": "2025-01-10",
            "severity": "critical",
            "description": "Incident B",
            "corrective_action": "Actie",
        },
        headers=headers,
    )

    resp = await client.get(f"/api/v1/safety/incidents/?project_id={project_a}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["data"][0]["severity"] == "minor"


@pytest.mark.asyncio
async def test_update_safety_incident(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/safety/incidents/",
        json={
            "project_id": project_id,
            "incident_date": "2025-01-10",
            "severity": "near_miss",
            "description": "Bijna val",
            "corrective_action": "Actie",
        },
        headers=headers,
    )
    incident_id = create_resp.json()["id"]

    resp = await client.put(
        f"/api/v1/safety/incidents/{incident_id}",
        json={"corrective_action": "Verbeterde actie"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["corrective_action"] == "Verbeterde actie"


@pytest.mark.asyncio
async def test_delete_safety_incident(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/safety/incidents/",
        json={
            "project_id": project_id,
            "incident_date": "2025-01-10",
            "severity": "minor",
            "description": "Test",
            "corrective_action": "Test",
        },
        headers=headers,
    )
    incident_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/safety/incidents/{incident_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/v1/safety/incidents/{incident_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_incident_stats(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    for severity in ("near_miss", "near_miss", "minor", "critical"):
        await client.post(
            "/api/v1/safety/incidents/",
            json={
                "project_id": project_id,
                "incident_date": "2025-01-10",
                "severity": severity,
                "description": f"Incident {severity}",
                "corrective_action": "Actie",
            },
            headers=headers,
        )

    resp = await client.get("/api/v1/safety/incidents/stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 4
    assert data["by_severity"]["near_miss"] == 2
    assert data["by_severity"]["minor"] == 1
    assert data["by_severity"]["critical"] == 1


@pytest.mark.asyncio
async def test_incident_stats_by_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_a = await _create_project(client, headers, "Project A")
    project_b = await _create_project(client, headers, "Project B")

    await client.post(
        "/api/v1/safety/incidents/",
        json={
            "project_id": project_a,
            "incident_date": "2025-01-10",
            "severity": "minor",
            "description": "Inc A",
            "corrective_action": "Actie",
        },
        headers=headers,
    )
    await client.post(
        "/api/v1/safety/incidents/",
        json={
            "project_id": project_b,
            "incident_date": "2025-01-10",
            "severity": "critical",
            "description": "Inc B",
            "corrective_action": "Actie",
        },
        headers=headers,
    )

    resp = await client.get("/api/v1/safety/incidents/stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert project_a in data["by_project"] or str(project_a) in data["by_project"]


# ---------------------------------------------------------------------------
# RIEChecklist CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rie_checklist(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        "/api/v1/safety/rie/",
        json={
            "project_id": project_id,
            "template_name": "Standaard Bouw RI&E",
            "items": [
                {
                    "question": "Is de steiger goedgekeurd?",
                    "risk_level": "high",
                    "mitigation": "Keuring door gecertificeerd bedrijf",
                    "checked_by": None,
                    "checked_at": None,
                }
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["template_name"] == "Standaard Bouw RI&E"
    assert len(body["items"]) == 1
    assert body["completed_at"] is None


@pytest.mark.asyncio
async def test_list_rie_checklists(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    for i in range(3):
        await client.post(
            "/api/v1/safety/rie/",
            json={
                "project_id": project_id,
                "template_name": f"RI&E {i}",
                "items": [],
            },
            headers=headers,
        )

    resp = await client.get("/api/v1/safety/rie/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3


@pytest.mark.asyncio
async def test_get_rie_checklist(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/safety/rie/",
        json={
            "project_id": project_id,
            "template_name": "RI&E Test",
            "items": [],
        },
        headers=headers,
    )
    rie_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/safety/rie/{rie_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == rie_id


@pytest.mark.asyncio
async def test_update_rie_checklist(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/safety/rie/",
        json={
            "project_id": project_id,
            "template_name": "RI&E",
            "items": [],
        },
        headers=headers,
    )
    rie_id = create_resp.json()["id"]

    resp = await client.put(
        f"/api/v1/safety/rie/{rie_id}",
        json={"template_name": "Bijgewerkte RI&E"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["template_name"] == "Bijgewerkte RI&E"


@pytest.mark.asyncio
async def test_delete_rie_checklist(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/safety/rie/",
        json={
            "project_id": project_id,
            "template_name": "RI&E to delete",
            "items": [],
        },
        headers=headers,
    )
    rie_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/safety/rie/{rie_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/v1/safety/rie/{rie_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_rie_isolation_between_users(client: AsyncClient) -> None:
    h1 = await _auth(client, "user1@example.com")
    h2 = await _auth(client, "user2@example.com")

    project_id = await _create_project(client, h1)
    create_resp = await client.post(
        "/api/v1/safety/rie/",
        json={"project_id": project_id, "template_name": "RI&E", "items": []},
        headers=h1,
    )
    rie_id = create_resp.json()["id"]

    assert (await client.get(f"/api/v1/safety/rie/{rie_id}", headers=h2)).status_code == 404


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dashboard_returns_compliance_overview(client: AsyncClient) -> None:
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers)
    project_id = await _create_project(client, headers)

    today = date.today()

    # 1 expiring cert (within 30 days)
    await client.post(
        "/api/v1/safety/certifications/",
        json={
            "staff_id": staff_id,
            "cert_type": "VCA_BASIS",
            "cert_name": "Expiring",
            "issued_date": "2022-01-01",
            "expiry_date": (today + timedelta(days=15)).isoformat(),
            "issuing_body": "Test",
        },
        headers=headers,
    )

    # 1 open incident
    await client.post(
        "/api/v1/safety/incidents/",
        json={
            "project_id": project_id,
            "incident_date": today.isoformat(),
            "severity": "major",
            "description": "Open incident",
            "corrective_action": "Pending",
        },
        headers=headers,
    )

    # 1 incomplete checklist
    await client.post(
        "/api/v1/safety/rie/",
        json={"project_id": project_id, "template_name": "Onvolledig", "items": []},
        headers=headers,
    )

    resp = await client.get("/api/v1/safety/dashboard", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["expiring_certs_count"] >= 1
    assert data["open_incidents_count"] >= 1
    assert data["incomplete_checklists_count"] >= 1


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/safety/certifications/")).status_code in (401, 403)
    assert (await client.get("/api/v1/safety/incidents/")).status_code in (401, 403)
    assert (await client.get("/api/v1/safety/rie/")).status_code in (401, 403)
    assert (await client.get("/api/v1/safety/dashboard")).status_code in (401, 403)
