"""Tests for accounting period closing — lock + year-end report.

Core invariants:
  - Creating a journal entry whose date falls inside a LOCKED period is
    rejected with 409.
  - Locking a period freezes the books. Entries outside the locked window
    are still allowed.
  - Year-end report bundles balans + V&W + kasstroom for the period.
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
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth(client: AsyncClient, email: str = "p@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "P User", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed(client: AsyncClient, headers: dict) -> dict[str, str]:
    resp = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    return {a["code"]: a["id"] for a in resp.json()}


async def _create_period(
    client: AsyncClient,
    headers: dict,
    name: str = "Y2025",
    start: str = "2025-01-01",
    end: str = "2025-12-31",
) -> dict:
    resp = await client.post(
        "/api/v1/financials/periods",
        json={"name": name, "start_date": start, "end_date": end},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# CRUD basics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/financials/periods",
        json={"name": "x", "start_date": "2025-01-01", "end_date": "2025-12-31"},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_and_list_period(client: AsyncClient) -> None:
    headers = await _auth(client)
    p = await _create_period(client, headers)
    assert p["name"] == "Y2025"
    assert p["is_locked"] is False
    assert p["locked_at"] is None
    listing = await client.get("/api/v1/financials/periods", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1


@pytest.mark.asyncio
async def test_create_period_validates_dates(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/financials/periods",
        json={"name": "Bad", "start_date": "2025-12-31", "end_date": "2025-01-01"},
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Locking & invariant: entries in locked periods rejected
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lock_period_sets_flag_and_timestamp(client: AsyncClient) -> None:
    headers = await _auth(client)
    p = await _create_period(client, headers)
    resp = await client.post(
        f"/api/v1/financials/periods/{p['id']}/lock", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_locked"] is True
    assert body["locked_at"] is not None


@pytest.mark.asyncio
async def test_double_lock_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    p = await _create_period(client, headers)
    r1 = await client.post(
        f"/api/v1/financials/periods/{p['id']}/lock", headers=headers
    )
    assert r1.status_code == 200
    r2 = await client.post(
        f"/api/v1/financials/periods/{p['id']}/lock", headers=headers
    )
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_entry_in_locked_period_rejected(client: AsyncClient) -> None:
    """The headline invariant."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    p = await _create_period(client, headers)
    await client.post(
        f"/api/v1/financials/periods/{p['id']}/lock", headers=headers
    )
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-06-15",
            "description": "Should be rejected",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 100},
                {"account_id": codes["8100"], "credit_cents": 100},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 409
    assert "locked" in resp.text.lower()


@pytest.mark.asyncio
async def test_entry_outside_locked_period_allowed(client: AsyncClient) -> None:
    """Locking Y2025 must not block entries in Y2026."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    p = await _create_period(client, headers)
    await client.post(
        f"/api/v1/financials/periods/{p['id']}/lock", headers=headers
    )
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2026-03-15",
            "description": "Future entry",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 100},
                {"account_id": codes["8100"], "credit_cents": 100},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_unlock_restores_writes(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    p = await _create_period(client, headers)
    await client.post(
        f"/api/v1/financials/periods/{p['id']}/lock", headers=headers
    )
    bad = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-06-15",
            "description": "x",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 100},
                {"account_id": codes["8100"], "credit_cents": 100},
            ],
        },
        headers=headers,
    )
    assert bad.status_code == 409
    unlock = await client.post(
        f"/api/v1/financials/periods/{p['id']}/unlock", headers=headers
    )
    assert unlock.status_code == 200
    assert unlock.json()["is_locked"] is False
    good = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-06-15",
            "description": "x",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 100},
                {"account_id": codes["8100"], "credit_cents": 100},
            ],
        },
        headers=headers,
    )
    assert good.status_code == 201


@pytest.mark.asyncio
async def test_locked_period_only_affects_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@x.com")
    h2 = await _auth(client, "b@x.com")
    codes2 = await _seed(client, h2)
    p1 = await _create_period(client, h1)
    await client.post(f"/api/v1/financials/periods/{p1['id']}/lock", headers=h1)
    # h2 can still post in 2025
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-06-15",
            "description": "ok",
            "lines": [
                {"account_id": codes2["1020"], "debit_cents": 100},
                {"account_id": codes2["8100"], "credit_cents": 100},
            ],
        },
        headers=h2,
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_cannot_lock_other_users_period(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@x.com")
    h2 = await _auth(client, "b@x.com")
    p1 = await _create_period(client, h1)
    resp = await client.post(
        f"/api/v1/financials/periods/{p1['id']}/lock", headers=h2
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Year-end report
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_year_end_report_bundles_three_reports(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    p = await _create_period(client, headers)
    # Some activity
    txs = [
        ("2025-01-01", "1020", "0510", 100_000),
        ("2025-02-01", "1020", "8100", 30_000),
        ("2025-02-15", "4100", "1020", 10_000),
        ("2025-03-01", "0120", "1020", 20_000),
    ]
    for d, dr, cr, amt in txs:
        await client.post(
            "/api/v1/financials/journal-entries",
            json={
                "entry_date": d,
                "description": "t",
                "lines": [
                    {"account_id": codes[dr], "debit_cents": amt},
                    {"account_id": codes[cr], "credit_cents": amt},
                ],
            },
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/financials/periods/{p['id']}/year-end-report", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "balance_sheet" in body
    assert "income_statement" in body
    assert "cash_flow_statement" in body
    assert body["balance_sheet"]["is_balanced"] is True
    assert body["income_statement"]["net_income_cents"] == 20_000  # 30k - 10k
    assert body["cash_flow_statement"]["reconciles"] is True
    assert body["period"]["name"] == "Y2025"


@pytest.mark.asyncio
async def test_year_end_report_works_after_locking(client: AsyncClient) -> None:
    headers = await _auth(client)
    await _seed(client, headers)
    p = await _create_period(client, headers)
    await client.post(
        f"/api/v1/financials/periods/{p['id']}/lock", headers=headers
    )
    resp = await client.get(
        f"/api/v1/financials/periods/{p['id']}/year-end-report", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["period"]["is_locked"] is True


@pytest.mark.asyncio
async def test_year_end_report_404_for_other_user(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@x.com")
    h2 = await _auth(client, "b@x.com")
    p1 = await _create_period(client, h1)
    resp = await client.get(
        f"/api/v1/financials/periods/{p1['id']}/year-end-report", headers=h2
    )
    assert resp.status_code == 404
