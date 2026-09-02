"""Tests for client approval workflows — change orders and phase sign-offs.

TDD: tests written first, drive the implementation.
"""

from __future__ import annotations

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
    app.state.test_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        ac._session_factory = app_with_db.state.test_session_factory
        yield ac


async def _auth(client: AsyncClient, email: str = "contractor@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Contractor", "password": "supersecret"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _make_project(client: AsyncClient, headers: dict, name: str = "Badkamer Renovatie") -> dict:
    resp = await client.post("/api/v1/projects/", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _make_phase(client: AsyncClient, headers: dict, project_id: str, name: str = "Fase 1") -> dict:
    resp = await client.post(
        f"/api/v1/projects/{project_id}/phases/",
        json={"name": name, "order_index": 0},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _get_share_token(client: AsyncClient, headers: dict, project_id: str) -> str:
    resp = await client.post(f"/api/v1/projects/{project_id}/share-token", headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["token"]


# ---------------------------------------------------------------------------
# Change Order — create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_change_order(client: AsyncClient) -> None:
    """Contractor can create a change order for a project."""
    headers = await _auth(client)
    project = await _make_project(client, headers)
    project_id = project["id"]

    resp = await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={
            "title": "Extra dakisolatie",
            "description": "Klant wil extra isolatie",
            "cost_impact_cents": 150000,
            "schedule_impact_days": 2,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["title"] == "Extra dakisolatie"
    assert data["cost_impact_cents"] == 150000
    assert data["schedule_impact_days"] == 2
    assert data["status"] == "pending_approval"
    assert data["project_id"] == project_id
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_change_order_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        f"/api/v1/approvals/projects/{uuid.uuid4()}/change-orders",
        json={"title": "X", "description": "Y", "cost_impact_cents": 0, "schedule_impact_days": 0},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_change_order_project_not_found(client: AsyncClient) -> None:
    headers = await _auth(client, email="c2@example.com")
    resp = await client.post(
        f"/api/v1/approvals/projects/{uuid.uuid4()}/change-orders",
        json={"title": "X", "description": "Y", "cost_impact_cents": 0, "schedule_impact_days": 0},
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Change Order — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_change_orders_empty(client: AsyncClient) -> None:
    headers = await _auth(client, email="co_list@example.com")
    project = await _make_project(client, headers)

    resp = await client.get(
        f"/api/v1/approvals/projects/{project['id']}/change-orders",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_change_orders_returns_created(client: AsyncClient) -> None:
    headers = await _auth(client, email="co_list2@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]

    await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={"title": "Meer stucwerk", "description": "Extra kamer", "cost_impact_cents": 50000, "schedule_impact_days": 1},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/approvals/projects/{project_id}/change-orders", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Meer stucwerk"


# ---------------------------------------------------------------------------
# Change Order — client approve / reject via share token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_client_approve_change_order(client: AsyncClient) -> None:
    """Client approves a change order via share token."""
    headers = await _auth(client, email="co_approve@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]

    co_resp = await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={"title": "Daktoegang", "description": "Nieuw luik", "cost_impact_cents": 80000, "schedule_impact_days": 1},
        headers=headers,
    )
    co_id = co_resp.json()["id"]

    token = await _get_share_token(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/approvals/portal/{token}/change-orders/{co_id}/approve",
        json={"signature": "J. de Vries"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "approved"
    assert data["decided_at"] is not None


@pytest.mark.asyncio
async def test_client_reject_change_order(client: AsyncClient) -> None:
    """Client rejects a change order via share token."""
    headers = await _auth(client, email="co_reject@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]

    co_resp = await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={"title": "Extra vloerverwarming", "description": "Optie", "cost_impact_cents": 200000, "schedule_impact_days": 3},
        headers=headers,
    )
    co_id = co_resp.json()["id"]
    token = await _get_share_token(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/approvals/portal/{token}/change-orders/{co_id}/reject",
        json={"signature": "J. de Vries", "reason": "Te duur"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "rejected"
    assert data["decided_at"] is not None


@pytest.mark.asyncio
async def test_client_cannot_approve_with_invalid_token(client: AsyncClient) -> None:
    headers = await _auth(client, email="co_badtoken@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]
    co_resp = await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={"title": "X", "description": "Y", "cost_impact_cents": 0, "schedule_impact_days": 0},
        headers=headers,
    )
    co_id = co_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/approvals/portal/invalid-token/change-orders/{co_id}/approve",
        json={"signature": "Hacker"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cannot_approve_already_decided_change_order(client: AsyncClient) -> None:
    """Attempting to approve an already-approved change order returns 409."""
    headers = await _auth(client, email="co_double@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]

    co_resp = await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={"title": "Enkelvoudig", "description": "Test", "cost_impact_cents": 1000, "schedule_impact_days": 0},
        headers=headers,
    )
    co_id = co_resp.json()["id"]
    token = await _get_share_token(client, headers, project_id)

    await client.post(
        f"/api/v1/approvals/portal/{token}/change-orders/{co_id}/approve",
        json={"signature": "Eerste"},
    )
    resp = await client.post(
        f"/api/v1/approvals/portal/{token}/change-orders/{co_id}/approve",
        json={"signature": "Tweede"},
    )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Phase sign-off — list and sign
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_phase_signoffs_empty(client: AsyncClient) -> None:
    headers = await _auth(client, email="ps_list@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]

    resp = await client.get(
        f"/api/v1/approvals/projects/{project_id}/phase-signoffs",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_request_phase_signoff(client: AsyncClient) -> None:
    """Contractor requests client sign-off on a phase."""
    headers = await _auth(client, email="ps_req@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]
    phase = await _make_phase(client, headers, project_id)
    phase_id = phase["id"]

    resp = await client.post(
        f"/api/v1/approvals/projects/{project_id}/phases/{phase_id}/request-signoff",
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["phase_id"] == phase_id
    assert data["project_id"] == project_id
    assert data["status"] == "pending"
    assert "id" in data


@pytest.mark.asyncio
async def test_client_signs_off_phase(client: AsyncClient) -> None:
    """Client approves a phase via share token."""
    headers = await _auth(client, email="ps_approve@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]
    phase = await _make_phase(client, headers, project_id)
    phase_id = phase["id"]

    await client.post(
        f"/api/v1/approvals/projects/{project_id}/phases/{phase_id}/request-signoff",
        headers=headers,
    )
    token = await _get_share_token(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/approvals/portal/{token}/phases/{phase_id}/signoff",
        json={"notes": "Goed werk!", "decision": "approved"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "approved"
    assert data["signed_at"] is not None
    assert data["notes"] == "Goed werk!"


@pytest.mark.asyncio
async def test_client_rejects_phase_signoff(client: AsyncClient) -> None:
    headers = await _auth(client, email="ps_reject@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]
    phase = await _make_phase(client, headers, project_id)
    phase_id = phase["id"]

    await client.post(
        f"/api/v1/approvals/projects/{project_id}/phases/{phase_id}/request-signoff",
        headers=headers,
    )
    token = await _get_share_token(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/approvals/portal/{token}/phases/{phase_id}/signoff",
        json={"notes": "Schilderwerk niet af", "decision": "rejected"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_phase_signoff_no_pending_request_returns_404(client: AsyncClient) -> None:
    """Signing off a phase with no pending request returns 404."""
    headers = await _auth(client, email="ps_noreq@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]
    phase = await _make_phase(client, headers, project_id)
    phase_id = phase["id"]
    token = await _get_share_token(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/approvals/portal/{token}/phases/{phase_id}/signoff",
        json={"notes": "", "decision": "approved"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Approval status dashboard (contractor view)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_approval_dashboard(client: AsyncClient) -> None:
    """Contractor can view approval status dashboard for a project."""
    headers = await _auth(client, email="dash@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]
    phase = await _make_phase(client, headers, project_id)
    phase_id = phase["id"]

    # Create a pending change order
    await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={"title": "Meerwerk A", "description": "X", "cost_impact_cents": 10000, "schedule_impact_days": 0},
        headers=headers,
    )

    # Request phase sign-off
    await client.post(
        f"/api/v1/approvals/projects/{project_id}/phases/{phase_id}/request-signoff",
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/approvals/projects/{project_id}/dashboard",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "change_orders" in data
    assert "phase_signoffs" in data
    assert data["change_orders"]["pending"] == 1
    assert data["change_orders"]["approved"] == 0
    assert data["change_orders"]["rejected"] == 0
    assert data["phase_signoffs"]["pending"] == 1


@pytest.mark.asyncio
async def test_approval_dashboard_after_decisions(client: AsyncClient) -> None:
    """Dashboard reflects approved and rejected counts correctly."""
    headers = await _auth(client, email="dash2@example.com")
    project = await _make_project(client, headers)
    project_id = project["id"]

    # Create two change orders, approve one, reject one
    co1 = (await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={"title": "CO1", "description": "X", "cost_impact_cents": 1000, "schedule_impact_days": 0},
        headers=headers,
    )).json()["id"]
    co2 = (await client.post(
        f"/api/v1/approvals/projects/{project_id}/change-orders",
        json={"title": "CO2", "description": "Y", "cost_impact_cents": 2000, "schedule_impact_days": 0},
        headers=headers,
    )).json()["id"]

    token = await _get_share_token(client, headers, project_id)
    await client.post(f"/api/v1/approvals/portal/{token}/change-orders/{co1}/approve", json={"signature": "A"})
    await client.post(f"/api/v1/approvals/portal/{token}/change-orders/{co2}/reject", json={"signature": "A", "reason": "Nee"})

    resp = await client.get(f"/api/v1/approvals/projects/{project_id}/dashboard", headers=headers)
    data = resp.json()
    assert data["change_orders"]["approved"] == 1
    assert data["change_orders"]["rejected"] == 1
    assert data["change_orders"]["pending"] == 0
