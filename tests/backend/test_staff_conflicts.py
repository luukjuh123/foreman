"""Tests for cross-project staff conflict detection (Phase 20)."""

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


async def _auth(client, email="boss@example.com"):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_staff(client, headers, name="Jan"):
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": name, "role": "carpenter", "hourly_rate_cents": 4000},
        headers=headers,
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _make_project(client, headers, name="Kitchen"):
    resp = await client.post("/api/v1/projects/", json={"name": name}, headers=headers)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _assign(client, headers, staff_id, project_id, start, end, override=False):
    url = "/api/v1/assignments/"
    if override:
        url += "?override=true"
    return await client.post(
        url,
        json={"staff_id": staff_id, "project_id": project_id, "start_at": start, "end_at": end},
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Cross-project conflict detection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cross_project_overlap_blocked_by_default(client):
    """Staff assigned to project A and B with overlapping windows → 422."""
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h, name="ProjectA")
    p2 = await _make_project(client, h, name="ProjectB")

    r1 = await _assign(client, h, sid, p1, "2026-07-01T08:00:00Z", "2026-07-01T16:00:00Z")
    assert r1.status_code == 201, r1.text

    r2 = await _assign(client, h, sid, p2, "2026-07-01T12:00:00Z", "2026-07-01T18:00:00Z")
    assert r2.status_code == 422
    body = r2.json()
    detail = body["detail"]
    detail_str = detail if isinstance(detail, str) else str(detail)
    assert "conflict" in detail_str.lower() or "overlap" in detail_str.lower()


@pytest.mark.asyncio
async def test_cross_project_no_overlap_allowed(client):
    """Staff on project A in the morning, project B in the afternoon → OK."""
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h, name="Morning")
    p2 = await _make_project(client, h, name="Afternoon")

    r1 = await _assign(client, h, sid, p1, "2026-07-01T08:00:00Z", "2026-07-01T12:00:00Z")
    r2 = await _assign(client, h, sid, p2, "2026-07-01T12:00:00Z", "2026-07-01T17:00:00Z")
    assert r1.status_code == 201
    assert r2.status_code == 201


# ---------------------------------------------------------------------------
# Override option
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_override_allows_conflicting_assignment(client):
    """override=true forces creation even when a conflict exists."""
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h, name="Alpha")
    p2 = await _make_project(client, h, name="Beta")

    r1 = await _assign(client, h, sid, p1, "2026-07-02T08:00:00Z", "2026-07-02T16:00:00Z")
    assert r1.status_code == 201

    r2 = await _assign(client, h, sid, p2, "2026-07-02T10:00:00Z", "2026-07-02T14:00:00Z", override=True)
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_override_false_still_blocks(client):
    """Explicit override=false still blocks conflicts."""
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h, name="Alpha")
    p2 = await _make_project(client, h, name="Beta")

    await _assign(client, h, sid, p1, "2026-07-03T08:00:00Z", "2026-07-03T16:00:00Z")

    resp = await client.post(
        "/api/v1/assignments/?override=false",
        json={"staff_id": sid, "project_id": p2, "start_at": "2026-07-03T10:00:00Z", "end_at": "2026-07-03T14:00:00Z"},
        headers=h,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/staff/{staff_id}/conflicts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_staff_conflicts_returns_conflicts(client):
    """GET /api/v1/staff/{id}/conflicts returns the conflicting assignment pairs."""
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h, name="Gamma")
    p2 = await _make_project(client, h, name="Delta")

    r1 = await _assign(client, h, sid, p1, "2026-07-04T08:00:00Z", "2026-07-04T16:00:00Z")
    assert r1.status_code == 201
    # force a conflicting assignment via override
    r2 = await _assign(client, h, sid, p2, "2026-07-04T12:00:00Z", "2026-07-04T18:00:00Z", override=True)
    assert r2.status_code == 201

    resp = await client.get(f"/api/v1/staff/{sid}/conflicts", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    conflict = data[0]
    assert "assignment_a" in conflict
    assert "assignment_b" in conflict
    assert "overlap_start" in conflict
    assert "overlap_end" in conflict


@pytest.mark.asyncio
async def test_get_staff_conflicts_empty_when_none(client):
    """GET /api/v1/staff/{id}/conflicts returns empty list when no conflicts."""
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h)

    await _assign(client, h, sid, p1, "2026-07-05T08:00:00Z", "2026-07-05T12:00:00Z")

    resp = await client.get(f"/api/v1/staff/{sid}/conflicts", headers=h)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_staff_conflicts_404_unknown_staff(client):
    """GET /api/v1/staff/{unknown}/conflicts returns 404."""
    import uuid

    h = await _auth(client)
    resp = await client.get(f"/api/v1/staff/{uuid.uuid4()}/conflicts", headers=h)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/staff/conflicts  (workspace-wide)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_all_conflicts(client):
    """GET /api/v1/staff/conflicts returns conflicts across all staff."""
    h = await _auth(client)
    s1 = await _make_staff(client, h, name="Jan")
    s2 = await _make_staff(client, h, name="Piet")
    p1 = await _make_project(client, h, name="X")
    p2 = await _make_project(client, h, name="Y")

    # s1 has a conflict (via override)
    await _assign(client, h, s1, p1, "2026-07-06T08:00:00Z", "2026-07-06T16:00:00Z")
    await _assign(client, h, s1, p2, "2026-07-06T12:00:00Z", "2026-07-06T18:00:00Z", override=True)

    # s2 has no conflict
    await _assign(client, h, s2, p1, "2026-07-06T08:00:00Z", "2026-07-06T12:00:00Z")

    resp = await client.get("/api/v1/staff/conflicts", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    # At least one conflict entry for s1
    assert any(c["staff_id"] == s1 for c in data)
    # No conflict entry for s2
    assert not any(c["staff_id"] == s2 for c in data)


@pytest.mark.asyncio
async def test_list_all_conflicts_empty(client):
    """GET /api/v1/staff/conflicts returns empty list when no conflicts exist."""
    h = await _auth(client)
    resp = await client.get("/api/v1/staff/conflicts", headers=h)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_all_conflicts_requires_auth(client):
    resp = await client.get("/api/v1/staff/conflicts")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Resolution suggestions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_conflict_response_includes_suggestions(client):
    """422 conflict response includes resolution suggestions."""
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h, name="P1")
    p2 = await _make_project(client, h, name="P2")

    await _assign(client, h, sid, p1, "2026-07-07T08:00:00Z", "2026-07-07T16:00:00Z")

    resp = await _assign(client, h, sid, p2, "2026-07-07T10:00:00Z", "2026-07-07T14:00:00Z")
    assert resp.status_code == 422
    body = resp.json()
    # detail should be a dict (structured) with suggestions
    assert "suggestions" in body["detail"] or (
        isinstance(body.get("detail"), str) and "suggest" in body["detail"].lower()
    ) or "next_available" in str(body)


@pytest.mark.asyncio
async def test_conflict_response_structured_detail(client):
    """422 body has structured detail with conflicting_assignment_id and suggestions."""
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h, name="Structured1")
    p2 = await _make_project(client, h, name="Structured2")

    r1 = await _assign(client, h, sid, p1, "2026-07-08T08:00:00Z", "2026-07-08T16:00:00Z")
    assert r1.status_code == 201
    existing_id = r1.json()["id"]

    r2 = await _assign(client, h, sid, p2, "2026-07-08T10:00:00Z", "2026-07-08T14:00:00Z")
    assert r2.status_code == 422
    detail = r2.json()["detail"]
    # detail is a dict with conflict info
    assert isinstance(detail, dict)
    assert detail.get("conflicting_assignment_id") == existing_id
    assert "suggestions" in detail
    suggestions = detail["suggestions"]
    assert isinstance(suggestions, list)
    assert len(suggestions) >= 1
    # Each suggestion should indicate next available slot
    for s in suggestions:
        assert "next_available_after" in s or "type" in s


@pytest.mark.asyncio
async def test_owner_isolation_conflicts(client):
    """Conflicts from another owner's staff are not visible."""
    h1 = await _auth(client, email="owner1@example.com")
    h2 = await _auth(client, email="owner2@example.com")

    s1 = await _make_staff(client, h1, name="Jan")
    p1 = await _make_project(client, h1)
    p2 = await _make_project(client, h1, name="Other")

    await _assign(client, h1, s1, p1, "2026-07-09T08:00:00Z", "2026-07-09T16:00:00Z")
    await _assign(client, h1, s1, p2, "2026-07-09T12:00:00Z", "2026-07-09T18:00:00Z", override=True)

    # owner2 sees no conflicts (their own staff list is empty)
    resp = await client.get("/api/v1/staff/conflicts", headers=h2)
    assert resp.status_code == 200
    assert resp.json() == []
