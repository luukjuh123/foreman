"""Tests for the material cost aggregation service and endpoint (Phase 7)."""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.material import Material
from app.models.project import Phase, Project, Task
from app.services.financials.material_cost import (
    DefaultStorePriceProvider,
    MaterialCostAggregator,
    StorePriceProvider,
)

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def session_factory():
    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def app_with_db(session_factory):
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield app


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "mc@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "MC", "password": "testpass123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_project_with_materials(
    client: AsyncClient, headers: dict, materials: list[dict]
) -> str:
    proj = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases",
            json={"name": "Ph"},
            headers=headers,
        )
    ).json()
    task = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
            json={"name": "T"},
            headers=headers,
        )
    ).json()
    # Materials must be inserted directly — there is no router for it yet.
    # We rely on session_factory fixture via app override.
    return proj["id"], task["id"]


async def _insert_materials(session_factory, task_id: str, rows: list[dict]) -> None:
    async with session_factory() as s:
        for r in rows:
            s.add(Material(task_id=uuid.UUID(task_id), **r))
        await s.commit()


# ---------------------------------------------------------------------------
# Service: MaterialCostAggregator + StorePriceProvider
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_default_provider_uses_stored_unit_price(session_factory) -> None:
    async with session_factory() as s:
        provider = DefaultStorePriceProvider()
        m = Material(
            task_id=uuid.uuid4(),
            name="screws",
            quantity=10.0,
            unit="piece",
            unit_price_cents=125,
        )
        s.add(m)
        await s.commit()
        await s.refresh(m)
        assert await provider.get_price_cents(m) == 125


@pytest.mark.asyncio
async def test_default_provider_returns_none_for_missing_price(session_factory) -> None:
    async with session_factory() as s:
        provider = DefaultStorePriceProvider()
        m = Material(
            task_id=uuid.uuid4(),
            name="unknown",
            quantity=1.0,
            unit_price_cents=0,
        )
        s.add(m)
        await s.commit()
        await s.refresh(m)
        assert await provider.get_price_cents(m) is None


@pytest.mark.asyncio
async def test_aggregator_sums_priced_materials(session_factory) -> None:
    project_id = uuid.uuid4()
    async with session_factory() as s:
        owner_id = uuid.uuid4()
        from app.models.user import User
        s.add(User(id=owner_id, email="u@x.io", name="u", hashed_password="x"))
        s.add(Project(id=project_id, owner_id=owner_id, name="P"))
        phase_id = uuid.uuid4()
        s.add(Phase(id=phase_id, project_id=project_id, name="Ph"))
        task_id = uuid.uuid4()
        s.add(Task(id=task_id, phase_id=phase_id, name="T"))
        s.add(Material(task_id=task_id, name="A", quantity=2.0, unit_price_cents=500))
        s.add(Material(task_id=task_id, name="B", quantity=3.0, unit_price_cents=100))
        await s.commit()

    async with session_factory() as s:
        agg = MaterialCostAggregator(DefaultStorePriceProvider())
        report = await agg.aggregate(project_id, s)

    # 2*500 + 3*100 = 1300
    assert report.total_cents == 1300
    assert len(report.items) == 2
    assert report.missing == []


@pytest.mark.asyncio
async def test_aggregator_collects_missing_prices(session_factory) -> None:
    project_id = uuid.uuid4()
    async with session_factory() as s:
        owner_id = uuid.uuid4()
        from app.models.user import User
        s.add(User(id=owner_id, email="u@x.io", name="u", hashed_password="x"))
        s.add(Project(id=project_id, owner_id=owner_id, name="P"))
        phase_id = uuid.uuid4()
        s.add(Phase(id=phase_id, project_id=project_id, name="Ph"))
        task_id = uuid.uuid4()
        s.add(Task(id=task_id, phase_id=phase_id, name="T"))
        s.add(Material(task_id=task_id, name="priced", quantity=4.0, unit_price_cents=250))
        s.add(Material(task_id=task_id, name="no-price", quantity=2.0, unit_price_cents=0))
        await s.commit()

    async with session_factory() as s:
        agg = MaterialCostAggregator(DefaultStorePriceProvider())
        report = await agg.aggregate(project_id, s)

    assert report.total_cents == 1000  # only the priced one
    assert len(report.items) == 1
    assert report.items[0].name == "priced"
    assert len(report.missing) == 1
    assert report.missing[0].name == "no-price"


@pytest.mark.asyncio
async def test_aggregator_uses_custom_provider(session_factory) -> None:
    project_id = uuid.uuid4()
    async with session_factory() as s:
        owner_id = uuid.uuid4()
        from app.models.user import User
        s.add(User(id=owner_id, email="u@x.io", name="u", hashed_password="x"))
        s.add(Project(id=project_id, owner_id=owner_id, name="P"))
        phase_id = uuid.uuid4()
        s.add(Phase(id=phase_id, project_id=project_id, name="Ph"))
        task_id = uuid.uuid4()
        s.add(Task(id=task_id, phase_id=phase_id, name="T"))
        s.add(Material(task_id=task_id, name="A", quantity=1.0, unit_price_cents=0))
        await s.commit()

    class FixedProvider(StorePriceProvider):
        async def get_price_cents(self, material):  # type: ignore[override]
            return 7777

    async with session_factory() as s:
        agg = MaterialCostAggregator(FixedProvider())
        report = await agg.aggregate(project_id, s)

    assert report.total_cents == 7777
    assert report.items[0].unit_price_cents == 7777


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_material_cost_endpoint_empty_project(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/material-cost", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_cents"] == 0
    assert body["items"] == []
    assert body["missing"] == []


@pytest.mark.asyncio
async def test_material_cost_endpoint_aggregates_prices(
    client: AsyncClient, session_factory
) -> None:
    headers = await _auth_headers(client)
    project_id, task_id = await _make_project_with_materials(client, headers, [])
    await _insert_materials(
        session_factory,
        task_id,
        [
            {"name": "M1", "quantity": 2.0, "unit_price_cents": 1500},
            {"name": "M2", "quantity": 5.0, "unit_price_cents": 200},
            {"name": "M3", "quantity": 1.0, "unit_price_cents": 0},
        ],
    )

    resp = await client.get(
        f"/api/v1/financials/projects/{project_id}/material-cost", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    # 2*1500 + 5*200 = 4000
    assert body["total_cents"] == 4000
    assert len(body["items"]) == 2
    assert len(body["missing"]) == 1
    assert body["missing"][0]["name"] == "M3"


@pytest.mark.asyncio
async def test_material_cost_endpoint_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    resp = await client.get(f"/api/v1/financials/projects/{proj['id']}/material-cost")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_material_cost_endpoint_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "x@example.com")
    h2 = await _auth_headers(client, "y@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=h1)).json()
    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/material-cost", headers=h2
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_material_cost_endpoint_project_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(
        f"/api/v1/financials/projects/{uuid.uuid4()}/material-cost", headers=headers
    )
    assert resp.status_code == 404
