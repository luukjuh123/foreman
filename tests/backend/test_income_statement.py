"""Tests for income statement (winst- en verliesrekening) endpoint."""

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


async def _auth(client: AsyncClient, email: str = "is@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "IS User", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed(client: AsyncClient, headers: dict) -> dict[str, str]:
    resp = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    return {a["code"]: a["id"] for a in resp.json()}


async def _entry(
    client: AsyncClient, headers: dict, entry_date: str, lines: list[dict]
) -> None:
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={"entry_date": entry_date, "description": "t", "lines": lines},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_requires_auth(client: AsyncClient) -> None:
    resp = await client.get(
        "/api/v1/financials/reports/income-statement?start_date=2025-01-01&end_date=2025-12-31"
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_empty_income_statement(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(
        "/api/v1/financials/reports/income-statement?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["start_date"] == "2025-01-01"
    assert body["end_date"] == "2025-12-31"
    assert body["revenue"]["total_cents"] == 0
    assert body["expenses"]["total_cents"] == 0
    assert body["net_income_cents"] == 0
    assert body["is_profit"] is False


@pytest.mark.asyncio
async def test_revenue_minus_expenses(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    await _entry(
        client,
        headers,
        "2025-03-15",
        [
            {"account_id": codes["1020"], "debit_cents": 100_000},
            {"account_id": codes["8100"], "credit_cents": 100_000},
        ],
    )
    await _entry(
        client,
        headers,
        "2025-04-01",
        [
            {"account_id": codes["4100"], "debit_cents": 30_000},
            {"account_id": codes["1020"], "credit_cents": 30_000},
        ],
    )
    await _entry(
        client,
        headers,
        "2025-04-15",
        [
            {"account_id": codes["4200"], "debit_cents": 12_000},
            {"account_id": codes["1020"], "credit_cents": 12_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/income-statement?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    assert body["revenue"]["total_cents"] == 100_000
    assert body["expenses"]["total_cents"] == 42_000
    assert body["net_income_cents"] == 58_000
    assert body["is_profit"] is True


@pytest.mark.asyncio
async def test_loss_is_profit_false(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    await _entry(
        client,
        headers,
        "2025-03-15",
        [
            {"account_id": codes["1020"], "debit_cents": 5_000},
            {"account_id": codes["8100"], "credit_cents": 5_000},
        ],
    )
    await _entry(
        client,
        headers,
        "2025-04-15",
        [
            {"account_id": codes["4100"], "debit_cents": 20_000},
            {"account_id": codes["1020"], "credit_cents": 20_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/income-statement?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    assert body["net_income_cents"] == -15_000
    assert body["is_profit"] is False


@pytest.mark.asyncio
async def test_period_filter_excludes_outside_entries(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    # Inside period
    await _entry(
        client,
        headers,
        "2025-03-15",
        [
            {"account_id": codes["1020"], "debit_cents": 10_000},
            {"account_id": codes["8100"], "credit_cents": 10_000},
        ],
    )
    # Before
    await _entry(
        client,
        headers,
        "2024-12-31",
        [
            {"account_id": codes["1020"], "debit_cents": 99_999},
            {"account_id": codes["8100"], "credit_cents": 99_999},
        ],
    )
    # After
    await _entry(
        client,
        headers,
        "2026-01-01",
        [
            {"account_id": codes["1020"], "debit_cents": 88_888},
            {"account_id": codes["8100"], "credit_cents": 88_888},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/income-statement?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    assert body["revenue"]["total_cents"] == 10_000


@pytest.mark.asyncio
async def test_invalid_date_range(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(
        "/api/v1/financials/reports/income-statement?start_date=2025-12-31&end_date=2025-01-01",
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_returns_account_breakdown(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    # Two different revenue accounts
    await _entry(
        client,
        headers,
        "2025-03-15",
        [
            {"account_id": codes["1020"], "debit_cents": 10_000},
            {"account_id": codes["8100"], "credit_cents": 10_000},
        ],
    )
    await _entry(
        client,
        headers,
        "2025-03-16",
        [
            {"account_id": codes["1020"], "debit_cents": 5_000},
            {"account_id": codes["8200"], "credit_cents": 5_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/income-statement?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    # 8000 is the parent of 8100 & 8200, so it appears as root with rolled-up total
    omzet_parent = next(
        a for a in body["revenue"]["accounts"] if a["code"] == "8000"
    )
    assert omzet_parent["balance_cents"] == 15_000
    child_codes = {c["code"] for c in omzet_parent["children"]}
    assert {"8100", "8200"}.issubset(child_codes)


@pytest.mark.asyncio
async def test_owner_scoped(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@x.com")
    h2 = await _auth(client, "b@x.com")
    codes1 = await _seed(client, h1)
    await _seed(client, h2)
    await _entry(
        client,
        h1,
        "2025-03-15",
        [
            {"account_id": codes1["1020"], "debit_cents": 10_000},
            {"account_id": codes1["8100"], "credit_cents": 10_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/income-statement?start_date=2025-01-01&end_date=2025-12-31",
        headers=h2,
    )
    assert resp.json()["revenue"]["total_cents"] == 0
