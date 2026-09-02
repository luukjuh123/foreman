"""Tests for GET /api/v1/analytics/profitability endpoint."""

import uuid
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.invoice import Customer, Invoice
from app.models.material import Budget, BudgetItem
from app.models.project import Phase, Project, Task
from app.models.user import User

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


async def _auth_headers(client: AsyncClient, email: str = "test@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test User", "password": "testpass123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


_invoice_counter: int = 0


async def _seed_project_with_data(
    session_factory,
    *,
    owner_id: uuid.UUID,
    project_name: str = "Test Project",
    invoice_subtotal_cents: int = 100_000,
    labor_cost_cents: int = 30_000,
    material_cost_cents: int = 20_000,
    issue_date: date = date(2024, 6, 15),
) -> uuid.UUID:
    """Seed a project with an invoice, labor tasks, and material budget items."""
    global _invoice_counter
    _invoice_counter += 1

    project_id = uuid.uuid4()
    customer_id = uuid.uuid4()

    async with session_factory() as s:
        # Customer for invoice
        s.add(
            Customer(
                id=customer_id,
                owner_id=owner_id,
                name="Test Klant BV",
            )
        )
        # Project
        s.add(
            Project(
                id=project_id,
                owner_id=owner_id,
                name=project_name,
                status="active",
            )
        )
        # Invoice linked to project — unique number per owner
        s.add(
            Invoice(
                owner_id=owner_id,
                customer_id=customer_id,
                project_id=project_id,
                invoice_number=f"INV-{_invoice_counter:04d}",
                issue_date=issue_date,
                due_date=date(2024, 7, 15),
                status="paid",
                subtotal_cents=invoice_subtotal_cents,
                vat_total_cents=0,
                total_cents=invoice_subtotal_cents,
            )
        )
        # Phase + task with labor cost
        phase_id = uuid.uuid4()
        s.add(Phase(id=phase_id, project_id=project_id, name="Fase 1"))
        s.add(
            Task(
                phase_id=phase_id,
                name="Arbeid",
                estimated_hours=10.0,
                labor_cost_cents=labor_cost_cents,
            )
        )
        # Budget with material cost item
        budget_id = uuid.uuid4()
        s.add(Budget(id=budget_id, project_id=project_id, total_budget_cents=0))
        s.add(
            BudgetItem(
                budget_id=budget_id,
                category="materials",
                name="Bouwmaterialen",
                estimated_cents=material_cost_cents,
                actual_cents=material_cost_cents,
            )
        )
        await s.commit()

    return project_id


# ---------------------------------------------------------------------------
# Service-level tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_profitability_service_basic(session_factory) -> None:
    """Service computes margin = revenue - labor - materials."""
    from app.services.analytics.profitability import ProfitabilityService

    owner_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(User(id=owner_id, email=f"{owner_id}@x.io", name="u", hashed_password="x"))
        await s.commit()

    await _seed_project_with_data(
        session_factory,
        owner_id=owner_id,
        invoice_subtotal_cents=100_000,
        labor_cost_cents=30_000,
        material_cost_cents=20_000,
    )

    async with session_factory() as s:
        svc = ProfitabilityService()
        results = await svc.compute(owner_id=owner_id, db=s)

    assert len(results) == 1
    r = results[0]
    assert r.revenue_cents == 100_000
    assert r.labor_cost_cents == 30_000
    assert r.material_cost_cents == 20_000
    assert r.margin_cents == 50_000  # 100k - 30k - 20k
    assert r.margin_percentage == pytest.approx(50.0)


@pytest.mark.asyncio
async def test_profitability_service_zero_revenue_margin(session_factory) -> None:
    """Zero revenue → margin is negative of costs, percentage is 0."""
    from app.services.analytics.profitability import ProfitabilityService

    owner_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(User(id=owner_id, email=f"{owner_id}@x.io", name="u", hashed_password="x"))
        await s.commit()

    await _seed_project_with_data(
        session_factory,
        owner_id=owner_id,
        invoice_subtotal_cents=0,
        labor_cost_cents=10_000,
        material_cost_cents=5_000,
    )

    async with session_factory() as s:
        svc = ProfitabilityService()
        results = await svc.compute(owner_id=owner_id, db=s)

    assert len(results) == 1
    r = results[0]
    assert r.revenue_cents == 0
    assert r.margin_cents == -15_000
    assert r.margin_percentage == 0.0


@pytest.mark.asyncio
async def test_profitability_service_date_filter(session_factory) -> None:
    """start_date/end_date filters invoices by issue_date."""
    from app.services.analytics.profitability import ProfitabilityService

    owner_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(User(id=owner_id, email=f"{owner_id}@x.io", name="u", hashed_password="x"))
        await s.commit()

    # Invoice in range
    await _seed_project_with_data(
        session_factory,
        owner_id=owner_id,
        project_name="In Range",
        invoice_subtotal_cents=50_000,
        labor_cost_cents=0,
        material_cost_cents=0,
        issue_date=date(2024, 3, 15),
    )
    # Invoice outside range
    await _seed_project_with_data(
        session_factory,
        owner_id=owner_id,
        project_name="Out of Range",
        invoice_subtotal_cents=99_000,
        labor_cost_cents=0,
        material_cost_cents=0,
        issue_date=date(2024, 7, 1),
    )

    async with session_factory() as s:
        svc = ProfitabilityService()
        results = await svc.compute(
            owner_id=owner_id,
            db=s,
            start_date=date(2024, 1, 1),
            end_date=date(2024, 6, 30),
        )

    assert len(results) == 2
    in_range = next(r for r in results if r.project_name == "In Range")
    out_range = next(r for r in results if r.project_name == "Out of Range")
    # In range gets its invoice revenue
    assert in_range.revenue_cents == 50_000
    # Out-of-range project still appears but with 0 revenue (invoice excluded)
    assert out_range.revenue_cents == 0


@pytest.mark.asyncio
async def test_profitability_service_multiple_invoices(session_factory) -> None:
    """Multiple invoices for same project are summed."""
    from app.services.analytics.profitability import ProfitabilityService

    owner_id = uuid.uuid4()
    project_id = uuid.uuid4()
    customer_id = uuid.uuid4()

    async with session_factory() as s:
        s.add(User(id=owner_id, email=f"{owner_id}@x.io", name="u", hashed_password="x"))
        s.add(Customer(id=customer_id, owner_id=owner_id, name="Klant"))
        s.add(Project(id=project_id, owner_id=owner_id, name="Multi-Invoice"))
        for i, amount in enumerate([40_000, 60_000]):
            s.add(
                Invoice(
                    owner_id=owner_id,
                    customer_id=customer_id,
                    project_id=project_id,
                    invoice_number=f"INV-{i:03d}",
                    issue_date=date(2024, i + 1, 1),
                    due_date=date(2024, i + 2, 1),
                    status="paid",
                    subtotal_cents=amount,
                    vat_total_cents=0,
                    total_cents=amount,
                )
            )
        phase_id = uuid.uuid4()
        s.add(Phase(id=phase_id, project_id=project_id, name="Ph"))
        s.add(Task(phase_id=phase_id, name="T", labor_cost_cents=20_000))
        budget_id = uuid.uuid4()
        s.add(Budget(id=budget_id, project_id=project_id, total_budget_cents=0))
        s.add(BudgetItem(budget_id=budget_id, category="materials", name="M", actual_cents=10_000))
        await s.commit()

    async with session_factory() as s:
        svc = ProfitabilityService()
        results = await svc.compute(owner_id=owner_id, db=s)

    assert len(results) == 1
    r = results[0]
    assert r.revenue_cents == 100_000  # 40k + 60k
    assert r.labor_cost_cents == 20_000
    assert r.material_cost_cents == 10_000
    assert r.margin_cents == 70_000


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_profitability_endpoint_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/analytics/profitability")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_profitability_endpoint_returns_list(
    client: AsyncClient, session_factory
) -> None:
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/analytics/profitability", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_profitability_endpoint_returns_correct_fields(
    client: AsyncClient, session_factory
) -> None:
    """Response items contain all required fields."""
    headers = await _auth_headers(client, "fields@example.com")
    # Create a project via API
    proj = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    resp = await client.get("/api/v1/analytics/profitability", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    # Should have at least one project (just created)
    assert len(body) >= 1
    item = next(i for i in body if i["project_id"] == proj["id"])
    required_fields = {
        "project_id",
        "project_name",
        "revenue_cents",
        "labor_cost_cents",
        "material_cost_cents",
        "margin_cents",
        "margin_percentage",
    }
    assert required_fields.issubset(set(item.keys()))


@pytest.mark.asyncio
async def test_profitability_endpoint_date_range_filter(
    client: AsyncClient, session_factory
) -> None:
    """start_date and end_date query params are accepted."""
    headers = await _auth_headers(client, "daterange@example.com")
    resp = await client.get(
        "/api/v1/analytics/profitability?start_date=2024-01-01&end_date=2024-12-31",
        headers=headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_profitability_endpoint_invalid_date_rejected(
    client: AsyncClient,
) -> None:
    headers = await _auth_headers(client, "baddate@example.com")
    resp = await client.get(
        "/api/v1/analytics/profitability?start_date=not-a-date",
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_profitability_endpoint_other_user_sees_own_data(
    client: AsyncClient, session_factory
) -> None:
    """Each user only sees their own projects."""
    h1 = await _auth_headers(client, "user1@example.com")
    h2 = await _auth_headers(client, "user2@example.com")

    await client.post("/api/v1/projects/", json={"name": "User1 Project"}, headers=h1)

    resp1 = await client.get("/api/v1/analytics/profitability", headers=h1)
    resp2 = await client.get("/api/v1/analytics/profitability", headers=h2)

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    # user2 must not see user1's project
    names2 = [i["project_name"] for i in resp2.json()]
    assert "User1 Project" not in names2


@pytest.mark.asyncio
async def test_profitability_endpoint_excludes_deleted_projects(
    client: AsyncClient, session_factory
) -> None:
    """Soft-deleted projects are excluded."""
    headers = await _auth_headers(client, "deleted@example.com")
    proj = (
        await client.post("/api/v1/projects/", json={"name": "To Delete"}, headers=headers)
    ).json()
    await client.delete(f"/api/v1/projects/{proj['id']}", headers=headers)

    resp = await client.get("/api/v1/analytics/profitability", headers=headers)
    assert resp.status_code == 200
    names = [i["project_name"] for i in resp.json()]
    assert "To Delete" not in names
