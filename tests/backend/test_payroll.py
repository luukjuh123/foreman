"""Tests for payroll basics — TimeEntry + gross salary calculation."""

from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.payroll.calculator import _Entry, gross_cents_for_entry, summarize

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


async def _auth(client: AsyncClient, email: str = "boss@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_staff(client: AsyncClient, headers, rate_cents=4000, name="Jan") -> str:
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": name, "role": "carpenter", "hourly_rate_cents": rate_cents},
        headers=headers,
    )
    return resp.json()["id"]


# --- pure calculator tests ---

def test_gross_cents_simple() -> None:
    # 8 hours * €40/hr = €320 = 32000 cents
    assert gross_cents_for_entry(8.0, 4000) == 32000


def test_gross_cents_fractional_rounds_to_int_cents() -> None:
    # 1.5h * 3333 cents = 4999.5 cents → rounds (banker's) to 5000
    assert gross_cents_for_entry(1.5, 3333) == 5000


def test_gross_cents_zero_rate() -> None:
    assert gross_cents_for_entry(40.0, 0) == 0


def test_gross_cents_rejects_negative_hours() -> None:
    with pytest.raises(ValueError):
        gross_cents_for_entry(-1, 4000)


def test_gross_cents_rejects_negative_rate() -> None:
    with pytest.raises(ValueError):
        gross_cents_for_entry(8.0, -100)


def test_summarize_aggregates_per_project() -> None:
    import uuid as _u
    p1 = _u.uuid4()
    p2 = _u.uuid4()
    entries = [
        _Entry(p1, 8.0, 4000),  # 32000
        _Entry(p1, 4.0, 4000),  # 16000
        _Entry(p2, 6.0, 5000),  # 30000
        _Entry(None, 2.0, 3000),  # 6000
    ]
    total_hours, total_gross, breakdown = summarize(entries)
    assert total_hours == 20.0
    assert total_gross == 32000 + 16000 + 30000 + 6000
    assert breakdown[p1] == (12.0, 48000)
    assert breakdown[p2] == (6.0, 30000)
    assert breakdown[None] == (2.0, 6000)


# --- API tests ---

@pytest.mark.asyncio
async def test_create_time_entry_snapshots_current_rate(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers, rate_cents=4500)
    resp = await client.post(
        "/api/v1/payroll/time-entries",
        json={"staff_id": sid, "work_date": "2026-01-15", "hours": 8.0},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["hours"] == 8.0
    assert body["hourly_rate_cents_snapshot"] == 4500

    # Change staff rate; new entry uses new rate, old keeps snapshot
    await client.put(f"/api/v1/staff/{sid}", json={"hourly_rate_cents": 5000}, headers=headers)
    resp = await client.post(
        "/api/v1/payroll/time-entries",
        json={"staff_id": sid, "work_date": "2026-01-16", "hours": 4.0},
        headers=headers,
    )
    assert resp.json()["hourly_rate_cents_snapshot"] == 5000


@pytest.mark.asyncio
async def test_time_entry_hours_must_be_positive_and_bounded(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers)
    for h in (0, -1, 25):
        resp = await client.post(
            "/api/v1/payroll/time-entries",
            json={"staff_id": sid, "work_date": "2026-01-15", "hours": h},
            headers=headers,
        )
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_payroll_summary_period(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers, rate_cents=4000)
    # 3 entries inside, 1 outside
    for d, h in [("2026-01-05", 8.0), ("2026-01-06", 8.0), ("2026-01-09", 4.0), ("2026-02-01", 8.0)]:
        await client.post(
            "/api/v1/payroll/time-entries",
            json={"staff_id": sid, "work_date": d, "hours": h},
            headers=headers,
        )
    resp = await client.get(
        f"/api/v1/payroll/staff/{sid}/payroll",
        params={"period_start": "2026-01-01", "period_end": "2026-01-31"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_hours"] == 20.0
    assert body["gross_cents"] == 20 * 4000  # 80000
    assert len(body["by_project"]) == 1
    assert body["by_project"][0]["project_id"] is None


@pytest.mark.asyncio
async def test_payroll_summary_rejects_inverted_period(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers)
    resp = await client.get(
        f"/api/v1/payroll/staff/{sid}/payroll",
        params={"period_start": "2026-02-01", "period_end": "2026-01-01"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_time_entry_rejected_for_other_owners_staff(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "thief@example.com")
    sid = await _make_staff(client, h1)
    resp = await client.post(
        "/api/v1/payroll/time-entries",
        json={"staff_id": sid, "work_date": "2026-01-15", "hours": 8.0},
        headers=h2,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_time_entries_filters_period(client: AsyncClient) -> None:
    headers = await _auth(client)
    sid = await _make_staff(client, headers)
    for d in ("2026-01-01", "2026-01-15", "2026-02-15"):
        await client.post(
            "/api/v1/payroll/time-entries",
            json={"staff_id": sid, "work_date": d, "hours": 5.0},
            headers=headers,
        )
    resp = await client.get(
        f"/api/v1/payroll/staff/{sid}/time-entries",
        params={"period_start": "2026-01-01", "period_end": "2026-01-31"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2
