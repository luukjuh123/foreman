"""Tests for process historical analytics (average duration per process)."""

import asyncio
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.process_analytics.analytics import (
    stats_all_processes,
    stats_for_process,
)
from app.models.process import Process, ProjectProcess
from app.models.project import Project
from app.models.time_entry import ProcessTimeEntry
from app.models.user import User
from app.core.security import hash_password
import uuid
from datetime import UTC, datetime, timedelta


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _auth(client: AsyncClient, email: str = "u@example.com") -> dict:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "U", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Unit tests for the analytics service
# ---------------------------------------------------------------------------

async def _seed_fixture(session_factory) -> dict:
    """Seed two processes, two projects, multiple completed entries."""
    async with session_factory() as session:
        user = User(
            id=uuid.uuid4(),
            email="seed@example.com",
            name="Seed",
            hashed_password=hash_password("x"),
        )
        proc_a = Process(id=uuid.uuid4(), slug="stucen", name="Stucen", unit="m2")
        proc_b = Process(id=uuid.uuid4(), slug="tegelen", name="Tegelen", unit="m2")
        project_1 = Project(id=uuid.uuid4(), owner_id=user.id, name="P1")
        project_2 = Project(id=uuid.uuid4(), owner_id=user.id, name="P2")
        session.add_all([user, proc_a, proc_b, project_1, project_2])
        await session.flush()

        pp1 = ProjectProcess(
            id=uuid.uuid4(), project_id=project_1.id, process_id=proc_a.id
        )
        pp2 = ProjectProcess(
            id=uuid.uuid4(), project_id=project_2.id, process_id=proc_a.id
        )
        pp3 = ProjectProcess(
            id=uuid.uuid4(), project_id=project_1.id, process_id=proc_b.id
        )
        session.add_all([pp1, pp2, pp3])
        await session.flush()

        now = datetime.now(UTC)
        entries = [
            # proc_a in project_1 — two entries: 100s + 300s
            ProcessTimeEntry(
                id=uuid.uuid4(),
                project_process_id=pp1.id,
                started_at=now - timedelta(seconds=100),
                stopped_at=now,
                duration_seconds=100,
            ),
            ProcessTimeEntry(
                id=uuid.uuid4(),
                project_process_id=pp1.id,
                started_at=now - timedelta(seconds=300),
                stopped_at=now,
                duration_seconds=300,
            ),
            # proc_a in project_2 — one entry: 200s
            ProcessTimeEntry(
                id=uuid.uuid4(),
                project_process_id=pp2.id,
                started_at=now - timedelta(seconds=200),
                stopped_at=now,
                duration_seconds=200,
            ),
            # An open entry — should be excluded from stats
            ProcessTimeEntry(
                id=uuid.uuid4(),
                project_process_id=pp1.id,
                started_at=now,
                stopped_at=None,
                duration_seconds=None,
            ),
            # proc_b in project_1 — single entry of 50s
            ProcessTimeEntry(
                id=uuid.uuid4(),
                project_process_id=pp3.id,
                started_at=now - timedelta(seconds=50),
                stopped_at=now,
                duration_seconds=50,
            ),
        ]
        session.add_all(entries)
        await session.commit()

        return {"proc_a_id": proc_a.id, "proc_b_id": proc_b.id}


@pytest.mark.asyncio
async def test_stats_for_process_averages_completed_entries(app_with_db) -> None:
    _, session_factory = app_with_db
    seeded = await _seed_fixture(session_factory)
    async with session_factory() as session:
        stats = await stats_for_process(seeded["proc_a_id"], session)
    assert stats is not None
    assert stats.entry_count == 3  # open entry excluded
    assert stats.total_seconds == 600  # 100 + 300 + 200
    assert stats.avg_seconds == 200.0
    assert stats.project_count == 2
    assert stats.process_slug == "stucen"


@pytest.mark.asyncio
async def test_stats_for_unknown_process_returns_none(app_with_db) -> None:
    _, session_factory = app_with_db
    async with session_factory() as session:
        stats = await stats_for_process(uuid.uuid4(), session)
    assert stats is None


@pytest.mark.asyncio
async def test_stats_all_processes_includes_zero_entry_processes(app_with_db) -> None:
    _, session_factory = app_with_db
    await _seed_fixture(session_factory)
    # Add a third process with no entries
    async with session_factory() as session:
        session.add(Process(id=uuid.uuid4(), slug="schilderen", name="Schilderen"))
        await session.commit()
    async with session_factory() as session:
        rows = await stats_all_processes(session)
    by_slug = {r.process_slug: r for r in rows}
    assert by_slug["schilderen"].entry_count == 0
    assert by_slug["schilderen"].avg_seconds is None
    assert by_slug["schilderen"].project_count == 0
    assert by_slug["stucen"].avg_seconds == 200.0
    assert by_slug["tegelen"].avg_seconds == 50.0


@pytest.mark.asyncio
async def test_stats_excludes_open_entries(app_with_db) -> None:
    """An entry without duration_seconds must not skew the average."""
    _, session_factory = app_with_db
    seeded = await _seed_fixture(session_factory)
    async with session_factory() as session:
        stats = await stats_for_process(seeded["proc_a_id"], session)
    # Already asserted in test_stats_for_process_averages_completed_entries,
    # but doubled-up here to make the intent obvious.
    assert stats is not None
    assert stats.entry_count == 3
    assert stats.avg_seconds == 200.0


# ---------------------------------------------------------------------------
# Endpoint integration tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_process_stats_endpoint(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    seeded = await _seed_fixture(session_factory)
    headers = await _auth(client)
    r = await client.get(
        f"/api/v1/processes/{seeded['proc_a_id']}/stats", headers=headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["entry_count"] == 3
    assert body["avg_seconds"] == 200.0
    assert body["project_count"] == 2


@pytest.mark.asyncio
async def test_list_process_stats_endpoint(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    await _seed_fixture(session_factory)
    headers = await _auth(client)
    r = await client.get("/api/v1/processes/stats", headers=headers)
    assert r.status_code == 200
    body = r.json()
    slugs = [row["process_slug"] for row in body["data"]]
    assert "stucen" in slugs
    assert "tegelen" in slugs


@pytest.mark.asyncio
async def test_get_stats_for_unknown_returns_404(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.get(
        "/api/v1/processes/00000000-0000-0000-0000-000000000000/stats",
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_stats_endpoints_require_auth(client: AsyncClient) -> None:
    r = await client.get("/api/v1/processes/stats")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_end_to_end_via_api(client: AsyncClient) -> None:
    """Smoke test: a real start/stop loop produces non-zero analytics."""
    headers = await _auth(client)
    proj = await client.post("/api/v1/projects/", json={"name": "E2E"}, headers=headers)
    project_id = proj.json()["id"]
    proc = await client.post(
        "/api/v1/processes/",
        json={"slug": "metselen", "name": "Metselen"},
        headers=headers,
    )
    process_id = proc.json()["id"]
    link = await client.post(
        f"/api/v1/processes/projects/{project_id}",
        json={"process_id": process_id},
        headers=headers,
    )
    pp_id = link.json()["id"]

    await client.post(f"/api/v1/time/{pp_id}/start", json={}, headers=headers)
    await asyncio.sleep(1.1)
    await client.post(f"/api/v1/time/{pp_id}/stop", json={}, headers=headers)

    r = await client.get(f"/api/v1/processes/{process_id}/stats", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["entry_count"] == 1
    assert body["avg_seconds"] is not None
    assert body["avg_seconds"] >= 1.0
