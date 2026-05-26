"""Tests for Subcontractor management — Phase 19.

Covers:
- CRUD for subcontractors (invite, list, get, update, soft-delete)
- Project access grants (share limited project view)
- Hour logging per subcontractor per project
- Invoice tracking per subcontractor
"""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite://"


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


async def _create_project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": "Test Project", "description": "desc"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Subcontractor CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/subcontractors/",
        json={
            "company_name": "Bakker Installaties",
            "contact_name": "Piet Bakker",
            "email": "piet@bakker.nl",
            "phone": "0612345678",
            "hourly_rate_cents": 7500,
            "specialty": "plumbing",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["company_name"] == "Bakker Installaties"
    assert body["contact_name"] == "Piet Bakker"
    assert body["hourly_rate_cents"] == 7500
    assert body["specialty"] == "plumbing"
    assert "id" in body


@pytest.mark.asyncio
async def test_create_subcontractor_minimal(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "ZZP Henk", "hourly_rate_cents": 5500},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["company_name"] == "ZZP Henk"
    assert body["contact_name"] is None
    assert body["email"] is None


@pytest.mark.asyncio
async def test_list_subcontractors(client: AsyncClient) -> None:
    headers = await _auth(client)
    for i in range(3):
        await client.post(
            "/api/v1/subcontractors/",
            json={"company_name": f"Sub {i}", "hourly_rate_cents": 5000 + i * 100},
            headers=headers,
        )
    resp = await client.get("/api/v1/subcontractors/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_get_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Elektro Jansen", "hourly_rate_cents": 6000, "specialty": "electrical"},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/subcontractors/{sub_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["company_name"] == "Elektro Jansen"


@pytest.mark.asyncio
async def test_get_subcontractor_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(f"/api/v1/subcontractors/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Old Name", "hourly_rate_cents": 5000},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/subcontractors/{sub_id}",
        json={"company_name": "New Name", "hourly_rate_cents": 6000},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["company_name"] == "New Name"
    assert body["hourly_rate_cents"] == 6000


@pytest.mark.asyncio
async def test_delete_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "To Delete", "hourly_rate_cents": 5000},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/subcontractors/{sub_id}", headers=headers)
    assert resp.status_code == 204
    # Soft-deleted — 404 on subsequent get
    resp = await client.get(f"/api/v1/subcontractors/{sub_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_subcontractor_isolation(client: AsyncClient) -> None:
    """Subcontractor belongs to owner — other users cannot see it."""
    headers_a = await _auth(client, "a@example.com")
    headers_b = await _auth(client, "b@example.com")
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Private Sub", "hourly_rate_cents": 5000},
        headers=headers_a,
    )
    sub_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/subcontractors/{sub_id}", headers=headers_b)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Project access grants
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_grant_project_access(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Grond Werk BV", "hourly_rate_cents": 5500},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/subcontractors/{sub_id}/project-access",
        json={"project_id": project_id},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["subcontractor_id"] == sub_id
    assert body["project_id"] == project_id


@pytest.mark.asyncio
async def test_list_project_access(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Schilder BV", "hourly_rate_cents": 4500},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    await client.post(
        f"/api/v1/subcontractors/{sub_id}/project-access",
        json={"project_id": project_id},
        headers=headers,
    )
    resp = await client.get(f"/api/v1/subcontractors/{sub_id}/project-access", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["project_id"] == project_id


@pytest.mark.asyncio
async def test_revoke_project_access(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Revoke Test", "hourly_rate_cents": 5000},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    grant_resp = await client.post(
        f"/api/v1/subcontractors/{sub_id}/project-access",
        json={"project_id": project_id},
        headers=headers,
    )
    grant_id = grant_resp.json()["id"]
    resp = await client.delete(
        f"/api/v1/subcontractors/{sub_id}/project-access/{grant_id}",
        headers=headers,
    )
    assert resp.status_code == 204
    # Confirm it's gone
    list_resp = await client.get(f"/api/v1/subcontractors/{sub_id}/project-access", headers=headers)
    assert list_resp.json() == []


# ---------------------------------------------------------------------------
# Hour logging
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_subcontractor_hours(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Uur Logger", "hourly_rate_cents": 6000},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/subcontractors/{sub_id}/hours",
        json={
            "project_id": project_id,
            "work_date": "2024-06-01",
            "hours": 8.0,
            "description": "Fundering gestort",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["hours"] == 8.0
    assert body["cost_cents"] == 48000  # 8 * 6000


@pytest.mark.asyncio
async def test_list_subcontractor_hours(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Uur Lijst", "hourly_rate_cents": 5000},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    for day in [1, 2, 3]:
        await client.post(
            f"/api/v1/subcontractors/{sub_id}/hours",
            json={"project_id": project_id, "work_date": f"2024-06-0{day}", "hours": 8.0},
            headers=headers,
        )
    resp = await client.get(f"/api/v1/subcontractors/{sub_id}/hours", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 3
    total_cost = sum(h["cost_cents"] for h in body)
    assert total_cost == 3 * 8 * 5000


# ---------------------------------------------------------------------------
# Invoice tracking
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_subcontractor_invoice(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Invoice BV", "hourly_rate_cents": 6500},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/subcontractors/{sub_id}/invoices",
        json={
            "project_id": project_id,
            "invoice_number": "INV-2024-001",
            "invoice_date": "2024-06-15",
            "amount_cents": 150000,
            "description": "Week 24 werkzaamheden",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["invoice_number"] == "INV-2024-001"
    assert body["amount_cents"] == 150000
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_list_subcontractor_invoices(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Multi Invoice BV", "hourly_rate_cents": 6500},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    for i in range(2):
        await client.post(
            f"/api/v1/subcontractors/{sub_id}/invoices",
            json={
                "project_id": project_id,
                "invoice_number": f"INV-2024-00{i+1}",
                "invoice_date": "2024-06-15",
                "amount_cents": 100000 + i * 10000,
            },
            headers=headers,
        )
    resp = await client.get(f"/api/v1/subcontractors/{sub_id}/invoices", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_mark_subcontractor_invoice_paid(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Pay Test BV", "hourly_rate_cents": 6500},
        headers=headers,
    )
    sub_id = create_resp.json()["id"]
    inv_resp = await client.post(
        f"/api/v1/subcontractors/{sub_id}/invoices",
        json={
            "project_id": project_id,
            "invoice_number": "INV-PAY-001",
            "invoice_date": "2024-06-15",
            "amount_cents": 80000,
        },
        headers=headers,
    )
    inv_id = inv_resp.json()["id"]
    resp = await client.patch(
        f"/api/v1/subcontractors/{sub_id}/invoices/{inv_id}",
        json={"status": "paid"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "paid"
