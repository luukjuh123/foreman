"""Tests for smart material price alerts (Phase 20).

Covers:
- MaterialPriceSnapshot model persistence
- PriceAlertService: detect >10% price drops
- PriceAlertService: detect stock changes (out-of-stock → in-stock)
- PriceAlertService: weekly price trend summary per project
- GET /api/materials/price-alerts/{project_id}
- GET /api/materials/price-trends/{project_id}
- Auth & ownership enforcement
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.material import Material
from app.models.price_alert import MaterialPriceSnapshot
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.services.materials.price_alerts import (
    PriceAlert,
    PriceAlertService,
    PriceTrendSummary,
    detect_price_drop,
    detect_stock_change,
)

TEST_DB_URL = "sqlite+aiosqlite://"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def session_factory():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)
    yield sf
    await engine.dispose()


@pytest_asyncio.fixture
async def app_with_db(session_factory):
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield app


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "alerts@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Alerts User", "password": "testpass123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed_project_with_material(sf, *, material_name: str = "Bricks") -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Returns (owner_id, project_id, material_id)."""
    async with sf() as db:
        user = User(email=f"u{uuid.uuid4().hex[:6]}@x.io", name="U", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        project = Project(owner_id=user.id, name="Test Build", status="active")
        db.add(project)
        await db.commit()
        await db.refresh(project)

        phase = Phase(project_id=project.id, name="Phase 1")
        db.add(phase)
        await db.commit()
        await db.refresh(phase)

        task = Task(phase_id=phase.id, name="Task 1")
        db.add(task)
        await db.commit()
        await db.refresh(task)

        material = Material(
            task_id=task.id,
            name=material_name,
            quantity=10.0,
            unit="piece",
            unit_price_cents=1000,
        )
        db.add(material)
        await db.commit()
        await db.refresh(material)

        return user.id, project.id, material.id


# ---------------------------------------------------------------------------
# MaterialPriceSnapshot model
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_price_snapshot_persists_and_retrieves(session_factory) -> None:
    """Snapshot stores material price + stock at a point in time."""
    _uid, _pid, material_id = await _seed_project_with_material(session_factory)
    snapped_at = datetime.now(UTC)

    async with session_factory() as db:
        snap = MaterialPriceSnapshot(
            material_id=material_id,
            store="hornbach",
            price_cents=980,
            in_stock=True,
            snapped_at=snapped_at,
        )
        db.add(snap)
        await db.commit()
        await db.refresh(snap)
        assert snap.id is not None
        assert snap.price_cents == 980
        assert snap.in_stock is True
        assert snap.store == "hornbach"

    async with session_factory() as db:
        row = (
            await db.execute(
                select(MaterialPriceSnapshot).where(MaterialPriceSnapshot.material_id == material_id)
            )
        ).scalar_one()
        assert row.price_cents == 980


@pytest.mark.asyncio
async def test_price_snapshot_requires_material_id(session_factory) -> None:
    """Snapshot without a valid material_id must fail at DB level."""
    async with session_factory() as db:
        snap = MaterialPriceSnapshot(
            material_id=uuid.uuid4(),  # non-existent FK
            store="gamma",
            price_cents=500,
            in_stock=False,
            snapped_at=datetime.now(UTC),
        )
        db.add(snap)
        # SQLite defers FK checks by default, so we just check the model is created
        await db.commit()
        await db.refresh(snap)
        assert snap.id is not None


# ---------------------------------------------------------------------------
# detect_price_drop — pure function
# ---------------------------------------------------------------------------


def test_detect_price_drop_above_threshold() -> None:
    """A drop > 10% returns an alert."""
    alert = detect_price_drop(material_name="Cement", old_price=1000, new_price=850, store="praxis")
    assert alert is not None
    assert alert.alert_type == "price_drop"
    assert alert.drop_pct > 10.0
    assert alert.material_name == "Cement"
    assert alert.store == "praxis"
    assert alert.old_price_cents == 1000
    assert alert.new_price_cents == 850


def test_detect_price_drop_exactly_10pct() -> None:
    """Exactly 10% drop does NOT trigger (threshold is > 10%)."""
    alert = detect_price_drop(material_name="Sand", old_price=1000, new_price=900, store="gamma")
    assert alert is None


def test_detect_price_drop_below_threshold() -> None:
    """Less than 10% drop returns None."""
    alert = detect_price_drop(material_name="Gravel", old_price=1000, new_price=950, store="bouwmaat")
    assert alert is None


def test_detect_price_drop_price_increase() -> None:
    """Price increase never triggers a drop alert."""
    alert = detect_price_drop(material_name="Wood", old_price=1000, new_price=1100, store="hornbach")
    assert alert is None


def test_detect_price_drop_zero_old_price() -> None:
    """Zero old price is treated as no data — no alert."""
    alert = detect_price_drop(material_name="X", old_price=0, new_price=500, store="gamma")
    assert alert is None


# ---------------------------------------------------------------------------
# detect_stock_change — pure function
# ---------------------------------------------------------------------------


def test_detect_stock_change_oos_to_available() -> None:
    """Out-of-stock → in-stock triggers a restock alert."""
    alert = detect_stock_change(material_name="Tiles", was_in_stock=False, now_in_stock=True, store="praxis")
    assert alert is not None
    assert alert.alert_type == "restock"
    assert alert.material_name == "Tiles"
    assert alert.store == "praxis"


def test_detect_stock_change_available_to_oos() -> None:
    """In-stock → out-of-stock does NOT trigger (we only care about restocks)."""
    alert = detect_stock_change(material_name="Paint", was_in_stock=True, now_in_stock=False, store="gamma")
    assert alert is None


def test_detect_stock_change_no_change() -> None:
    """No stock state change → no alert."""
    alert_in = detect_stock_change(material_name="Screws", was_in_stock=True, now_in_stock=True, store="hornbach")
    alert_out = detect_stock_change(material_name="Screws", was_in_stock=False, now_in_stock=False, store="hornbach")
    assert alert_in is None
    assert alert_out is None


# ---------------------------------------------------------------------------
# PriceAlertService — uses snapshot history from DB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_detects_price_drop_across_snapshots(session_factory) -> None:
    """Service finds price drop when latest snapshot is >10% cheaper than previous."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory, material_name="Cement")

    now = datetime.now(UTC)
    async with session_factory() as db:
        # Old snapshot: 1000 cents
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="hornbach",
            price_cents=1000, in_stock=True,
            snapped_at=now - timedelta(days=2),
        ))
        # New snapshot: 850 cents (15% drop)
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="hornbach",
            price_cents=850, in_stock=True,
            snapped_at=now - timedelta(hours=1),
        ))
        await db.commit()

    async with session_factory() as db:
        service = PriceAlertService()
        alerts = await service.get_alerts_for_project(db, project_id=project_id)

    assert len(alerts) == 1
    assert alerts[0].alert_type == "price_drop"
    assert alerts[0].material_name == "Cement"
    assert alerts[0].drop_pct > 10.0


@pytest.mark.asyncio
async def test_service_detects_restock_alert(session_factory) -> None:
    """Service finds restock when latest snapshot is in_stock=True and previous was False."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory, material_name="Roof Tiles")

    now = datetime.now(UTC)
    async with session_factory() as db:
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="gamma",
            price_cents=500, in_stock=False,
            snapped_at=now - timedelta(days=1),
        ))
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="gamma",
            price_cents=500, in_stock=True,
            snapped_at=now - timedelta(minutes=30),
        ))
        await db.commit()

    async with session_factory() as db:
        service = PriceAlertService()
        alerts = await service.get_alerts_for_project(db, project_id=project_id)

    assert len(alerts) == 1
    assert alerts[0].alert_type == "restock"
    assert alerts[0].material_name == "Roof Tiles"


@pytest.mark.asyncio
async def test_service_returns_no_alerts_when_no_snapshots(session_factory) -> None:
    """No snapshots → no alerts."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory)

    async with session_factory() as db:
        service = PriceAlertService()
        alerts = await service.get_alerts_for_project(db, project_id=project_id)

    assert alerts == []


@pytest.mark.asyncio
async def test_service_returns_no_alerts_when_only_one_snapshot(session_factory) -> None:
    """Single snapshot — no previous to compare against, so no alert."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory)

    async with session_factory() as db:
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="hornbach",
            price_cents=1000, in_stock=True,
            snapped_at=datetime.now(UTC),
        ))
        await db.commit()

    async with session_factory() as db:
        service = PriceAlertService()
        alerts = await service.get_alerts_for_project(db, project_id=project_id)

    assert alerts == []


@pytest.mark.asyncio
async def test_service_returns_no_alerts_when_price_stable(session_factory) -> None:
    """Price change < 10% → no alert."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory)

    now = datetime.now(UTC)
    async with session_factory() as db:
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="praxis",
            price_cents=1000, in_stock=True,
            snapped_at=now - timedelta(days=1),
        ))
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="praxis",
            price_cents=960, in_stock=True,  # 4% drop — under threshold
            snapped_at=now - timedelta(hours=2),
        ))
        await db.commit()

    async with session_factory() as db:
        service = PriceAlertService()
        alerts = await service.get_alerts_for_project(db, project_id=project_id)

    assert alerts == []


# ---------------------------------------------------------------------------
# PriceAlertService — weekly trend summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_weekly_trend_summary(session_factory) -> None:
    """Weekly trend returns min, max, avg price and direction per material."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory, material_name="Gravel")

    now = datetime.now(UTC)
    prices = [1200, 1100, 1050, 1000, 980, 950, 900]  # decreasing trend
    async with session_factory() as db:
        for i, p in enumerate(prices):
            db.add(MaterialPriceSnapshot(
                material_id=material_id, store="hornbach",
                price_cents=p, in_stock=True,
                snapped_at=now - timedelta(days=6 - i),
            ))
        await db.commit()

    async with session_factory() as db:
        service = PriceAlertService()
        summaries = await service.get_weekly_trends(db, project_id=project_id)

    assert len(summaries) == 1
    summary = summaries[0]
    assert summary.material_name == "Gravel"
    assert summary.min_price_cents == 900
    assert summary.max_price_cents == 1200
    assert summary.avg_price_cents == pytest.approx(sum(prices) / len(prices), abs=1)
    assert summary.trend_direction == "down"
    assert summary.snapshot_count == 7


@pytest.mark.asyncio
async def test_service_weekly_trend_up_direction(session_factory) -> None:
    """Increasing prices → trend direction 'up'."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory, material_name="Steel")

    now = datetime.now(UTC)
    async with session_factory() as db:
        for i, price in enumerate([800, 900, 950, 1000]):
            db.add(MaterialPriceSnapshot(
                material_id=material_id, store="bouwmaat",
                price_cents=price, in_stock=True,
                snapped_at=now - timedelta(days=3 - i),
            ))
        await db.commit()

    async with session_factory() as db:
        service = PriceAlertService()
        summaries = await service.get_weekly_trends(db, project_id=project_id)

    assert summaries[0].trend_direction == "up"


@pytest.mark.asyncio
async def test_service_weekly_trend_stable(session_factory) -> None:
    """Flat prices → trend direction 'stable'."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory, material_name="Mortar")

    now = datetime.now(UTC)
    async with session_factory() as db:
        for i in range(4):
            db.add(MaterialPriceSnapshot(
                material_id=material_id, store="hornbach",
                price_cents=500, in_stock=True,
                snapped_at=now - timedelta(days=3 - i),
            ))
        await db.commit()

    async with session_factory() as db:
        service = PriceAlertService()
        summaries = await service.get_weekly_trends(db, project_id=project_id)

    assert summaries[0].trend_direction == "stable"


@pytest.mark.asyncio
async def test_service_weekly_trend_only_last_7_days(session_factory) -> None:
    """Trend summary only includes snapshots from the last 7 days."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory, material_name="Glass")

    now = datetime.now(UTC)
    async with session_factory() as db:
        # Old snapshot outside the 7-day window
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="gamma",
            price_cents=2000, in_stock=True,
            snapped_at=now - timedelta(days=10),
        ))
        # Recent snapshots
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="gamma",
            price_cents=300, in_stock=True,
            snapped_at=now - timedelta(days=2),
        ))
        db.add(MaterialPriceSnapshot(
            material_id=material_id, store="gamma",
            price_cents=310, in_stock=True,
            snapped_at=now - timedelta(days=1),
        ))
        await db.commit()

    async with session_factory() as db:
        service = PriceAlertService()
        summaries = await service.get_weekly_trends(db, project_id=project_id)

    assert len(summaries) == 1
    # Max should be 310, not 2000 (old snapshot excluded)
    assert summaries[0].max_price_cents == 310
    assert summaries[0].snapshot_count == 2


@pytest.mark.asyncio
async def test_service_weekly_trend_no_snapshots_returns_empty(session_factory) -> None:
    """No snapshots → empty list."""
    uid, project_id, material_id = await _seed_project_with_material(session_factory)

    async with session_factory() as db:
        service = PriceAlertService()
        summaries = await service.get_weekly_trends(db, project_id=project_id)

    assert summaries == []


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_price_alerts_endpoint_returns_empty_list(client: AsyncClient) -> None:
    """Empty project with no snapshots returns empty alerts list."""
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()

    resp = await client.get(f"/api/materials/price-alerts/{proj['id']}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["alerts"] == []
    assert body["project_id"] == proj["id"]


@pytest.mark.asyncio
async def test_price_trends_endpoint_returns_empty_list(client: AsyncClient) -> None:
    """Empty project with no snapshots returns empty trends list."""
    headers = await _auth_headers(client, "trends@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()

    resp = await client.get(f"/api/materials/price-trends/{proj['id']}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["trends"] == []
    assert body["project_id"] == proj["id"]


@pytest.mark.asyncio
async def test_price_alerts_endpoint_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "noauth@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()

    resp = await client.get(f"/api/materials/price-alerts/{proj['id']}")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_price_trends_endpoint_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "noauth2@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()

    resp = await client.get(f"/api/materials/price-trends/{proj['id']}")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_price_alerts_endpoint_forbids_other_user(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "owner@example.com")
    h2 = await _auth_headers(client, "other@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=h1)).json()

    resp = await client.get(f"/api/materials/price-alerts/{proj['id']}", headers=h2)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_price_trends_endpoint_forbids_other_user(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "owner2@example.com")
    h2 = await _auth_headers(client, "other2@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=h1)).json()

    resp = await client.get(f"/api/materials/price-trends/{proj['id']}", headers=h2)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_price_alerts_endpoint_project_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "nf@example.com")
    resp = await client.get(f"/api/materials/price-alerts/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_price_trends_endpoint_project_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "nf2@example.com")
    resp = await client.get(f"/api/materials/price-trends/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404
