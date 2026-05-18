"""Tests for journal entries — double-entry bookkeeping engine.

Core invariant: debits MUST equal credits per entry. The engine rejects any
entry that does not balance.
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


async def _auth(client: AsyncClient, email: str = "je@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "JE User", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed(client: AsyncClient, headers: dict) -> dict[str, str]:
    """Seed RGS-light and return {code: id}."""
    resp = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    return {a["code"]: a["id"] for a in resp.json()}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_balanced_entry_succeeds(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    # Sale: debit Bank, credit Revenue. €100.00 = 10000 cents
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Klant betaalt factuur",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 10000},
                {"account_id": codes["8100"], "credit_cents": 10000},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["is_posted"] is True
    assert len(body["lines"]) == 2
    total_debit = sum(line["debit_cents"] for line in body["lines"])
    total_credit = sum(line["credit_cents"] for line in body["lines"])
    assert total_debit == total_credit == 10000


@pytest.mark.asyncio
async def test_multi_line_balanced_entry(client: AsyncClient) -> None:
    """e.g. invoice with VAT split — 3 lines, debits must equal credits."""
    headers = await _auth(client)
    codes = await _seed(client, headers)
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-02-01",
            "description": "Verkoopfactuur met BTW",
            "lines": [
                {"account_id": codes["1300"], "debit_cents": 12100},  # AR
                {"account_id": codes["8100"], "credit_cents": 10000},  # rev
                {"account_id": codes["1610"], "credit_cents": 2100},  # VAT due
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


# ---------------------------------------------------------------------------
# Validation — the core "balance" invariant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unbalanced_entry_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Bad — debits != credits",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 10000},
                {"account_id": codes["8100"], "credit_cents": 9999},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 422
    assert "credit" in resp.text.lower() or "balance" in resp.text.lower()


@pytest.mark.asyncio
async def test_line_with_both_debit_and_credit_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Bad — two-sided line",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 100, "credit_cents": 100},
                {"account_id": codes["8100"], "credit_cents": 0, "debit_cents": 0},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_zero_amount_entry_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Bad — zero",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 0},
                {"account_id": codes["8100"], "credit_cents": 0},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_single_line_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Bad — single line",
            "lines": [{"account_id": codes["1020"], "debit_cents": 100}],
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_negative_amount_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Bad — negative",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": -100},
                {"account_id": codes["8100"], "credit_cents": -100},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unknown_account_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    await _seed(client, headers)
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Bad — unknown account",
            "lines": [
                {
                    "account_id": "00000000-0000-0000-0000-000000000001",
                    "debit_cents": 100,
                },
                {
                    "account_id": "00000000-0000-0000-0000-000000000002",
                    "credit_cents": 100,
                },
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_cannot_use_other_users_account(client: AsyncClient) -> None:
    h1 = await _auth(client, "u1@x.com")
    h2 = await _auth(client, "u2@x.com")
    codes1 = await _seed(client, h1)
    codes2 = await _seed(client, h2)
    # User 2 tries to use user 1's account id
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Cross-tenant",
            "lines": [
                {"account_id": codes1["1020"], "debit_cents": 100},
                {"account_id": codes2["8100"], "credit_cents": 100},
            ],
        },
        headers=h2,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Listing + retrieval
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_journal_entries_scoped(client: AsyncClient) -> None:
    h1 = await _auth(client, "u1@x.com")
    h2 = await _auth(client, "u2@x.com")
    codes1 = await _seed(client, h1)
    await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "User 1 sale",
            "lines": [
                {"account_id": codes1["1020"], "debit_cents": 100},
                {"account_id": codes1["8100"], "credit_cents": 100},
            ],
        },
        headers=h1,
    )
    resp1 = await client.get("/api/v1/financials/journal-entries", headers=h1)
    resp2 = await client.get("/api/v1/financials/journal-entries", headers=h2)
    assert len(resp1.json()) == 1
    assert resp2.json() == []


@pytest.mark.asyncio
async def test_get_journal_entry_by_id(client: AsyncClient) -> None:
    headers = await _auth(client)
    codes = await _seed(client, headers)
    r = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2025-01-15",
            "description": "Sale",
            "lines": [
                {"account_id": codes["1020"], "debit_cents": 5000},
                {"account_id": codes["8100"], "credit_cents": 5000},
            ],
        },
        headers=headers,
    )
    entry_id = r.json()["id"]
    g = await client.get(
        f"/api/v1/financials/journal-entries/{entry_id}", headers=headers
    )
    assert g.status_code == 200
    assert g.json()["id"] == entry_id
    assert len(g.json()["lines"]) == 2


@pytest.mark.asyncio
async def test_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={"entry_date": "2025-01-15", "description": "x", "lines": []},
    )
    assert resp.status_code in (401, 403)
