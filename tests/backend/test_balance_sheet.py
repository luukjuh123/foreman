"""Tests for balance sheet (balans) endpoint.

Core invariant: assets ALWAYS equals liabilities + equity + retained earnings.
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


async def _auth(client: AsyncClient, email: str = "bs@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "BS User", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed(client: AsyncClient, headers: dict) -> dict[str, str]:
    resp = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    return {a["code"]: a["id"] for a in resp.json()}


async def _entry(
    client: AsyncClient, headers: dict, entry_date: str, lines: list[dict]
) -> dict:
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={"entry_date": entry_date, "description": "t", "lines": lines},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Empty / minimal cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_balance_sheet_empty(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(
        "/api/v1/financials/reports/balance-sheet?as_of=2025-12-31", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["as_of"] == "2025-12-31"
    assert body["assets"]["total_cents"] == 0
    assert body["liabilities"]["total_cents"] == 0
    assert body["equity"]["total_cents"] == 0
    assert body["is_balanced"] is True


@pytest.mark.asyncio
async def test_requires_auth(client: AsyncClient) -> None:
    resp = await client.get(
        "/api/v1/financials/reports/balance-sheet?as_of=2025-12-31"
    )
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Capital injection — equity = cash. Pure passive/active mirror.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_capital_injection_balances(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    # Owner deposits €50,000 capital: dr Bank, cr Gestort kapitaal
    await _entry(
        client,
        headers,
        "2025-01-01",
        [
            {"account_id": codes["1020"], "debit_cents": 5_000_000},
            {"account_id": codes["0510"], "credit_cents": 5_000_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/balance-sheet?as_of=2025-01-31",
        headers=headers,
    )
    body = resp.json()
    assert body["assets"]["total_cents"] == 5_000_000
    assert body["equity"]["total_cents"] == 5_000_000
    assert body["liabilities"]["total_cents"] == 0
    assert body["retained_earnings_cents"] == 0
    assert body["is_balanced"] is True
    assert body["total_liabilities_and_equity_cents"] == 5_000_000


# ---------------------------------------------------------------------------
# With revenue/expense — retained earnings closes the loop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revenue_flows_to_retained_earnings(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    # Capital
    await _entry(
        client,
        headers,
        "2025-01-01",
        [
            {"account_id": codes["1020"], "debit_cents": 100_000},
            {"account_id": codes["0510"], "credit_cents": 100_000},
        ],
    )
    # Sale: dr Bank 30000, cr Revenue 30000
    await _entry(
        client,
        headers,
        "2025-02-01",
        [
            {"account_id": codes["1020"], "debit_cents": 30_000},
            {"account_id": codes["8100"], "credit_cents": 30_000},
        ],
    )
    # Expense: dr Loonkosten 10000, cr Bank 10000
    await _entry(
        client,
        headers,
        "2025-02-15",
        [
            {"account_id": codes["4100"], "debit_cents": 10_000},
            {"account_id": codes["1020"], "credit_cents": 10_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/balance-sheet?as_of=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    assert body["assets"]["total_cents"] == 120_000  # 100k + 30k - 10k
    assert body["equity"]["total_cents"] == 100_000
    assert body["retained_earnings_cents"] == 20_000  # rev 30k - exp 10k
    assert body["is_balanced"] is True


# ---------------------------------------------------------------------------
# Invariant: balance sheet ALWAYS balances no matter what
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invariant_balance_sheet_always_balances(client: AsyncClient) -> None:
    """No matter how many entries we throw at it, assets == L + E + RE."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    transactions = [
        ("2025-01-01", "1020", "0510", 200_000),  # capital
        ("2025-01-15", "0120", "1020", 50_000),  # buy machine
        ("2025-02-01", "1020", "1720", 80_000),  # bank loan
        ("2025-02-10", "1020", "8100", 40_000),  # sale
        ("2025-02-20", "4100", "1020", 12_000),  # wages
        ("2025-03-01", "1300", "8100", 25_000),  # receivable sale
        ("2025-03-15", "1020", "1300", 15_000),  # collect AR
        ("2025-04-01", "4200", "1400", 5_000),  # housing payable
    ]
    for d, dr_code, cr_code, amt in transactions:
        await _entry(
            client,
            headers,
            d,
            [
                {"account_id": codes[dr_code], "debit_cents": amt},
                {"account_id": codes[cr_code], "credit_cents": amt},
            ],
        )

    # Check multiple cut-off dates
    for as_of in ["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30", "2025-12-31"]:
        resp = await client.get(
            f"/api/v1/financials/reports/balance-sheet?as_of={as_of}",
            headers=headers,
        )
        body = resp.json()
        assert body["is_balanced"], (
            f"unbalanced at {as_of}: "
            f"assets={body['assets']['total_cents']} "
            f"L+E+RE={body['total_liabilities_and_equity_cents']}"
        )


# ---------------------------------------------------------------------------
# Tree structure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_balance_sheet_returns_account_tree(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    await _entry(
        client,
        headers,
        "2025-01-01",
        [
            {"account_id": codes["1020"], "debit_cents": 100_000},
            {"account_id": codes["0510"], "credit_cents": 100_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/balance-sheet?as_of=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    asset_codes = {a["code"] for a in body["assets"]["accounts"]}
    # Roots include 1000 (Liquide middelen) which itself has a child 1020
    assert "1000" in asset_codes
    liquide = next(a for a in body["assets"]["accounts"] if a["code"] == "1000")
    child_codes = {c["code"] for c in liquide["children"]}
    assert "1020" in child_codes


# ---------------------------------------------------------------------------
# Cut-off works: entries after as_of are excluded
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_balance_sheet_excludes_entries_after_as_of(
    client: AsyncClient,
) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    await _entry(
        client,
        headers,
        "2025-01-01",
        [
            {"account_id": codes["1020"], "debit_cents": 100_000},
            {"account_id": codes["0510"], "credit_cents": 100_000},
        ],
    )
    await _entry(
        client,
        headers,
        "2025-06-01",
        [
            {"account_id": codes["1020"], "debit_cents": 50_000},
            {"account_id": codes["0510"], "credit_cents": 50_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/balance-sheet?as_of=2025-03-31",
        headers=headers,
    )
    body = resp.json()
    assert body["assets"]["total_cents"] == 100_000
    assert body["equity"]["total_cents"] == 100_000


# ---------------------------------------------------------------------------
# Scope: per-owner
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_balance_sheet_scoped_per_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner1@x.com")
    h2 = await _auth(client, "owner2@x.com")
    codes1 = await _seed(client, h1)
    await _seed(client, h2)
    await _entry(
        client,
        h1,
        "2025-01-01",
        [
            {"account_id": codes1["1020"], "debit_cents": 12345},
            {"account_id": codes1["0510"], "credit_cents": 12345},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/balance-sheet?as_of=2025-12-31", headers=h2
    )
    body = resp.json()
    assert body["assets"]["total_cents"] == 0
    assert body["is_balanced"] is True
