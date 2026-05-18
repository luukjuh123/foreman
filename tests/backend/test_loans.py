"""Tests for staff loans (voorschotten) — issue, deduct, balances."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.payroll.loans import compute_outstanding

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
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth(client, email="boss@example.com"):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_staff(client, headers, name="Jan") -> str:
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": name, "role": "carpenter", "hourly_rate_cents": 4000},
        headers=headers,
    )
    return resp.json()["id"]


# --- pure compute_outstanding ---

def test_compute_outstanding_basic() -> None:
    assert compute_outstanding(50000, [10000, 5000]) == 35000


def test_compute_outstanding_zero_when_fully_repaid() -> None:
    assert compute_outstanding(20000, [10000, 10000]) == 0


def test_compute_outstanding_clamped_at_zero() -> None:
    # Over-deduction should clamp to 0 rather than go negative
    assert compute_outstanding(10000, [8000, 5000]) == 0


def test_compute_outstanding_rejects_negative_principal() -> None:
    with pytest.raises(ValueError):
        compute_outstanding(-1, [])


def test_compute_outstanding_rejects_negative_deduction() -> None:
    with pytest.raises(ValueError):
        compute_outstanding(10000, [-1])


# --- API ---

@pytest.mark.asyncio
async def test_issue_loan(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers)
    resp = await client.post(
        "/api/v1/loans/",
        json={"staff_id": sid, "principal_cents": 50000, "issued_date": "2026-01-10"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["principal_cents"] == 50000
    assert body["deducted_cents"] == 0
    assert body["outstanding_cents"] == 50000


@pytest.mark.asyncio
async def test_principal_must_be_positive(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers)
    resp = await client.post(
        "/api/v1/loans/",
        json={"staff_id": sid, "principal_cents": 0, "issued_date": "2026-01-10"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_record_deductions_and_outstanding(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers)
    loan = (
        await client.post(
            "/api/v1/loans/",
            json={"staff_id": sid, "principal_cents": 30000, "issued_date": "2026-01-10"},
            headers=headers,
        )
    ).json()
    loan_id = loan["id"]

    for amt in (10000, 5000):
        resp = await client.post(
            f"/api/v1/loans/{loan_id}/deductions",
            json={"amount_cents": amt, "deduction_date": "2026-02-01"},
            headers=headers,
        )
        assert resp.status_code == 201

    resp = await client.get(f"/api/v1/loans/{loan_id}", headers=headers)
    body = resp.json()
    assert body["deducted_cents"] == 15000
    assert body["outstanding_cents"] == 15000
    assert len(body["deductions"]) == 2


@pytest.mark.asyncio
async def test_cannot_overpay_loan(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers)
    loan_id = (
        await client.post(
            "/api/v1/loans/",
            json={"staff_id": sid, "principal_cents": 10000, "issued_date": "2026-01-10"},
            headers=headers,
        )
    ).json()["id"]

    assert (
        await client.post(
            f"/api/v1/loans/{loan_id}/deductions",
            json={"amount_cents": 7000, "deduction_date": "2026-02-01"},
            headers=headers,
        )
    ).status_code == 201
    over = await client.post(
        f"/api/v1/loans/{loan_id}/deductions",
        json={"amount_cents": 5000, "deduction_date": "2026-02-01"},
        headers=headers,
    )
    assert over.status_code == 422
    assert "exceed" in over.json()["detail"].lower()


@pytest.mark.asyncio
async def test_staff_balance_aggregates_multiple_loans(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers)
    for principal, ded in [(20000, 10000), (15000, 0)]:
        loan_id = (
            await client.post(
                "/api/v1/loans/",
                json={
                    "staff_id": sid,
                    "principal_cents": principal,
                    "issued_date": "2026-01-10",
                },
                headers=headers,
            )
        ).json()["id"]
        if ded:
            await client.post(
                f"/api/v1/loans/{loan_id}/deductions",
                json={"amount_cents": ded, "deduction_date": "2026-02-01"},
                headers=headers,
            )
    resp = await client.get(f"/api/v1/loans/staff/{sid}/balance", headers=headers)
    body = resp.json()
    assert body["total_principal_cents"] == 35000
    assert body["total_deducted_cents"] == 10000
    assert body["outstanding_cents"] == 25000
    assert len(body["loans"]) == 2


@pytest.mark.asyncio
async def test_owner_isolation(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "thief@example.com")
    sid = await _make_staff(client, h1)
    loan_id = (
        await client.post(
            "/api/v1/loans/",
            json={"staff_id": sid, "principal_cents": 10000, "issued_date": "2026-01-10"},
            headers=h1,
        )
    ).json()["id"]
    assert (await client.get(f"/api/v1/loans/{loan_id}", headers=h2)).status_code == 404
    assert (
        await client.post(
            f"/api/v1/loans/{loan_id}/deductions",
            json={"amount_cents": 100, "deduction_date": "2026-02-01"},
            headers=h2,
        )
    ).status_code == 404
