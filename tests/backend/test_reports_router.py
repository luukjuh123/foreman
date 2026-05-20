"""Tests for the reports router — generate, list, get, pdf, share, public view."""

from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite://"

# Minimal weekly report payload returned by the mocked service
_WEEKLY_DATA = {
    "type": "weekly",
    "project": {"id": "proj-uuid", "name": "Test Project"},
    "period": {"start": "2025-02-03", "end": "2025-02-09"},
    "next_week": {"start": "2025-02-10", "end": "2025-02-16"},
    "phases": [],
    "tasks": [],
    "totals": {
        "task_count": 0,
        "completed_task_count": 0,
        "estimated_hours": 0.0,
        "labor_cost_cents": 0,
    },
    "completed_this_week": [],
    "hours_by_phase": [],
    "next_week_plan": [],
    "photos": [],
}

_COMPLETION_DATA = {
    "type": "completion",
    "project": {"id": "proj-uuid", "name": "Test Project"},
    "timeline": {
        "planned_start": None,
        "planned_end": None,
        "actual_start": None,
        "actual_end": None,
        "planned_duration_days": None,
        "actual_duration_days": None,
    },
    "costs_vs_budget": {
        "budget_cents": 0,
        "actual_cost_cents": 0,
        "variance_cents": 0,
        "over_budget": False,
        "variance_pct": None,
    },
    "phase_summary": [],
    "totals": {
        "task_count": 0,
        "completed_task_count": 0,
        "estimated_hours": 0.0,
        "labor_cost_cents": 0,
    },
}


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        TEST_DB_URL,
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
    app.state.test_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        ac._session_factory = app_with_db.state.test_session_factory
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "user@example.com") -> dict:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "Test User",
        "password": "testpass123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post("/api/v1/projects/", json={
        "name": "Test Project",
        "status": "active",
        "budget_cents": 100_000,
    }, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Generate report
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_weekly_report(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "weekly"
    assert body["project_id"] == project_id
    assert body["title"] == "Weekly report — Test Project (2025-02-03 – 2025-02-09)"
    assert "id" in body
    assert "created_at" in body
    assert body["is_shared"] is False
    assert body["share_token"] is None


@pytest.mark.asyncio
async def test_generate_completion_report(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_completion_report",
        new=AsyncMock(return_value=_COMPLETION_DATA),
    ):
        resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "completion",
        }, headers=headers)

    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "completion"
    assert body["title"] == "Completion report — Test Project"


@pytest.mark.asyncio
async def test_generate_report_invalid_type(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.post("/api/v1/reports/generate", json={
        "project_id": project_id,
        "type": "invalid",
    }, headers=headers)

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_generate_report_project_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(side_effect=LookupError("project not found")),
    ):
        resp = await client.post("/api/v1/reports/generate", json={
            "project_id": str(uuid.uuid4()),
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# List reports
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_reports_empty(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/reports/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0
    assert body["page"] == 1
    assert body["per_page"] == 20


@pytest.mark.asyncio
async def test_list_reports_pagination(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    # Create two reports
    for _ in range(2):
        with patch(
            "app.routers.reports.generate_weekly_report",
            new=AsyncMock(return_value=_WEEKLY_DATA),
        ):
            await client.post("/api/v1/reports/generate", json={
                "project_id": project_id,
                "type": "weekly",
                "period_start": "2025-02-03",
                "period_end": "2025-02-09",
            }, headers=headers)

    resp = await client.get("/api/v1/reports/?per_page=1&page=1", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["data"]) == 1

    resp2 = await client.get("/api/v1/reports/?per_page=1&page=2", headers=headers)
    assert resp2.status_code == 200
    assert len(resp2.json()["data"]) == 1


@pytest.mark.asyncio
async def test_list_reports_no_data_field(client: AsyncClient) -> None:
    """List response should omit the full data payload for bandwidth."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    resp = await client.get("/api/v1/reports/", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    # List items must NOT include the full data payload
    assert "data" not in items[0]


# ---------------------------------------------------------------------------
# Get single report
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_report(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        create_resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    report_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/reports/{report_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == report_id
    assert body["data"] == _WEEKLY_DATA


@pytest.mark.asyncio
async def test_get_report_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(f"/api/v1/reports/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_report_wrong_user(client: AsyncClient) -> None:
    headers_a = await _auth_headers(client, "a@example.com")
    headers_b = await _auth_headers(client, "b@example.com")
    project_id = await _create_project(client, headers_a)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        create_resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers_a)

    report_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/reports/{report_id}", headers=headers_b)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Download PDF
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_download_pdf(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        create_resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    report_id = create_resp.json()["id"]

    fake_pdf = b"%PDF-1.4 fake"
    with patch("app.routers.reports.render_report_pdf", return_value=fake_pdf):
        resp = await client.get(f"/api/v1/reports/{report_id}/pdf", headers=headers)

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content == fake_pdf


# ---------------------------------------------------------------------------
# Share / unshare toggle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_share_report_generates_token(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        create_resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    report_id = create_resp.json()["id"]
    resp = await client.post(f"/api/v1/reports/{report_id}/share", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["share_token"] is not None
    assert report_id in body["share_url"]


@pytest.mark.asyncio
async def test_unshare_report_clears_token(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        create_resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    report_id = create_resp.json()["id"]

    # Share first
    await client.post(f"/api/v1/reports/{report_id}/share", headers=headers)

    # Unshare (toggle off)
    resp = await client.post(f"/api/v1/reports/{report_id}/share", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["share_token"] is None


# ---------------------------------------------------------------------------
# Public shared endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_public_shared_endpoint_returns_data(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        create_resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    report_id = create_resp.json()["id"]

    share_resp = await client.post(f"/api/v1/reports/{report_id}/share", headers=headers)
    token = share_resp.json()["share_token"]

    # Public endpoint — no auth header
    resp = await client.get(f"/api/v1/reports/shared/{token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == report_id
    assert body["data"] == _WEEKLY_DATA


@pytest.mark.asyncio
async def test_public_shared_endpoint_invalid_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/reports/shared/invalid.token")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_public_shared_endpoint_unshared_report(client: AsyncClient) -> None:
    """A report that exists but is not shared should return 404 on the public endpoint."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    with patch(
        "app.routers.reports.generate_weekly_report",
        new=AsyncMock(return_value=_WEEKLY_DATA),
    ):
        create_resp = await client.post("/api/v1/reports/generate", json={
            "project_id": project_id,
            "type": "weekly",
            "period_start": "2025-02-03",
            "period_end": "2025-02-09",
        }, headers=headers)

    report_id = create_resp.json()["id"]

    # Share then unshare
    await client.post(f"/api/v1/reports/{report_id}/share", headers=headers)
    await client.post(f"/api/v1/reports/{report_id}/share", headers=headers)

    # Get a valid token for this report by signing with the known secret
    from app.core.config import settings
    from app.services.reports.tokens import sign_report_token
    token = sign_report_token(uuid.UUID(report_id), settings.jwt_secret_key)

    resp = await client.get(f"/api/v1/reports/shared/{token}")
    assert resp.status_code == 404
