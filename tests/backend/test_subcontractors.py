"""Tests for Subcontractor management — Phase 19.

Covers:
- Subcontractor CRUD: company name, KVK, specialties, hourly/fixed rates, certifications, rating
- Certifications (VCA, BRL) with expiry dates
- Assignments: link subcontractors to projects/phases/tasks, track hours and costs
- Invoice linking: match invoices to subcontractor + project, auto-reconcile with journal entries
"""

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


async def _create_project(client: AsyncClient, headers: dict, name: str = "Renovation") -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": name, "description": "Test project", "start_date": "2026-06-01", "end_date": "2026-08-01"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ─── Subcontractor CRUD ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_subcontractor_minimal(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/subcontractors/",
        json={
            "company_name": "Stucadoors BV",
            "kvk_number": "12345678",
            "specialties": ["stucen", "schilderen"],
            "hourly_rate_cents": 7500,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["company_name"] == "Stucadoors BV"
    assert body["kvk_number"] == "12345678"
    assert body["specialties"] == ["stucen", "schilderen"]
    assert body["hourly_rate_cents"] == 7500
    assert body["fixed_rate_cents"] is None
    assert body["rating"] is None
    assert body["certifications"] == []


@pytest.mark.asyncio
async def test_create_subcontractor_with_fixed_rate_and_rating(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/subcontractors/",
        json={
            "company_name": "Tegelbedrijf Utrecht",
            "specialties": ["tegelen"],
            "hourly_rate_cents": 6500,
            "fixed_rate_cents": 250000,
            "rating": 4,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["fixed_rate_cents"] == 250000
    assert body["rating"] == 4


@pytest.mark.asyncio
async def test_rating_must_be_1_to_5(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "X", "specialties": [], "hourly_rate_cents": 1000, "rating": 6},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_hourly_rate_non_negative(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "X", "specialties": [], "hourly_rate_cents": -1},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_subcontractors_pagination(client: AsyncClient) -> None:
    headers = await _auth(client)
    for i in range(3):
        await client.post(
            "/api/v1/subcontractors/",
            json={"company_name": f"Sub {i}", "specialties": ["x"], "hourly_rate_cents": 1000},
            headers=headers,
        )
    resp = await client.get("/api/v1/subcontractors/?page=1&per_page=2", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["data"]) == 2


@pytest.mark.asyncio
async def test_list_subcontractors_search_by_specialty(client: AsyncClient) -> None:
    headers = await _auth(client)
    await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Stucwerk NL", "specialties": ["stucen"], "hourly_rate_cents": 5000},
        headers=headers,
    )
    await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Tegels Plus", "specialties": ["tegelen"], "hourly_rate_cents": 5000},
        headers=headers,
    )
    resp = await client.get("/api/v1/subcontractors/?specialty=stucen", headers=headers)
    assert resp.status_code == 200
    names = [s["company_name"] for s in resp.json()["data"]]
    assert "Stucwerk NL" in names
    assert "Tegels Plus" not in names


@pytest.mark.asyncio
async def test_list_subcontractors_excludes_other_owners(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@example.com")
    h2 = await _auth(client, "b@example.com")
    await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Owner A Sub", "specialties": [], "hourly_rate_cents": 1000},
        headers=h1,
    )
    resp = await client.get("/api/v1/subcontractors/", headers=h2)
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_get_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Dak BV", "specialties": ["dakdekken"], "hourly_rate_cents": 8000},
        headers=headers,
    )
    sid = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/subcontractors/{sid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["company_name"] == "Dak BV"


@pytest.mark.asyncio
async def test_update_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Schilder NL", "specialties": ["schilderen"], "hourly_rate_cents": 5500},
        headers=headers,
    )
    sid = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/subcontractors/{sid}",
        json={"hourly_rate_cents": 6000, "rating": 5},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["hourly_rate_cents"] == 6000
    assert resp.json()["rating"] == 5


@pytest.mark.asyncio
async def test_delete_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Del BV", "specialties": [], "hourly_rate_cents": 1000},
        headers=headers,
    )
    sid = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/subcontractors/{sid}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/v1/subcontractors/{sid}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cannot_touch_other_owners_subcontractor(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner1@example.com")
    h2 = await _auth(client, "owner2@example.com")
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Private Sub", "specialties": [], "hourly_rate_cents": 1000},
        headers=h1,
    )
    sid = create_resp.json()["id"]
    assert (await client.get(f"/api/v1/subcontractors/{sid}", headers=h2)).status_code == 404
    assert (await client.put(f"/api/v1/subcontractors/{sid}", json={"rating": 3}, headers=h2)).status_code == 404
    assert (await client.delete(f"/api/v1/subcontractors/{sid}", headers=h2)).status_code == 404


# ─── Certifications ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_certification(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Cert BV", "specialties": [], "hourly_rate_cents": 5000},
        headers=headers,
    )
    sid = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/subcontractors/{sid}/certifications",
        json={"cert_type": "VCA", "expiry_date": "2027-12-31"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["cert_type"] == "VCA"
    assert body["expiry_date"] == "2027-12-31"


@pytest.mark.asyncio
async def test_certification_type_must_be_valid(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Cert2 BV", "specialties": [], "hourly_rate_cents": 5000},
        headers=headers,
    )
    sid = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/subcontractors/{sid}/certifications",
        json={"cert_type": "INVALID", "expiry_date": "2027-12-31"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_certifications_listed_on_subcontractor(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Cert3 BV", "specialties": [], "hourly_rate_cents": 5000},
        headers=headers,
    )
    sid = create_resp.json()["id"]
    await client.post(
        f"/api/v1/subcontractors/{sid}/certifications",
        json={"cert_type": "VCA", "expiry_date": "2027-01-01"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/subcontractors/{sid}/certifications",
        json={"cert_type": "BRL", "expiry_date": "2026-06-30"},
        headers=headers,
    )
    resp = await client.get(f"/api/v1/subcontractors/{sid}", headers=headers)
    certs = resp.json()["certifications"]
    assert len(certs) == 2
    types = {c["cert_type"] for c in certs}
    assert types == {"VCA", "BRL"}


# ─── Assignments ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_assignment(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Assign BV", "specialties": ["stucen"], "hourly_rate_cents": 7000},
        headers=headers,
    )
    sub_id = sub_resp.json()["id"]

    resp = await client.post(
        "/api/v1/subcontractors/assignments/",
        json={
            "subcontractor_id": sub_id,
            "project_id": project_id,
            "description": "Stucen badkamer",
            "estimated_hours": 16,
            "agreed_rate_cents": 7000,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["subcontractor_id"] == sub_id
    assert body["project_id"] == project_id
    assert body["description"] == "Stucen badkamer"
    assert body["estimated_hours"] == 16
    assert body["agreed_rate_cents"] == 7000
    assert body["actual_hours"] == 0
    assert body["status"] == "planned"


@pytest.mark.asyncio
async def test_list_assignments_for_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "List Assign BV", "specialties": [], "hourly_rate_cents": 5000},
        headers=headers,
    )
    sub_id = sub_resp.json()["id"]

    for i in range(2):
        await client.post(
            "/api/v1/subcontractors/assignments/",
            json={
                "subcontractor_id": sub_id,
                "project_id": project_id,
                "description": f"Task {i}",
                "estimated_hours": 8,
                "agreed_rate_cents": 5000,
            },
            headers=headers,
        )

    resp = await client.get(f"/api/v1/subcontractors/assignments/?project_id={project_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


@pytest.mark.asyncio
async def test_update_assignment_actual_hours(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Hours BV", "specialties": [], "hourly_rate_cents": 6000},
        headers=headers,
    )
    sub_id = sub_resp.json()["id"]

    assign_resp = await client.post(
        "/api/v1/subcontractors/assignments/",
        json={
            "subcontractor_id": sub_id,
            "project_id": project_id,
            "description": "Werkzaamheden",
            "estimated_hours": 20,
            "agreed_rate_cents": 6000,
        },
        headers=headers,
    )
    aid = assign_resp.json()["id"]

    resp = await client.put(
        f"/api/v1/subcontractors/assignments/{aid}",
        json={"actual_hours": 18, "status": "completed"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["actual_hours"] == 18
    assert resp.json()["status"] == "completed"
    # total cost = actual_hours * agreed_rate_cents
    assert resp.json()["total_cost_cents"] == 18 * 6000


@pytest.mark.asyncio
async def test_assignment_fixed_cost(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Fixed BV", "specialties": [], "hourly_rate_cents": 6000},
        headers=headers,
    )
    sub_id = sub_resp.json()["id"]

    resp = await client.post(
        "/api/v1/subcontractors/assignments/",
        json={
            "subcontractor_id": sub_id,
            "project_id": project_id,
            "description": "Vaste prijs werk",
            "agreed_fixed_cost_cents": 150000,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["agreed_fixed_cost_cents"] == 150000
    assert body["total_cost_cents"] == 150000


# ─── Invoice Linking ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_subcontractor_invoice(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Invoice Sub BV", "specialties": [], "hourly_rate_cents": 7000},
        headers=headers,
    )
    sub_id = sub_resp.json()["id"]

    resp = await client.post(
        "/api/v1/subcontractors/invoices/",
        json={
            "subcontractor_id": sub_id,
            "project_id": project_id,
            "invoice_reference": "SUB-2026-001",
            "invoice_date": "2026-07-01",
            "amount_cents": 70000,
            "vat_cents": 14700,
            "description": "Factuur stucwerk badkamer",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["subcontractor_id"] == sub_id
    assert body["project_id"] == project_id
    assert body["invoice_reference"] == "SUB-2026-001"
    assert body["amount_cents"] == 70000
    assert body["vat_cents"] == 14700
    assert body["status"] == "received"
    assert body["journal_entry_id"] is None


@pytest.mark.asyncio
async def test_reconcile_invoice_creates_journal_entry(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Reconcile BV", "specialties": [], "hourly_rate_cents": 5000},
        headers=headers,
    )
    sub_id = sub_resp.json()["id"]

    inv_resp = await client.post(
        "/api/v1/subcontractors/invoices/",
        json={
            "subcontractor_id": sub_id,
            "project_id": project_id,
            "invoice_reference": "SUB-2026-002",
            "invoice_date": "2026-07-15",
            "amount_cents": 50000,
            "vat_cents": 10500,
            "description": "Tegelwerk",
        },
        headers=headers,
    )
    inv_id = inv_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/subcontractors/invoices/{inv_id}/reconcile",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "reconciled"
    assert body["journal_entry_id"] is not None


@pytest.mark.asyncio
async def test_cannot_reconcile_twice(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "Double Reconcile BV", "specialties": [], "hourly_rate_cents": 5000},
        headers=headers,
    )
    sub_id = sub_resp.json()["id"]
    inv_resp = await client.post(
        "/api/v1/subcontractors/invoices/",
        json={
            "subcontractor_id": sub_id,
            "project_id": project_id,
            "invoice_reference": "SUB-2026-003",
            "invoice_date": "2026-07-15",
            "amount_cents": 30000,
            "description": "Work",
        },
        headers=headers,
    )
    inv_id = inv_resp.json()["id"]
    await client.post(f"/api/v1/subcontractors/invoices/{inv_id}/reconcile", headers=headers)
    resp = await client.post(f"/api/v1/subcontractors/invoices/{inv_id}/reconcile", headers=headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_list_subcontractor_invoices_by_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    sub_resp = await client.post(
        "/api/v1/subcontractors/",
        json={"company_name": "ListInv BV", "specialties": [], "hourly_rate_cents": 5000},
        headers=headers,
    )
    sub_id = sub_resp.json()["id"]

    for i in range(3):
        await client.post(
            "/api/v1/subcontractors/invoices/",
            json={
                "subcontractor_id": sub_id,
                "project_id": project_id,
                "invoice_reference": f"SUB-2026-{i:03d}",
                "invoice_date": "2026-07-01",
                "amount_cents": 10000,
                "description": f"Factuur {i}",
            },
            headers=headers,
        )

    resp = await client.get(f"/api/v1/subcontractors/invoices/?project_id={project_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 3


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/subcontractors/")).status_code in (401, 403)
    assert (await client.get("/api/v1/subcontractors/assignments/")).status_code in (401, 403)
    assert (await client.get("/api/v1/subcontractors/invoices/")).status_code in (401, 403)
