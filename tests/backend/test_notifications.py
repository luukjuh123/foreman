"""Tests for the notification engine — pluggable channel dispatch + in-app feed."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.notification import Notification
from app.models.user import User
from app.services.notifications.channels import (
    EmailChannel,
    InAppChannel,
    NotificationChannel,
    PushChannel,
)
from app.services.notifications.engine import NotificationDispatcher

TEST_DB_URL = "sqlite+aiosqlite://"


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
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _register(client: AsyncClient, email: str = "u1@example.com") -> tuple[str, str]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "User", "password": "pass1234"},
    )
    token = resp.json()["access_token"]
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    return token, me.json()["id"]


# ---------------------------------------------------------------------------
# Fake channels for tests
# ---------------------------------------------------------------------------


class RecordingChannel(NotificationChannel):
    name = "recording"

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send(self, notification: Notification, user: User) -> None:
        self.sent.append(
            {
                "user_id": str(user.id),
                "type": notification.type,
                "title": notification.title,
            }
        )


class FailingChannel(NotificationChannel):
    name = "failing"

    async def send(self, notification: Notification, user: User) -> None:
        raise RuntimeError("simulated channel failure")


# ---------------------------------------------------------------------------
# Channel interface
# ---------------------------------------------------------------------------


def test_channel_abc_requires_send() -> None:
    with pytest.raises(TypeError):
        NotificationChannel()  # type: ignore[abstract]


def test_builtin_channels_have_distinct_names() -> None:
    assert InAppChannel().name == "in_app"
    assert EmailChannel().name == "email"
    assert PushChannel().name == "push"


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dispatch_persists_notification(app_with_db) -> None:
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="x@y.z", name="X", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    dispatcher = NotificationDispatcher(channels=[InAppChannel()])
    async with session_factory() as db:
        n = await dispatcher.dispatch(
            db,
            user_id=uid,
            type="project.updated",
            title="Project updated",
            body="Your project has new status",
            data={"project_id": str(uuid.uuid4())},
        )
        assert n.id is not None
        assert n.user_id == uid
        assert n.type == "project.updated"
        assert "in_app" in n.channels_dispatched

    async with session_factory() as db:
        rows = (await db.execute(select(Notification))).scalars().all()
        assert len(rows) == 1
        assert rows[0].title == "Project updated"


@pytest.mark.asyncio
async def test_dispatch_fans_out_to_all_channels(app_with_db) -> None:
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="a@b.c", name="A", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    rec_a = RecordingChannel()
    rec_b = RecordingChannel()
    rec_b.name = "recording_b"
    dispatcher = NotificationDispatcher(channels=[InAppChannel(), rec_a, rec_b])

    async with session_factory() as db:
        n = await dispatcher.dispatch(
            db, user_id=uid, type="ping", title="t", body="b"
        )
    assert len(rec_a.sent) == 1
    assert len(rec_b.sent) == 1
    assert set(n.channels_dispatched) == {"in_app", "recording", "recording_b"}


@pytest.mark.asyncio
async def test_dispatch_continues_when_one_channel_fails(app_with_db) -> None:
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="f@f.f", name="F", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    rec = RecordingChannel()
    dispatcher = NotificationDispatcher(channels=[InAppChannel(), FailingChannel(), rec])

    async with session_factory() as db:
        n = await dispatcher.dispatch(
            db, user_id=uid, type="ping", title="t", body="b"
        )
    assert "in_app" in n.channels_dispatched
    assert "recording" in n.channels_dispatched
    assert "failing" not in n.channels_dispatched
    assert len(rec.sent) == 1


@pytest.mark.asyncio
async def test_dispatch_restricts_to_explicit_channel_list(app_with_db) -> None:
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="c@c.c", name="C", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    rec = RecordingChannel()
    dispatcher = NotificationDispatcher(
        channels=[InAppChannel(), EmailChannel(), rec]
    )

    async with session_factory() as db:
        n = await dispatcher.dispatch(
            db,
            user_id=uid,
            type="ping",
            title="t",
            body="b",
            channels=["in_app", "recording"],
        )
    assert set(n.channels_dispatched) == {"in_app", "recording"}
    assert len(rec.sent) == 1


@pytest.mark.asyncio
async def test_dispatch_unknown_user_raises(app_with_db) -> None:
    _app, session_factory = app_with_db
    dispatcher = NotificationDispatcher(channels=[InAppChannel()])
    async with session_factory() as db:
        with pytest.raises(ValueError):
            await dispatcher.dispatch(
                db, user_id=uuid.uuid4(), type="t", title="t", body=""
            )


# ---------------------------------------------------------------------------
# Routes — in-app feed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_notifications_empty(client: AsyncClient) -> None:
    token, _ = await _register(client)
    resp = await client.get(
        "/api/v1/notifications/", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"data": [], "error": None, "unread_count": 0}


@pytest.mark.asyncio
async def test_list_notifications_returns_own_only(app_with_db, client: AsyncClient) -> None:
    _app, session_factory = app_with_db
    token_a, uid_a = await _register(client, "a@a.a")
    _token_b, uid_b = await _register(client, "b@b.b")

    dispatcher = NotificationDispatcher(channels=[InAppChannel()])
    async with session_factory() as db:
        await dispatcher.dispatch(
            db, user_id=uuid.UUID(uid_a), type="t", title="for a", body=""
        )
        await dispatcher.dispatch(
            db, user_id=uuid.UUID(uid_b), type="t", title="for b", body=""
        )

    resp = await client.get(
        "/api/v1/notifications/", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert len(payload["data"]) == 1
    assert payload["data"][0]["title"] == "for a"
    assert payload["unread_count"] == 1


@pytest.mark.asyncio
async def test_mark_read(app_with_db, client: AsyncClient) -> None:
    _app, session_factory = app_with_db
    token, uid = await _register(client)

    dispatcher = NotificationDispatcher(channels=[InAppChannel()])
    async with session_factory() as db:
        n = await dispatcher.dispatch(
            db, user_id=uuid.UUID(uid), type="t", title="hi", body=""
        )

    resp = await client.post(
        f"/api/v1/notifications/{n.id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["read_at"] is not None

    # idempotent
    resp2 = await client.post(
        f"/api/v1/notifications/{n.id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 200

    listing = await client.get(
        "/api/v1/notifications/", headers={"Authorization": f"Bearer {token}"}
    )
    assert listing.json()["unread_count"] == 0


@pytest.mark.asyncio
async def test_mark_read_other_user_not_found(
    app_with_db, client: AsyncClient
) -> None:
    _app, session_factory = app_with_db
    _token_a, uid_a = await _register(client, "owner@x.x")
    token_b, _ = await _register(client, "intruder@x.x")

    dispatcher = NotificationDispatcher(channels=[InAppChannel()])
    async with session_factory() as db:
        n = await dispatcher.dispatch(
            db, user_id=uuid.UUID(uid_a), type="t", title="private", body=""
        )

    resp = await client.post(
        f"/api/v1/notifications/{n.id}/read",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_unread_only_filter(app_with_db, client: AsyncClient) -> None:
    _app, session_factory = app_with_db
    token, uid = await _register(client)
    dispatcher = NotificationDispatcher(channels=[InAppChannel()])
    async with session_factory() as db:
        n_read = await dispatcher.dispatch(
            db, user_id=uuid.UUID(uid), type="t", title="read", body=""
        )
        await dispatcher.dispatch(
            db, user_id=uuid.UUID(uid), type="t", title="unread", body=""
        )
    await client.post(
        f"/api/v1/notifications/{n_read.id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )

    resp = await client.get(
        "/api/v1/notifications/?unread_only=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()["data"]
    assert len(data) == 1
    assert data[0]["title"] == "unread"


@pytest.mark.asyncio
async def test_email_and_push_channels_no_op_safely(app_with_db) -> None:
    """Default email/push channels must not raise even without provider config."""
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="e@e.e", name="E", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    dispatcher = NotificationDispatcher(
        channels=[InAppChannel(), EmailChannel(), PushChannel()]
    )
    async with session_factory() as db:
        n = await dispatcher.dispatch(
            db, user_id=uid, type="t", title="t", body=""
        )
    assert set(n.channels_dispatched) == {"in_app", "email", "push"}
