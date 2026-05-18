"""Tests for per-user notification preferences.

Behavior:
- New table `notification_preferences` with one row per user.
  Columns: user_id (PK FK), in_app_enabled, email_enabled, push_enabled,
  type_overrides (JSON), timestamps.
- Defaults: all three channels enabled, no per-type overrides.
- A row is auto-created with defaults the first time it is requested.
- Per-type override format: {"<notification_type>": {"email": false}}.
- Dispatcher consults preferences:
  * If the user has disabled a channel globally, that channel is skipped.
  * Per-type override wins over the global toggle for that type.
  * An explicit `channels=[...]` argument is still respected — but it is
    intersected with the user's allowed set (the user always wins).
- HTTP API:
  * GET /api/v1/notifications/preferences -> current prefs envelope
  * PUT /api/v1/notifications/preferences -> update prefs
"""

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
from app.models.notification_preference import NotificationPreference
from app.models.user import User
from app.services.notifications.channels import (
    EmailChannel,
    InAppChannel,
    NotificationChannel,
    PushChannel,
)
from app.services.notifications.engine import NotificationDispatcher
from app.services.notifications.preferences import (
    allowed_channels_for,
    get_or_create_preferences,
)

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
# Recording channels for dispatcher tests
# ---------------------------------------------------------------------------


class _Recording(NotificationChannel):
    def __init__(self, name: str) -> None:
        self.name = name
        self.sent: list[dict[str, Any]] = []

    async def send(self, notification, user) -> None:  # type: ignore[override]
        self.sent.append({"type": notification.type, "title": notification.title})


# ---------------------------------------------------------------------------
# Model + defaults
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_or_create_returns_defaults_when_no_row(app_with_db) -> None:
    _app, sf = app_with_db
    async with sf() as db:
        user = User(email="x@y.z", name="X", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        prefs = await get_or_create_preferences(db, user_id=user.id)
        assert prefs.in_app_enabled is True
        assert prefs.email_enabled is True
        assert prefs.push_enabled is True
        assert prefs.type_overrides in (None, {})


@pytest.mark.asyncio
async def test_get_or_create_is_idempotent(app_with_db) -> None:
    _app, sf = app_with_db
    async with sf() as db:
        user = User(email="a@b.c", name="A", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        p1 = await get_or_create_preferences(db, user_id=user.id)
        p2 = await get_or_create_preferences(db, user_id=user.id)
        assert p1.user_id == p2.user_id
        rows = (
            await db.execute(
                select(NotificationPreference).where(
                    NotificationPreference.user_id == user.id
                )
            )
        ).scalars().all()
        assert len(rows) == 1


# ---------------------------------------------------------------------------
# allowed_channels_for
# ---------------------------------------------------------------------------


def _make_prefs(
    *,
    in_app: bool = True,
    email: bool = True,
    push: bool = True,
    overrides: dict | None = None,
) -> NotificationPreference:
    return NotificationPreference(
        user_id=uuid.uuid4(),
        in_app_enabled=in_app,
        email_enabled=email,
        push_enabled=push,
        type_overrides=overrides,
    )


def test_allowed_channels_default_all() -> None:
    prefs = _make_prefs()
    assert allowed_channels_for(prefs, "anything") == {"in_app", "email", "push"}


def test_allowed_channels_global_disable() -> None:
    prefs = _make_prefs(email=False, push=False)
    assert allowed_channels_for(prefs, "alert.over_budget") == {"in_app"}


def test_allowed_channels_per_type_override_disables() -> None:
    prefs = _make_prefs(overrides={"alert.weather_risk": {"email": False}})
    assert allowed_channels_for(prefs, "alert.weather_risk") == {"in_app", "push"}
    # Other types unaffected
    assert allowed_channels_for(prefs, "project.updated") == {
        "in_app",
        "email",
        "push",
    }


def test_allowed_channels_per_type_override_enables() -> None:
    # Email globally off, but explicitly enabled for invoice.sent
    prefs = _make_prefs(email=False, overrides={"invoice.sent": {"email": True}})
    assert allowed_channels_for(prefs, "invoice.sent") == {"in_app", "push", "email"}
    assert allowed_channels_for(prefs, "other.type") == {"in_app", "push"}


def test_allowed_channels_when_prefs_none() -> None:
    # If we pass None we use full defaults
    assert allowed_channels_for(None, "x") == {"in_app", "email", "push"}


# ---------------------------------------------------------------------------
# Dispatcher integration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dispatcher_skips_channels_disabled_by_prefs(app_with_db) -> None:
    _app, sf = app_with_db
    async with sf() as db:
        user = User(email="u@u.u", name="U", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id
        prefs = await get_or_create_preferences(db, user_id=uid)
        prefs.email_enabled = False
        prefs.push_enabled = False
        await db.commit()

    rec_email = _Recording("email")
    rec_push = _Recording("push")
    rec_inapp = _Recording("in_app")
    dispatcher = NotificationDispatcher(channels=[rec_inapp, rec_email, rec_push])

    async with sf() as db:
        n = await dispatcher.dispatch(
            db, user_id=uid, type="alert.over_budget", title="t", body="b"
        )

    assert set(n.channels_dispatched) == {"in_app"}
    assert rec_email.sent == []
    assert rec_push.sent == []
    assert len(rec_inapp.sent) == 1


@pytest.mark.asyncio
async def test_dispatcher_explicit_channels_intersect_with_prefs(app_with_db) -> None:
    _app, sf = app_with_db
    async with sf() as db:
        user = User(email="u@u.u", name="U", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id
        prefs = await get_or_create_preferences(db, user_id=uid)
        prefs.email_enabled = False
        await db.commit()

    rec_email = _Recording("email")
    rec_inapp = _Recording("in_app")
    dispatcher = NotificationDispatcher(channels=[rec_inapp, rec_email])

    async with sf() as db:
        # Caller asked for email + in_app, but user disabled email
        n = await dispatcher.dispatch(
            db,
            user_id=uid,
            type="t",
            title="t",
            body="",
            channels=["in_app", "email"],
        )

    assert set(n.channels_dispatched) == {"in_app"}
    assert rec_email.sent == []


@pytest.mark.asyncio
async def test_dispatcher_per_type_override(app_with_db) -> None:
    _app, sf = app_with_db
    async with sf() as db:
        user = User(email="u@u.u", name="U", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id
        prefs = await get_or_create_preferences(db, user_id=uid)
        prefs.type_overrides = {"alert.weather_risk": {"push": False}}
        await db.commit()

    rec_push = _Recording("push")
    rec_inapp = _Recording("in_app")
    dispatcher = NotificationDispatcher(channels=[rec_inapp, rec_push])

    async with sf() as db:
        n = await dispatcher.dispatch(
            db, user_id=uid, type="alert.weather_risk", title="t", body=""
        )
    assert "push" not in n.channels_dispatched

    async with sf() as db:
        n2 = await dispatcher.dispatch(
            db, user_id=uid, type="alert.over_budget", title="t", body=""
        )
    assert "push" in n2.channels_dispatched


@pytest.mark.asyncio
async def test_dispatcher_creates_prefs_lazily_for_new_user(app_with_db) -> None:
    """A user with no prefs row should still get full default delivery."""
    _app, sf = app_with_db
    async with sf() as db:
        user = User(email="new@u.u", name="U", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    rec_email = _Recording("email")
    rec_inapp = _Recording("in_app")
    rec_push = _Recording("push")
    dispatcher = NotificationDispatcher(channels=[rec_inapp, rec_email, rec_push])

    async with sf() as db:
        n = await dispatcher.dispatch(
            db, user_id=uid, type="t", title="t", body=""
        )
    assert set(n.channels_dispatched) == {"in_app", "email", "push"}


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_preferences_returns_defaults(client: AsyncClient) -> None:
    token, _ = await _register(client)
    resp = await client.get(
        "/api/v1/notifications/preferences",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["error"] is None
    assert body["data"]["in_app_enabled"] is True
    assert body["data"]["email_enabled"] is True
    assert body["data"]["push_enabled"] is True
    assert body["data"]["type_overrides"] in (None, {})


@pytest.mark.asyncio
async def test_get_preferences_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/notifications/preferences")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_update_preferences(client: AsyncClient) -> None:
    token, _ = await _register(client)
    resp = await client.put(
        "/api/v1/notifications/preferences",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "in_app_enabled": True,
            "email_enabled": False,
            "push_enabled": True,
            "type_overrides": {"alert.weather_risk": {"push": False}},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["email_enabled"] is False
    assert body["data"]["type_overrides"] == {
        "alert.weather_risk": {"push": False}
    }

    # Round-trip via GET
    get_resp = await client.get(
        "/api/v1/notifications/preferences",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_resp.json()["data"]["email_enabled"] is False


@pytest.mark.asyncio
async def test_update_preferences_partial(client: AsyncClient) -> None:
    token, _ = await _register(client)
    # Only change email
    resp = await client.put(
        "/api/v1/notifications/preferences",
        headers={"Authorization": f"Bearer {token}"},
        json={"email_enabled": False},
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["email_enabled"] is False
    assert body["in_app_enabled"] is True
    assert body["push_enabled"] is True


@pytest.mark.asyncio
async def test_update_preferences_rejects_unknown_channel_in_override(
    client: AsyncClient,
) -> None:
    token, _ = await _register(client)
    resp = await client.put(
        "/api/v1/notifications/preferences",
        headers={"Authorization": f"Bearer {token}"},
        json={"type_overrides": {"alert.x": {"sms": True}}},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_end_to_end_dispatch_respects_user_prefs(
    app_with_db, client: AsyncClient
) -> None:
    _app, sf = app_with_db
    token, uid = await _register(client)
    # User disables email
    await client.put(
        "/api/v1/notifications/preferences",
        headers={"Authorization": f"Bearer {token}"},
        json={"email_enabled": False},
    )

    dispatcher = NotificationDispatcher(
        channels=[InAppChannel(), EmailChannel(), PushChannel()]
    )
    async with sf() as db:
        n = await dispatcher.dispatch(
            db, user_id=uuid.UUID(uid), type="t", title="t", body=""
        )
    assert "email" not in n.channels_dispatched
    assert "in_app" in n.channels_dispatched
    assert "push" in n.channels_dispatched

    async with sf() as db:
        rows = (await db.execute(select(Notification))).scalars().all()
        assert len(rows) == 1
