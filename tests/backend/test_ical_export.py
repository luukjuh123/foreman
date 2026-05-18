"""Tests for /api/agenda/export.ics — iCalendar (RFC 5545) export."""

from datetime import date, timedelta

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
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "ics@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "A", "password": "testpass123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_task(
    client: AsyncClient,
    headers: dict,
    *,
    project_name: str,
    task_name: str,
    start: date,
    end: date,
    description: str | None = None,
) -> dict:
    project = (
        await client.post("/api/v1/projects/", json={"name": project_name}, headers=headers)
    ).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{project['id']}/phases",
            json={"name": "Phase 1"},
            headers=headers,
        )
    ).json()
    payload = {
        "name": task_name,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    if description is not None:
        payload["description"] = description
    task = (
        await client.post(
            f"/api/v1/projects/{project['id']}/phases/{phase['id']}/tasks",
            json=payload,
            headers=headers,
        )
    ).json()
    return {"project": project, "phase": phase, "task": task}


# ---------------------------------------------------------------------------
# Auth + content-type
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_export_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/agenda/export.ics?start=2025-01-01&end=2025-01-07")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_export_content_type_and_disposition(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(
        "/api/agenda/export.ics?start=2025-01-01&end=2025-01-07", headers=headers
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/calendar")
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.headers["content-disposition"].endswith('.ics"')


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_export_rejects_inverted_range(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(
        "/api/agenda/export.ics?start=2025-02-10&end=2025-02-01", headers=headers
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_export_rejects_huge_range(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(
        "/api/agenda/export.ics?start=2020-01-01&end=2025-01-01", headers=headers
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Empty calendar — must still be a valid VCALENDAR shell
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_export_empty_is_valid_vcalendar(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(
        "/api/agenda/export.ics?start=2025-01-01&end=2025-01-07", headers=headers
    )
    assert resp.status_code == 200
    body = resp.text
    assert body.startswith("BEGIN:VCALENDAR")
    assert body.rstrip().endswith("END:VCALENDAR")
    assert "VERSION:2.0" in body
    assert "PRODID:" in body
    assert "BEGIN:VEVENT" not in body


# ---------------------------------------------------------------------------
# Populated calendar — sanity check structure + parser round-trip
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_export_contains_event_per_task(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    start = date(2025, 1, 6)
    bundle = await _make_task(
        client,
        headers,
        project_name="Verbouwing",
        task_name="Stucen",
        start=start,
        end=start + timedelta(days=2),
        description="Wanden stucen op begane grond",
    )
    task_id = bundle["task"]["id"]

    resp = await client.get(
        f"/api/agenda/export.ics?start={start.isoformat()}&end={(start + timedelta(days=6)).isoformat()}",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.text
    # Structural sanity check.
    assert body.count("BEGIN:VEVENT") == 1
    assert body.count("END:VEVENT") == 1
    assert f"UID:task-{task_id}@foreman" in body
    assert "DTSTART" in body and "20250106" in body
    # DTEND is exclusive => day after end_date (Jan 8 + 1 = Jan 9).
    assert "20250109" in body
    assert "SUMMARY:Verbouwing: Stucen" in body
    assert "Wanden stucen" in body


@pytest.mark.asyncio
async def test_export_parses_with_icalendar_library(client: AsyncClient) -> None:
    """Round-trip through the `icalendar` library to confirm RFC 5545 validity."""
    icalendar = pytest.importorskip("icalendar")

    headers = await _auth_headers(client)
    start = date(2025, 3, 3)
    await _make_task(
        client,
        headers,
        project_name="Project Alpha",
        task_name="Tegelen badkamer",
        start=start,
        end=start + timedelta(days=1),
    )
    await _make_task(
        client,
        headers,
        project_name="Project Beta",
        task_name="Schilderen plafond",
        start=start + timedelta(days=3),
        end=start + timedelta(days=4),
    )

    resp = await client.get(
        f"/api/agenda/export.ics?start={start.isoformat()}&end={(start + timedelta(days=6)).isoformat()}",
        headers=headers,
    )
    assert resp.status_code == 200

    cal = icalendar.Calendar.from_ical(resp.content)
    assert cal.get("version") == "2.0"
    events = [c for c in cal.walk() if c.name == "VEVENT"]
    assert len(events) == 2
    summaries = sorted(str(e["SUMMARY"]) for e in events)
    assert summaries == [
        "Project Alpha: Tegelen badkamer",
        "Project Beta: Schilderen plafond",
    ]
    # Every event has UID + DTSTAMP per RFC 5545 §3.6.1.
    for event in events:
        assert "UID" in event
        assert "DTSTAMP" in event
        assert "DTSTART" in event
        assert "DTEND" in event


@pytest.mark.asyncio
async def test_export_isolates_users(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "owner@x.com")
    h2 = await _auth_headers(client, "other@x.com")
    start = date(2025, 5, 5)
    await _make_task(
        client, h1, project_name="Mine", task_name="Mijn taak", start=start, end=start
    )
    resp = await client.get(
        f"/api/agenda/export.ics?start={start.isoformat()}&end={start.isoformat()}",
        headers=h2,
    )
    assert resp.status_code == 200
    assert "BEGIN:VEVENT" not in resp.text


@pytest.mark.asyncio
async def test_export_excludes_undated_tasks(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{project['id']}/phases",
            json={"name": "Ph"},
            headers=headers,
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{project['id']}/phases/{phase['id']}/tasks",
        json={"name": "Floating"},
        headers=headers,
    )
    resp = await client.get(
        "/api/agenda/export.ics?start=2025-01-01&end=2025-12-30", headers=headers
    )
    assert resp.status_code == 200
    assert "BEGIN:VEVENT" not in resp.text


# ---------------------------------------------------------------------------
# Unit tests for the builder (no DB)
# ---------------------------------------------------------------------------

def test_build_ics_with_empty_iterable_is_valid() -> None:
    from app.services.calendar import build_ics
    out = build_ics([]).decode("utf-8")
    assert out.startswith("BEGIN:VCALENDAR")
    assert out.rstrip().endswith("END:VCALENDAR")
    assert "VERSION:2.0" in out
