"""Tests for review rating aggregation — daily snapshots and trend chart."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.rating_snapshot import RatingSnapshot
from app.models.review import Review
from app.services.reviews.aggregation import get_trend, take_snapshot

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def factory():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    yield session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def db(factory):
    async with factory() as session:
        yield session


@pytest.mark.asyncio
async def test_take_snapshot_computes_average_and_count(db) -> None:
    db.add_all(
        [
            Review(location_id="loc-1", external_id="a", author_name="A", rating=5),
            Review(location_id="loc-1", external_id="b", author_name="B", rating=3),
            Review(location_id="loc-1", external_id="c", author_name="C", rating=4),
        ]
    )
    await db.commit()
    snap = await take_snapshot(db, "loc-1")
    assert snap.review_count == 3
    assert snap.average_rating == pytest.approx(4.0)
    assert snap.snapshot_date == date.today()


@pytest.mark.asyncio
async def test_take_snapshot_is_idempotent_per_day(db) -> None:
    db.add(Review(location_id="loc-1", external_id="a", author_name="A", rating=5))
    await db.commit()
    await take_snapshot(db, "loc-1")
    # Add another review then take snapshot again — should overwrite, not duplicate.
    db.add(Review(location_id="loc-1", external_id="b", author_name="B", rating=1))
    await db.commit()
    snap2 = await take_snapshot(db, "loc-1")
    assert snap2.review_count == 2
    assert snap2.average_rating == pytest.approx(3.0)

    from sqlalchemy import select

    rows = (
        await db.execute(
            select(RatingSnapshot).where(RatingSnapshot.location_id == "loc-1")
        )
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_get_trend_returns_chronological(db) -> None:
    today = date.today()
    db.add_all(
        [
            RatingSnapshot(
                location_id="loc-1",
                snapshot_date=today - timedelta(days=2),
                average_rating=3.0,
                review_count=2,
            ),
            RatingSnapshot(
                location_id="loc-1",
                snapshot_date=today - timedelta(days=1),
                average_rating=4.0,
                review_count=3,
            ),
            RatingSnapshot(
                location_id="loc-1",
                snapshot_date=today,
                average_rating=4.5,
                review_count=4,
            ),
            RatingSnapshot(
                location_id="loc-2",  # different location — must be excluded
                snapshot_date=today,
                average_rating=1.0,
                review_count=1,
            ),
        ]
    )
    await db.commit()
    points = await get_trend(db, "loc-1", days=7)
    assert [p.review_count for p in points] == [2, 3, 4]
    assert points[0].snapshot_date < points[-1].snapshot_date


@pytest.mark.asyncio
async def test_get_trend_respects_window(db) -> None:
    today = date.today()
    db.add_all(
        [
            RatingSnapshot(
                location_id="loc-1",
                snapshot_date=today - timedelta(days=40),
                average_rating=3.0,
                review_count=2,
            ),
            RatingSnapshot(
                location_id="loc-1",
                snapshot_date=today,
                average_rating=5.0,
                review_count=1,
            ),
        ]
    )
    await db.commit()
    points = await get_trend(db, "loc-1", days=30)
    assert len(points) == 1
    assert points[0].review_count == 1


@pytest.mark.asyncio
async def test_snapshot_and_trend_endpoints(factory) -> None:
    app = create_app()

    async def override_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "agg@example.com",
                "name": "Agg",
                "password": "secretpass123",
            },
        )
        token = resp.json()["access_token"]
        ac.headers["Authorization"] = f"Bearer {token}"

        # Seed reviews
        async with factory() as s:
            s.add_all(
                [
                    Review(
                        location_id="loc-1",
                        external_id="a",
                        author_name="A",
                        rating=5,
                    ),
                    Review(
                        location_id="loc-1",
                        external_id="b",
                        author_name="B",
                        rating=3,
                    ),
                ]
            )
            await s.commit()

        snap_resp = await ac.post(
            "/api/v1/reviews/snapshot", json={"location_id": "loc-1"}
        )
        assert snap_resp.status_code == 200, snap_resp.text
        assert snap_resp.json()["data"]["review_count"] == 2
        assert snap_resp.json()["data"]["average_rating"] == pytest.approx(4.0)

        trend_resp = await ac.get(
            "/api/v1/reviews/trend",
            params={"location_id": "loc-1", "days": 7},
        )
        assert trend_resp.status_code == 200
        assert len(trend_resp.json()["data"]) == 1


@pytest.mark.asyncio
async def test_trend_rejects_invalid_days(factory) -> None:
    app = create_app()

    async def override_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "agg2@example.com",
                "name": "A",
                "password": "secretpass123",
            },
        )
        token = resp.json()["access_token"]
        ac.headers["Authorization"] = f"Bearer {token}"

        resp = await ac.get(
            "/api/v1/reviews/trend",
            params={"location_id": "x", "days": 0},
        )
        assert resp.status_code == 400
