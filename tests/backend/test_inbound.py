"""Tests for inbound customer-inquiry detection.

Two webhook endpoints (no auth — they accept public traffic from email
forwarders / website forms): `POST /api/inbound/email` and
`POST /api/inbound/form`. Each persists an `InboundInquiry` row and
dispatches a notification to every admin user so a human can triage.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.inbound_inquiry import InboundInquiry
from app.models.notification import Notification
from app.models.user import User
from app.services.notifications.channels import InAppChannel
from app.services.notifications.dispatcher_dep import get_default_dispatcher
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

    # Use an in-app-only dispatcher so tests don't hit network.
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_default_dispatcher] = lambda: NotificationDispatcher(
        channels=[InAppChannel()]
    )
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _make_admin(session_factory, email: str) -> User:
    async with session_factory() as db:
        admin = User(email=email, name="Admin", hashed_password="h", role="admin")
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        return admin


# ---------------------------------------------------------------------------
# Form endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_form_persists_and_notifies_admins(
    app_with_db, client: AsyncClient
) -> None:
    _app, session_factory = app_with_db
    admin1 = await _make_admin(session_factory, "ops1@x.x")
    admin2 = await _make_admin(session_factory, "ops2@x.x")
    # non-admin should NOT receive
    async with session_factory() as db:
        db.add(User(email="random@x.x", name="R", hashed_password="h", role="user"))
        await db.commit()

    resp = await client.post(
        "/api/inbound/form",
        json={
            "name": "Jane Builder",
            "email": "jane@example.com",
            "message": "Could you help with a kitchen remodel?",
            "phone": "+31 6 1234 5678",
        },
    )
    assert resp.status_code == 201
    body = resp.json()["data"]
    assert body["source"] == "form"
    assert body["from_email"] == "jane@example.com"
    assert body["status"] == "new"

    async with session_factory() as db:
        inq = (await db.execute(select(InboundInquiry))).scalars().all()
        assert len(inq) == 1
        assert inq[0].body == "Could you help with a kitchen remodel?"

        notifs = (await db.execute(select(Notification))).scalars().all()
        recipients = {n.user_id for n in notifs}
        assert admin1.id in recipients
        assert admin2.id in recipients
        assert len(notifs) == 2
        assert all(n.type == "inbound.inquiry_received" for n in notifs)
        assert all("jane@example.com" in n.body for n in notifs)


@pytest.mark.asyncio
async def test_post_form_requires_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/inbound/form",
        json={"name": "J", "message": "hi"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_post_form_no_admin_still_persists(
    app_with_db, client: AsyncClient
) -> None:
    """With no admin users, the inquiry must still be persisted (lead capture)."""
    _app, session_factory = app_with_db

    resp = await client.post(
        "/api/inbound/form",
        json={
            "name": "Bob",
            "email": "bob@x.x",
            "message": "anyone home?",
        },
    )
    assert resp.status_code == 201
    async with session_factory() as db:
        rows = (await db.execute(select(InboundInquiry))).scalars().all()
        assert len(rows) == 1
        notifs = (await db.execute(select(Notification))).scalars().all()
        assert notifs == []


@pytest.mark.asyncio
async def test_form_endpoint_does_not_require_auth(client: AsyncClient) -> None:
    # Same as the happy-path — explicitly demonstrating no Authorization header.
    resp = await client.post(
        "/api/inbound/form",
        json={"name": "X", "email": "x@x.x", "message": "Y"},
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Email endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_email_persists_and_notifies(
    app_with_db, client: AsyncClient
) -> None:
    _app, session_factory = app_with_db
    admin = await _make_admin(session_factory, "ops@x.x")

    resp = await client.post(
        "/api/inbound/email",
        json={
            "from_email": "lead@example.com",
            "from_name": "Lead Person",
            "subject": "Quote request",
            "body": "Hi, I would like a quote.",
            "raw": {"headers": {"Message-Id": "<abc@x>"}},
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["source"] == "email"
    assert data["subject"] == "Quote request"

    async with session_factory() as db:
        inq = (await db.execute(select(InboundInquiry))).scalars().one()
        assert inq.from_email == "lead@example.com"
        assert inq.raw == {"headers": {"Message-Id": "<abc@x>"}}

        notif = (await db.execute(select(Notification))).scalars().one()
        assert notif.user_id == admin.id
        assert "Quote request" in notif.title
        assert "lead@example.com" in notif.body


@pytest.mark.asyncio
async def test_post_email_requires_from_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/inbound/email",
        json={"subject": "x", "body": "y"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_post_email_minimal_payload(app_with_db, client: AsyncClient) -> None:
    _app, session_factory = app_with_db
    resp = await client.post(
        "/api/inbound/email",
        json={"from_email": "anon@x.x", "body": "Just a body."},
    )
    assert resp.status_code == 201
    async with session_factory() as db:
        row = (await db.execute(select(InboundInquiry))).scalars().one()
        assert row.subject is None
        assert row.from_name is None
