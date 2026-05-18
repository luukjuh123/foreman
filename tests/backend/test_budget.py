"""Tests for the Budget model and cost-tracking endpoints (Phase 7)."""

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
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "budget@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Budget User", "password": "testpass123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_project(client: AsyncClient, headers: dict, name: str = "P") -> str:
    resp = await client.post("/api/v1/projects/", json={"name": name}, headers=headers)
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Budget upsert + get
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_budget_creates_default_if_missing(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)

    resp = await client.get(
        f"/api/v1/financials/projects/{project_id}/budget", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["project_id"] == project_id
    assert body["total_budget_cents"] == 0
    assert body["contingency_pct"] == pytest.approx(10.0)
    assert body["items"] == []


@pytest.mark.asyncio
async def test_upsert_budget_creates_then_updates(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)

    create = await client.put(
        f"/api/v1/financials/projects/{project_id}/budget",
        json={"total_budget_cents": 1234567, "contingency_pct": 12.5},
        headers=headers,
    )
    assert create.status_code == 200
    assert create.json()["total_budget_cents"] == 1234567
    assert create.json()["contingency_pct"] == pytest.approx(12.5)

    update = await client.put(
        f"/api/v1/financials/projects/{project_id}/budget",
        json={"total_budget_cents": 9999999, "contingency_pct": 5.0},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["total_budget_cents"] == 9999999
    assert update.json()["contingency_pct"] == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_upsert_budget_rejects_negative_total(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)

    resp = await client.put(
        f"/api/v1/financials/projects/{project_id}/budget",
        json={"total_budget_cents": -1},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_budget_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)
    resp = await client.get(f"/api/v1/financials/projects/{project_id}/budget")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_budget_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "a@example.com")
    h2 = await _auth_headers(client, "b@example.com")
    project_id = await _make_project(client, h1)
    resp = await client.get(
        f"/api/v1/financials/projects/{project_id}/budget", headers=h2
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_budget_project_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(
        f"/api/v1/financials/projects/{uuid.uuid4()}/budget", headers=headers
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Budget items — CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_budget_item(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)

    resp = await client.post(
        f"/api/v1/financials/projects/{project_id}/budget/items",
        json={
            "category": "equipment",
            "name": "Steiger huur",
            "estimated_cents": 75000,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["category"] == "equipment"
    assert data["name"] == "Steiger huur"
    assert data["estimated_cents"] == 75000
    assert data["actual_cents"] == 0
    assert "id" in data


@pytest.mark.asyncio
async def test_create_budget_item_invalid_category_rejected(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)
    resp = await client.post(
        f"/api/v1/financials/projects/{project_id}/budget/items",
        json={"category": "not-a-category", "name": "x", "estimated_cents": 100},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_budget_item_negative_amount_rejected(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)
    resp = await client.post(
        f"/api/v1/financials/projects/{project_id}/budget/items",
        json={"category": "overhead", "name": "x", "estimated_cents": -5},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_budget_items_via_get_budget(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)

    for cat, amt in [("equipment", 50000), ("overhead", 25000), ("other", 1000)]:
        await client.post(
            f"/api/v1/financials/projects/{project_id}/budget/items",
            json={"category": cat, "name": cat, "estimated_cents": amt},
            headers=headers,
        )

    budget = (
        await client.get(
            f"/api/v1/financials/projects/{project_id}/budget", headers=headers
        )
    ).json()
    assert len(budget["items"]) == 3
    by_cat = {i["category"]: i for i in budget["items"]}
    assert by_cat["equipment"]["estimated_cents"] == 50000
    assert by_cat["overhead"]["estimated_cents"] == 25000


@pytest.mark.asyncio
async def test_update_budget_item(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)
    item = (
        await client.post(
            f"/api/v1/financials/projects/{project_id}/budget/items",
            json={"category": "equipment", "name": "kraan", "estimated_cents": 100000},
            headers=headers,
        )
    ).json()

    resp = await client.put(
        f"/api/v1/financials/projects/{project_id}/budget/items/{item['id']}",
        json={"actual_cents": 110000, "name": "kraan groot"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["actual_cents"] == 110000
    assert resp.json()["name"] == "kraan groot"
    assert resp.json()["estimated_cents"] == 100000


@pytest.mark.asyncio
async def test_delete_budget_item(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)
    item = (
        await client.post(
            f"/api/v1/financials/projects/{project_id}/budget/items",
            json={"category": "other", "name": "misc", "estimated_cents": 100},
            headers=headers,
        )
    ).json()

    resp = await client.delete(
        f"/api/v1/financials/projects/{project_id}/budget/items/{item['id']}",
        headers=headers,
    )
    assert resp.status_code == 204

    budget = (
        await client.get(
            f"/api/v1/financials/projects/{project_id}/budget", headers=headers
        )
    ).json()
    assert budget["items"] == []


@pytest.mark.asyncio
async def test_budget_item_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "own@example.com")
    h2 = await _auth_headers(client, "stranger@example.com")
    project_id = await _make_project(client, h1)
    resp = await client.post(
        f"/api/v1/financials/projects/{project_id}/budget/items",
        json={"category": "overhead", "name": "x", "estimated_cents": 100},
        headers=h2,
    )
    assert resp.status_code == 403
