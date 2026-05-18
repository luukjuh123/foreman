"""Tests for customer-facing email notifications.

These cover the three event types required by Phase 11 backend item #2:
- project updates
- invoice sent
- report ready

Implementation lives in `app/services/notifications/customer_emails.py` and
is exposed via HTTP under `/api/v1/notifications/customer/*` so other modules
(or test harnesses) can trigger a templated notification end-to-end.
"""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.notification import Notification
from app.models.user import User
from app.services.notifications.channels import EmailChannel, InAppChannel
from app.services.notifications.customer_emails import (
    notify_invoice_sent,
    notify_project_update,
    notify_report_ready,
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


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "U", "password": "pass1234"},
    )
    token = r.json()["access_token"]
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    return token, me.json()["id"]


# ---------------------------------------------------------------------------
# Service-level: customer_emails functions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_notify_project_update_uses_in_app_and_email(app_with_db) -> None:
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="cust@x.com", name="Cust", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    dispatcher = NotificationDispatcher(channels=[InAppChannel(), EmailChannel()])
    async with session_factory() as db:
        n = await notify_project_update(
            db,
            dispatcher,
            user_id=uid,
            project_id=uuid.uuid4(),
            project_name="Garden Shed",
            update_summary="Phase 2 has been completed.",
        )
    assert n.type == "customer.project_updated"
    assert "Garden Shed" in n.title
    assert "Phase 2 has been completed." in n.body
    assert set(n.channels_dispatched) == {"in_app", "email"}
    assert n.data["project_name"] == "Garden Shed"


@pytest.mark.asyncio
async def test_notify_invoice_sent_includes_amount_in_euros(app_with_db) -> None:
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="c@c.c", name="C", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    dispatcher = NotificationDispatcher(channels=[InAppChannel(), EmailChannel()])
    async with session_factory() as db:
        n = await notify_invoice_sent(
            db,
            dispatcher,
            user_id=uid,
            invoice_id=uuid.uuid4(),
            invoice_number="INV-2026-001",
            amount_cents=12345,
        )
    assert n.type == "customer.invoice_sent"
    # 12345 cents == €123.45 — formatted with two decimals
    assert "€123.45" in n.body
    assert "INV-2026-001" in n.body
    assert n.data["amount_cents"] == 12345
    assert set(n.channels_dispatched) == {"in_app", "email"}


@pytest.mark.asyncio
async def test_notify_report_ready_persists_url(app_with_db) -> None:
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="r@r.r", name="R", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    dispatcher = NotificationDispatcher(channels=[InAppChannel(), EmailChannel()])
    async with session_factory() as db:
        n = await notify_report_ready(
            db,
            dispatcher,
            user_id=uid,
            report_id=uuid.uuid4(),
            report_url="https://reports.example.com/abc",
            report_title="Weekly status",
        )
    assert n.type == "customer.report_ready"
    assert "Weekly status" in n.title
    assert "https://reports.example.com/abc" in n.body
    assert n.data["report_url"] == "https://reports.example.com/abc"


@pytest.mark.asyncio
async def test_notify_rejects_invalid_amount(app_with_db) -> None:
    _app, session_factory = app_with_db
    async with session_factory() as db:
        user = User(email="z@z.z", name="Z", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        uid = user.id

    dispatcher = NotificationDispatcher(channels=[InAppChannel()])
    async with session_factory() as db:
        with pytest.raises(ValueError):
            await notify_invoice_sent(
                db,
                dispatcher,
                user_id=uid,
                invoice_id=uuid.uuid4(),
                invoice_number="X",
                amount_cents=-1,
            )


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_post_project_update_endpoint(app_with_db, client: AsyncClient) -> None:
    _app, session_factory = app_with_db
    token, _ = await _register(client, "owner@x.x")
    _, cust_id = await _register(client, "customer@x.x")

    resp = await client.post(
        "/api/v1/notifications/customer/project-update",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_user_id": cust_id,
            "project_id": str(uuid.uuid4()),
            "project_name": "Roof Repair",
            "update_summary": "Materials arrived",
        },
    )
    assert resp.status_code == 201
    payload = resp.json()["data"]
    assert payload["type"] == "customer.project_updated"
    assert payload["user_id"] == cust_id

    async with session_factory() as db:
        rows = (await db.execute(select(Notification))).scalars().all()
        assert len(rows) == 1
        assert rows[0].title.startswith("Update on")


@pytest.mark.asyncio
async def test_post_invoice_sent_endpoint(client: AsyncClient) -> None:
    token, _ = await _register(client, "biz@x.x")
    _, cust_id = await _register(client, "buyer@x.x")
    resp = await client.post(
        "/api/v1/notifications/customer/invoice-sent",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_user_id": cust_id,
            "invoice_id": str(uuid.uuid4()),
            "invoice_number": "INV-1",
            "amount_cents": 9999,
        },
    )
    assert resp.status_code == 201
    body = resp.json()["data"]
    assert body["type"] == "customer.invoice_sent"
    assert "€99.99" in body["body"]


@pytest.mark.asyncio
async def test_post_report_ready_endpoint(client: AsyncClient) -> None:
    token, _ = await _register(client, "agency@x.x")
    _, cust_id = await _register(client, "client@x.x")
    resp = await client.post(
        "/api/v1/notifications/customer/report-ready",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_user_id": cust_id,
            "report_id": str(uuid.uuid4()),
            "report_url": "https://r.example.com/x",
            "report_title": "Q1 review",
        },
    )
    assert resp.status_code == 201
    body = resp.json()["data"]
    assert "Q1 review" in body["title"]
    assert "https://r.example.com/x" in body["body"]


@pytest.mark.asyncio
async def test_customer_endpoint_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/notifications/customer/project-update",
        json={
            "customer_user_id": str(uuid.uuid4()),
            "project_id": str(uuid.uuid4()),
            "project_name": "X",
            "update_summary": "X",
        },
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_customer_endpoint_404_for_unknown_recipient(client: AsyncClient) -> None:
    token, _ = await _register(client, "boss@x.x")
    resp = await client.post(
        "/api/v1/notifications/customer/project-update",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_user_id": str(uuid.uuid4()),
            "project_id": str(uuid.uuid4()),
            "project_name": "X",
            "update_summary": "Y",
        },
    )
    assert resp.status_code == 404
