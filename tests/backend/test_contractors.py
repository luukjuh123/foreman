"""Tests for Contractor (ZZP'er) management — extended subcontractor module.

Covers:
- Subcontractor CRUD with KVK/BTW/specializations
- SubcontractorAssignment CRUD (per-project assignment tracking)
- SubcontractorInvoice CRUD with approve/paid status flow
- Hours/cost calculation endpoint
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


async def _create_subcontractor(client: AsyncClient, headers: dict, **kwargs) -> dict:
    payload = {
        "company_name": "Bakker ZZP",
        "hourly_rate_cents": 6500,
        **kwargs,
    }
    resp = await client.post("/api/v1/subcontractors/", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Subcontractor CRUD — KVK/BTW/specializations extensions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_subcontractor_with_kvk_btw(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/subcontractors/",
        json={
            "company_name": "Loodgieter Pietersen",
            "contact_name": "Jan Pietersen",
            "email": "jan@pietersen.nl",
            "phone": "0612345678",
            "kvk_number": "12345678",
            "btw_number": "NL123456789B01",
            "specializations": ["plumbing", "heating"],
            "hourly_rate_cents": 8000,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kvk_number"] == "12345678"
    assert body["btw_number"] == "NL123456789B01"
    assert body["specializations"] == ["plumbing", "heating"]
    assert body["hourly_rate_cents"] == 8000


@pytest.mark.asyncio
async def test_create_subcontractor_without_kvk_btw(client: AsyncClient) -> None:
    """KVK/BTW are optional fields."""
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "ZZP Henk", "hourly_rate_cents": 5500},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kvk_number"] is None
    assert body["btw_number"] is None
    assert body["specializations"] == []


@pytest.mark.asyncio
async def test_update_subcontractor_kvk(client: AsyncClient) -> None:
    headers = await _auth(client)
    sub = await _create_subcontractor(client, headers)
    resp = await client.put(
        f"/api/v1/subcontractors/{sub['id']}",
        json={"kvk_number": "87654321", "btw_number": "NL987654321B02"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["kvk_number"] == "87654321"
    assert body["btw_number"] == "NL987654321B02"


@pytest.mark.asyncio
async def test_update_subcontractor_specializations(client: AsyncClient) -> None:
    headers = await _auth(client)
    sub = await _create_subcontractor(client, headers, specializations=["plumbing"])
    resp = await client.put(
        f"/api/v1/subcontractors/{sub['id']}",
        json={"specializations": ["plumbing", "electrical", "painting"]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["specializations"] == ["plumbing", "electrical", "painting"]


# ---------------------------------------------------------------------------
# SubcontractorAssignment CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_assignment(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    resp = await client.post(
        "/api/v1/subcontractor-assignments/",
        json={
            "subcontractor_id": sub["id"],
            "project_id": project_id,
            "description": "Lay foundation",
            "estimated_hours": 40.0,
            "agreed_rate_cents": 8000,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["subcontractor_id"] == sub["id"]
    assert body["project_id"] == project_id
    assert body["estimated_hours"] == 40.0
    assert body["agreed_rate_cents"] == 8000
    assert "id" in body


@pytest.mark.asyncio
async def test_create_assignment_fixed_cost(client: AsyncClient) -> None:
    """Assignment with fixed cost instead of hourly rate."""
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    resp = await client.post(
        "/api/v1/subcontractor-assignments/",
        json={
            "subcontractor_id": sub["id"],
            "project_id": project_id,
            "description": "Fixed-price carpentry",
            "agreed_fixed_cost_cents": 350000,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["agreed_fixed_cost_cents"] == 350000
    assert body["total_cost_cents"] == 350000


@pytest.mark.asyncio
async def test_list_assignments_by_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    for i in range(3):
        await client.post(
            "/api/v1/subcontractor-assignments/",
            json={"subcontractor_id": sub["id"], "project_id": project_id, "agreed_rate_cents": 7000},
            headers=headers,
        )
    resp = await client.get(
        "/api/v1/subcontractor-assignments/",
        params={"project_id": project_id},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_get_assignment(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractor-assignments/",
        json={"subcontractor_id": sub["id"], "project_id": project_id, "agreed_rate_cents": 7000},
        headers=headers,
    )
    assignment_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/subcontractor-assignments/{assignment_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == assignment_id


@pytest.mark.asyncio
async def test_get_assignment_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(f"/api/v1/subcontractor-assignments/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_assignment_actual_hours(client: AsyncClient) -> None:
    """Updating actual_hours recomputes total_cost_cents."""
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractor-assignments/",
        json={
            "subcontractor_id": sub["id"],
            "project_id": project_id,
            "estimated_hours": 20.0,
            "agreed_rate_cents": 10000,
        },
        headers=headers,
    )
    assignment_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/subcontractor-assignments/{assignment_id}",
        json={"actual_hours": 22.5},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["actual_hours"] == 22.5
    assert body["total_cost_cents"] == 225000  # 22.5 * 10000


@pytest.mark.asyncio
async def test_delete_assignment(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractor-assignments/",
        json={"subcontractor_id": sub["id"], "project_id": project_id, "agreed_rate_cents": 7000},
        headers=headers,
    )
    assignment_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/subcontractor-assignments/{assignment_id}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/v1/subcontractor-assignments/{assignment_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_assignment_isolation(client: AsyncClient) -> None:
    """Assignments belong to owner — other users cannot see them."""
    headers_a = await _auth(client, "a@example.com")
    headers_b = await _auth(client, "b@example.com")
    project_id = await _create_project(client, headers_a)
    sub = await _create_subcontractor(client, headers_a)
    create_resp = await client.post(
        "/api/v1/subcontractor-assignments/",
        json={"subcontractor_id": sub["id"], "project_id": project_id, "agreed_rate_cents": 7000},
        headers=headers_a,
    )
    assignment_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/subcontractor-assignments/{assignment_id}", headers=headers_b)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# SubcontractorInvoice CRUD (standalone, non-nested)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_subcontractor_invoice(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    resp = await client.post(
        "/api/v1/subcontractor-invoices/",
        json={
            "subcontractor_id": sub["id"],
            "project_id": project_id,
            "invoice_reference": "ZZP-2024-001",
            "invoice_date": "2024-06-15",
            "amount_cents": 200000,
            "vat_cents": 42000,
            "description": "Week 24 werk",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["invoice_reference"] == "ZZP-2024-001"
    assert body["amount_cents"] == 200000
    assert body["vat_cents"] == 42000
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_list_subcontractor_invoices(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    for i in range(3):
        await client.post(
            "/api/v1/subcontractor-invoices/",
            json={
                "subcontractor_id": sub["id"],
                "project_id": project_id,
                "invoice_reference": f"ZZP-2024-00{i+1}",
                "invoice_date": "2024-06-15",
                "amount_cents": 100000 + i * 10000,
                "vat_cents": 21000,
            },
            headers=headers,
        )
    resp = await client.get("/api/v1/subcontractor-invoices/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3


@pytest.mark.asyncio
async def test_get_subcontractor_invoice(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers)
    create_resp = await client.post(
        "/api/v1/subcontractor-invoices/",
        json={
            "subcontractor_id": sub["id"],
            "project_id": project_id,
            "invoice_reference": "ZZP-GET-001",
            "invoice_date": "2024-07-01",
            "amount_cents": 150000,
            "vat_cents": 31500,
        },
        headers=headers,
    )
    inv_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/subcontractor-invoices/{inv_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["invoice_reference"] == "ZZP-GET-001"


@pytest.mark.asyncio
async def test_get_subcontractor_invoice_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(f"/api/v1/subcontractor-invoices/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_subcontractor_invoice_filter_by_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_a = await _create_subcontractor(client, headers, company_name="Sub A")
    sub_b = await _create_subcontractor(client, headers, company_name="Sub B")
    await client.post(
        "/api/v1/subcontractor-invoices/",
        json={
            "subcontractor_id": sub_a["id"],
            "project_id": project_id,
            "invoice_reference": "A-001",
            "invoice_date": "2024-06-01",
            "amount_cents": 100000,
            "vat_cents": 21000,
        },
        headers=headers,
    )
    await client.post(
        "/api/v1/subcontractor-invoices/",
        json={
            "subcontractor_id": sub_b["id"],
            "project_id": project_id,
            "invoice_reference": "B-001",
            "invoice_date": "2024-06-01",
            "amount_cents": 200000,
            "vat_cents": 42000,
        },
        headers=headers,
    )
    resp = await client.get(
        "/api/v1/subcontractor-invoices/",
        params={"subcontractor_id": sub_a["id"]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["invoice_reference"] == "A-001"


# ---------------------------------------------------------------------------
# Contractor cost calculation endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subcontractor_cost_summary(client: AsyncClient) -> None:
    """GET /api/v1/subcontractors/{id}/cost-summary returns total hours + cost."""
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub = await _create_subcontractor(client, headers, hourly_rate_cents=10000)
    # Log hours via the nested route
    for hours in [8.0, 6.5, 7.0]:
        await client.post(
            f"/api/v1/subcontractors/{sub['id']}/hours",
            json={"project_id": project_id, "work_date": "2024-06-01", "hours": hours},
            headers=headers,
        )
    resp = await client.get(f"/api/v1/subcontractors/{sub['id']}/cost-summary", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_hours"] == pytest.approx(21.5)
    assert body["total_cost_cents"] == 215000  # 21.5 * 10000
    assert body["subcontractor_id"] == sub["id"]
