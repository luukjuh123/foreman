"""Tests for cash flow statement (kasstroomoverzicht), indirect method."""

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


async def _auth(client: AsyncClient, email: str = "cf@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "CF User", "password": "secret123"},
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
        "/api/v1/financials/reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31"
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_empty_cash_flow(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(
        "/api/v1/financials/reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["net_income_cents"] == 0
    assert body["operating_activities"]["total_cents"] == 0
    assert body["investing_activities"]["total_cents"] == 0
    assert body["financing_activities"]["total_cents"] == 0
    assert body["net_change_in_cash_cents"] == 0
    assert body["reconciles"] is True


@pytest.mark.asyncio
async def test_invalid_range(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(
        "/api/v1/financials/reports/cash-flow?start_date=2025-12-31&end_date=2025-01-01",
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_financing_capital_injection(client: AsyncClient) -> None:
    """€100,000 capital → financing inflow, no operating/investing flow."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    await _entry(
        client,
        headers,
        "2025-01-15",
        [
            {"account_id": codes["1020"], "debit_cents": 10_000_000},
            {"account_id": codes["0510"], "credit_cents": 10_000_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    assert body["financing_activities"]["total_cents"] == 10_000_000
    assert body["operating_activities"]["total_cents"] == 0
    assert body["investing_activities"]["total_cents"] == 0
    assert body["net_change_in_cash_cents"] == 10_000_000
    assert body["reconciles"] is True


@pytest.mark.asyncio
async def test_investing_buy_machine(client: AsyncClient) -> None:
    """Capital + buy machine: financing in, investing out."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    await _entry(
        client,
        headers,
        "2025-01-01",
        [
            {"account_id": codes["1020"], "debit_cents": 1_000_000},
            {"account_id": codes["0510"], "credit_cents": 1_000_000},
        ],
    )
    await _entry(
        client,
        headers,
        "2025-02-01",
        [
            {"account_id": codes["0120"], "debit_cents": 400_000},
            {"account_id": codes["1020"], "credit_cents": 400_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    assert body["financing_activities"]["total_cents"] == 1_000_000
    assert body["investing_activities"]["total_cents"] == -400_000
    assert body["net_change_in_cash_cents"] == 600_000
    assert body["reconciles"] is True


@pytest.mark.asyncio
async def test_operating_revenue_and_ar(client: AsyncClient) -> None:
    """Cash sale + credit sale + AR collection. OCF includes AR adjustment."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    # Capital so we have starting cash
    await _entry(
        client,
        headers,
        "2025-01-01",
        [
            {"account_id": codes["1020"], "debit_cents": 100_000},
            {"account_id": codes["0510"], "credit_cents": 100_000},
        ],
    )
    # Cash sale 50k
    await _entry(
        client,
        headers,
        "2025-02-01",
        [
            {"account_id": codes["1020"], "debit_cents": 50_000},
            {"account_id": codes["8100"], "credit_cents": 50_000},
        ],
    )
    # Credit sale 30k → AR up
    await _entry(
        client,
        headers,
        "2025-02-15",
        [
            {"account_id": codes["1300"], "debit_cents": 30_000},
            {"account_id": codes["8100"], "credit_cents": 30_000},
        ],
    )
    # Wage expense 20k cash
    await _entry(
        client,
        headers,
        "2025-03-01",
        [
            {"account_id": codes["4100"], "debit_cents": 20_000},
            {"account_id": codes["1020"], "credit_cents": 20_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    # Net income = revenue 80k - expense 20k = 60k
    assert body["net_income_cents"] == 60_000
    # AR increased by 30k → reduces OCF by 30k
    # OCF = 60k - 30k = 30k
    assert body["operating_activities"]["total_cents"] == 30_000
    assert body["financing_activities"]["total_cents"] == 100_000
    assert body["investing_activities"]["total_cents"] == 0
    # Cash: 100k + 50k - 20k = 130k
    assert body["ending_cash_cents"] == 130_000
    assert body["net_change_in_cash_cents"] == 130_000
    assert body["reconciles"] is True


@pytest.mark.asyncio
async def test_loan_then_repay(client: AsyncClient) -> None:
    """Borrow then partially repay long-term debt — financing in/out."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    await _entry(
        client,
        headers,
        "2025-01-01",
        [
            {"account_id": codes["1020"], "debit_cents": 500_000},
            {"account_id": codes["1720"], "credit_cents": 500_000},
        ],
    )
    await _entry(
        client,
        headers,
        "2025-06-01",
        [
            {"account_id": codes["1720"], "debit_cents": 100_000},
            {"account_id": codes["1020"], "credit_cents": 100_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31",
        headers=headers,
    )
    body = resp.json()
    assert body["financing_activities"]["total_cents"] == 400_000
    assert body["net_change_in_cash_cents"] == 400_000
    assert body["reconciles"] is True


@pytest.mark.asyncio
async def test_reconciles_always_under_mixed_load(client: AsyncClient) -> None:
    """The key invariant: OCF + ICF + FCF == Δcash for any balanced book."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    transactions = [
        # (date, dr_code, cr_code, amount)
        ("2025-01-01", "1020", "0510", 200_000),
        ("2025-01-15", "0120", "1020", 50_000),
        ("2025-02-01", "1020", "1720", 80_000),
        ("2025-02-10", "1020", "8100", 40_000),
        ("2025-02-20", "4100", "1020", 12_000),
        ("2025-03-01", "1300", "8100", 25_000),
        ("2025-03-15", "1020", "1300", 15_000),
        ("2025-04-01", "4200", "1400", 5_000),
        ("2025-05-01", "1400", "1020", 3_000),
        ("2025-06-01", "0130", "1020", 7_500),
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

    for end_date in ["2025-03-31", "2025-06-30", "2025-12-31"]:
        resp = await client.get(
            f"/api/v1/financials/reports/cash-flow?start_date=2025-01-01&end_date={end_date}",
            headers=headers,
        )
        body = resp.json()
        assert body["reconciles"], (
            f"@ {end_date}: OCF={body['operating_activities']['total_cents']} "
            f"ICF={body['investing_activities']['total_cents']} "
            f"FCF={body['financing_activities']['total_cents']} "
            f"Δcash={body['net_change_in_cash_cents']}"
        )


@pytest.mark.asyncio
async def test_owner_scoped(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@x.com")
    h2 = await _auth(client, "b@x.com")
    codes1 = await _seed(client, h1)
    await _seed(client, h2)
    await _entry(
        client,
        h1,
        "2025-01-15",
        [
            {"account_id": codes1["1020"], "debit_cents": 100_000},
            {"account_id": codes1["0510"], "credit_cents": 100_000},
        ],
    )
    resp = await client.get(
        "/api/v1/financials/reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31",
        headers=h2,
    )
    body = resp.json()
    assert body["net_change_in_cash_cents"] == 0
    assert body["reconciles"] is True
