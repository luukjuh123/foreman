"""Tests for chart of accounts — Dutch RGS-light boekhoudschema."""

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


async def _auth(client: AsyncClient, email: str = "fin@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Fin User", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_create_account_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/financials/accounts",
        json={
            "code": "8000",
            "name": "Omzet",
            "account_type": "revenue",
            "normal_balance": "credit",
        },
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_account_minimal(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/financials/accounts",
        json={
            "code": "8000",
            "name": "Netto omzet",
            "account_type": "revenue",
            "normal_balance": "credit",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["code"] == "8000"
    assert body["account_type"] == "revenue"
    assert body["normal_balance"] == "credit"
    assert body["is_active"] is True


@pytest.mark.asyncio
async def test_duplicate_account_code_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    payload = {
        "code": "1010",
        "name": "Kas",
        "account_type": "asset",
        "normal_balance": "debit",
    }
    r1 = await client.post("/api/v1/financials/accounts", json=payload, headers=headers)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/financials/accounts", json=payload, headers=headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_account_parent_link(client: AsyncClient) -> None:
    headers = await _auth(client)
    p = await client.post(
        "/api/v1/financials/accounts",
        json={
            "code": "1000",
            "name": "Liquide middelen",
            "account_type": "asset",
            "normal_balance": "debit",
        },
        headers=headers,
    )
    parent_id = p.json()["id"]
    c = await client.post(
        "/api/v1/financials/accounts",
        json={
            "code": "1010",
            "name": "Kas",
            "account_type": "asset",
            "normal_balance": "debit",
            "parent_id": parent_id,
        },
        headers=headers,
    )
    assert c.status_code == 201
    assert c.json()["parent_id"] == parent_id


@pytest.mark.asyncio
async def test_seed_dutch_rgs(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    codes = {a["code"] for a in data}
    for required in ["0500", "1010", "1020", "1300", "1400", "1600", "4000", "8000"]:
        assert required in codes, f"missing canonical RGS code {required}"

    # Idempotent
    resp2 = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    assert resp2.status_code == 201
    codes2 = {a["code"] for a in resp2.json()}
    assert codes == codes2


@pytest.mark.asyncio
async def test_seed_normals_match_account_type(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    by_code = {a["code"]: a for a in resp.json()}
    assert by_code["1010"]["account_type"] == "asset"
    assert by_code["1010"]["normal_balance"] == "debit"
    assert by_code["0500"]["account_type"] == "equity"
    assert by_code["0500"]["normal_balance"] == "credit"
    assert by_code["8000"]["account_type"] == "revenue"
    assert by_code["8000"]["normal_balance"] == "credit"
    assert by_code["4000"]["account_type"] == "expense"
    assert by_code["4000"]["normal_balance"] == "debit"
    assert by_code["1010"]["cashflow_category"] == "cash"


@pytest.mark.asyncio
async def test_account_tree_hierarchy(client: AsyncClient) -> None:
    headers = await _auth(client)
    await client.post("/api/v1/financials/accounts/seed", headers=headers)
    resp = await client.get("/api/v1/financials/accounts/tree", headers=headers)
    assert resp.status_code == 200
    tree = resp.json()
    root_codes = {n["code"] for n in tree}
    assert "0500" in root_codes
    eigen = next(n for n in tree if n["code"] == "0500")
    child_codes = {c["code"] for c in eigen["children"]}
    assert {"0510", "0520"}.issubset(child_codes)


@pytest.mark.asyncio
async def test_list_accounts_scoped_to_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@x.com")
    h2 = await _auth(client, "b@x.com")
    await client.post(
        "/api/v1/financials/accounts",
        json={
            "code": "1010",
            "name": "Kas",
            "account_type": "asset",
            "normal_balance": "debit",
        },
        headers=h1,
    )
    resp = await client.get("/api/v1/financials/accounts", headers=h2)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_update_account(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.post(
        "/api/v1/financials/accounts",
        json={
            "code": "4100",
            "name": "Loonkosten",
            "account_type": "expense",
            "normal_balance": "debit",
        },
        headers=headers,
    )
    acc_id = r.json()["id"]
    r2 = await client.patch(
        f"/api/v1/financials/accounts/{acc_id}",
        json={"name": "Salariskosten", "is_active": False},
        headers=headers,
    )
    assert r2.status_code == 200
    assert r2.json()["name"] == "Salariskosten"
    assert r2.json()["is_active"] is False


def test_seed_data_balanced() -> None:
    """Sanity: every seeded account has matching type/normal balance."""
    from app.services.finance.seed import DUTCH_RGS_LIGHT

    debit_types = {"asset", "expense"}
    credit_types = {"liability", "equity", "revenue"}
    for s in DUTCH_RGS_LIGHT:
        if s.account_type in debit_types:
            assert s.normal_balance == "debit", s
        elif s.account_type in credit_types:
            assert s.normal_balance == "credit", s
