"""E2E integration tests for billing flows.

Covers:
1. Free tier on signup — subscription created with trial
2. Project limit enforcement — free tier blocks at limit
3. Invoice lifecycle — create → list → detail → status transitions
4. Invoice totals & VAT — multiple lines with different VAT rates
5. Invoice from project — auto-build lines from project materials/labor
6. Subscription upgrade flow — checkout → webhook activates paid tier
7. Usage metering — counter increments on project create
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.material import Material
from app.models.project import Phase, Project, Task
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier
from app.models.usage import UsageCounter
from app.routers import invoices as invoices_router
from app.services.billing.providers import get_payment_provider
from app.services.billing.providers.fake import FakePaymentProvider

TEST_DB_URL = "sqlite+aiosqlite://"
WEBHOOK_SECRET = "e2e-webhook-secret"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app = create_app()

    # Mount the invoices router — not included in main.py yet.
    app.include_router(
        invoices_router.router, prefix="/api/v1/invoices", tags=["invoices"]
    )

    async def override_get_db():
        async with session_factory() as session:
            yield session

    fake_provider = FakePaymentProvider(webhook_secret=WEBHOOK_SECRET)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_payment_provider] = lambda: fake_provider
    app.state.test_session_factory = session_factory
    app.state.test_provider = fake_provider
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        ac._app = app_with_db
        yield ac


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, email: str = "user@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test User", "password": "testpass123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_customer(client: AsyncClient, headers: dict) -> dict:
    resp = await client.post(
        "/api/v1/invoices/customers",
        json={
            "name": "ACME B.V.",
            "email": "billing@acme.example",
            "kvk_number": "12345678",
            "vat_number": "NL123456789B01",
            "address_line1": "Hoofdstraat 1",
            "postal_code": "1011AA",
            "city": "Amsterdam",
            "country_code": "NL",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _sign(payload: bytes, secret: str = WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


async def _expire_trial(session_factory, project_limit: int = 1) -> None:
    """Force subscription out of trial so tier limits apply."""
    from datetime import UTC, datetime, timedelta

    async with session_factory() as session:
        result = await session.execute(select(Subscription))
        sub = result.scalar_one()
        sub.status = SubscriptionStatus.ACTIVE.value
        sub.project_limit = project_limit
        sub.trial_ends_at = datetime.now(UTC) - timedelta(days=1)
        await session.commit()


async def _upgrade_to_pro(session_factory) -> None:
    async with session_factory() as s:
        sub = (await s.execute(select(Subscription))).scalar_one()
        sub.tier = SubscriptionTier.PRO.value
        sub.project_limit = None
        await s.commit()


# ---------------------------------------------------------------------------
# 1. Free tier on signup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_free_tier_on_signup(client: AsyncClient) -> None:
    """Registration auto-creates a FREE subscription in TRIALING state with trial dates."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    resp = await client.get("/api/v1/billing/subscription", headers=headers)
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["tier"] == SubscriptionTier.FREE.value
    assert body["status"] == SubscriptionStatus.TRIALING.value
    assert body["project_limit"] is None  # no limit during trial
    assert body["trial_ends_at"] is not None


# ---------------------------------------------------------------------------
# 2. Project limit enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_project_limit_enforced_after_trial(app_with_db, client: AsyncClient) -> None:
    """Free tier allows 1 project; second create returns 402 once trial expires."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    await _expire_trial(app_with_db.state.test_session_factory, project_limit=1)

    r1 = await client.post("/api/v1/projects/", json={"name": "First"}, headers=headers)
    assert r1.status_code == 201

    r2 = await client.post("/api/v1/projects/", json={"name": "Second"}, headers=headers)
    assert r2.status_code == 402
    assert "limit" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_project_limit_not_enforced_during_trial(client: AsyncClient) -> None:
    """During trial, project creation succeeds even on free tier."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # No trial expiry — subscription stays TRIALING with no limit.
    r1 = await client.post("/api/v1/projects/", json={"name": "First"}, headers=headers)
    assert r1.status_code == 201

    r2 = await client.post("/api/v1/projects/", json={"name": "Second"}, headers=headers)
    assert r2.status_code == 201


# ---------------------------------------------------------------------------
# 3. Invoice lifecycle: create → list → detail → status transitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoice_lifecycle(client: AsyncClient) -> None:
    """Full invoice flow: create customer → create invoice → list → get → draft→sent→paid."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    customer = await _create_customer(client, headers)

    # Create invoice
    create_resp = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": customer["id"],
            "issue_date": "2025-01-15",
            "payment_terms_days": 30,
            "notes": "Bedankt voor uw opdracht.",
            "lines": [
                {
                    "description": "Dakdekken uur",
                    "quantity": 8.0,
                    "unit": "uur",
                    "unit_price_cents": 6500,
                    "vat_rate_bp": 2100,
                }
            ],
        },
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    invoice = create_resp.json()
    invoice_id = invoice["id"]
    assert invoice["status"] == "draft"
    assert invoice["customer_id"] == customer["id"]
    assert invoice["subtotal_cents"] == 52000  # 8 × 6500
    assert invoice["notes"] == "Bedankt voor uw opdracht."

    # List invoices
    list_resp = await client.get("/api/v1/invoices/", headers=headers)
    assert list_resp.status_code == 200, list_resp.text
    body = list_resp.json()
    assert body["total"] == 1
    assert body["page"] == 1
    assert len(body["data"]) == 1

    # Get invoice detail
    detail_resp = await client.get(f"/api/v1/invoices/{invoice_id}", headers=headers)
    assert detail_resp.status_code == 200, detail_resp.text
    detail = detail_resp.json()
    assert detail["id"] == invoice_id
    assert len(detail["lines"]) == 1

    # Transition: draft → sent
    sent_resp = await client.post(
        f"/api/v1/invoices/{invoice_id}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    assert sent_resp.status_code == 200, sent_resp.text
    assert sent_resp.json()["status"] == "sent"
    assert sent_resp.json()["sent_at"] is not None

    # Transition: sent → paid
    paid_resp = await client.post(
        f"/api/v1/invoices/{invoice_id}/transition",
        json={"status": "paid"},
        headers=headers,
    )
    assert paid_resp.status_code == 200, paid_resp.text
    assert paid_resp.json()["status"] == "paid"
    assert paid_resp.json()["paid_at"] is not None

    # Terminal state — cannot transition paid → sent
    bad_resp = await client.post(
        f"/api/v1/invoices/{invoice_id}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    assert bad_resp.status_code == 409


# ---------------------------------------------------------------------------
# 4. Invoice totals & VAT
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoice_vat_totals(client: AsyncClient) -> None:
    """Multiple lines at different VAT rates; totals match expected cents."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    customer = await _create_customer(client, headers)

    resp = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": customer["id"],
            "issue_date": "2025-03-01",
            "payment_terms_days": 14,
            "lines": [
                {
                    # 21% VAT: 2 × 10000 = 20000 net, VAT = 4200
                    "description": "Dakpannen",
                    "quantity": 2.0,
                    "unit": "m2",
                    "unit_price_cents": 10000,
                    "vat_rate_bp": 2100,
                },
                {
                    # 9% VAT: 3 × 5000 = 15000 net, VAT = 1350
                    "description": "Schilderwerk",
                    "quantity": 3.0,
                    "unit": "uur",
                    "unit_price_cents": 5000,
                    "vat_rate_bp": 900,
                },
                {
                    # 0% VAT: 1 × 8000 = 8000 net, VAT = 0
                    "description": "Export levering",
                    "quantity": 1.0,
                    "unit": "piece",
                    "unit_price_cents": 8000,
                    "vat_rate_bp": 0,
                },
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    # Subtotal = 20000 + 15000 + 8000 = 43000
    assert body["subtotal_cents"] == 43000
    # VAT total = 4200 + 1350 + 0 = 5550
    assert body["vat_total_cents"] == 5550
    # Grand total = 43000 + 5550 = 48550
    assert body["total_cents"] == 48550

    # Verify individual line VAT amounts
    lines = sorted(body["lines"], key=lambda l: l["position"])
    assert lines[0]["line_net_cents"] == 20000
    assert lines[0]["line_vat_cents"] == 4200
    assert lines[1]["line_net_cents"] == 15000
    assert lines[1]["line_vat_cents"] == 1350
    assert lines[2]["line_net_cents"] == 8000
    assert lines[2]["line_vat_cents"] == 0


# ---------------------------------------------------------------------------
# 5. Invoice from project
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoice_from_project(app_with_db, client: AsyncClient) -> None:
    """Create a project with material + labor cost, then auto-build an invoice from it."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # Need unlimited projects — upgrade to PRO.
    await _upgrade_to_pro(app_with_db.state.test_session_factory)

    customer = await _create_customer(client, headers)

    # Create project via HTTP
    proj_resp = await client.post(
        "/api/v1/projects/", json={"name": "Dakdekken A'dam"}, headers=headers
    )
    assert proj_resp.status_code == 201, proj_resp.text
    project_id = proj_resp.json()["id"]

    # Add phase + task with labor cost via HTTP (projects router is mounted)
    phase_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases",
        json={"name": "Fase 1", "position": 0},
        headers=headers,
    )
    assert phase_resp.status_code == 201, phase_resp.text
    phase_id = phase_resp.json()["id"]

    task_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
        json={"name": "Dakpannen leggen", "position": 0, "labor_cost_cents": 15000},
        headers=headers,
    )
    assert task_resp.status_code == 201, task_resp.text
    task_id = uuid.UUID(task_resp.json()["id"])

    # Insert material directly via DB — no HTTP route for task materials
    sf = app_with_db.state.test_session_factory
    async with sf() as session:
        mat = Material(
            task_id=task_id,
            name="Dakpannen",
            quantity=50.0,
            unit="stuks",
            unit_price_cents=300,
        )
        session.add(mat)
        await session.commit()

    # Generate invoice from project
    from_proj_resp = await client.post(
        f"/api/v1/invoices/from-project/{project_id}",
        json={
            "customer_id": customer["id"],
            "issue_date": "2025-06-01",
            "payment_terms_days": 30,
            "default_vat_rate_bp": 2100,
            "include_materials": True,
            "include_labor": True,
        },
        headers=headers,
    )
    assert from_proj_resp.status_code == 201, from_proj_resp.text
    inv = from_proj_resp.json()
    assert inv["project_id"] == project_id
    assert inv["status"] == "draft"
    # Should have 2 lines: 1 material + 1 labor
    assert len(inv["lines"]) == 2

    descriptions = {line["description"] for line in inv["lines"]}
    # Material line uses material name; labor line uses "Arbeid — <task name>"
    assert "Dakpannen" in descriptions
    labor_desc = next(d for d in descriptions if d != "Dakpannen")
    assert "Dakpannen leggen" in labor_desc

    # Material net: 50 × 300 = 15000; labor net: 1 × 15000 = 15000 → subtotal 30000
    assert inv["subtotal_cents"] == 30000


# ---------------------------------------------------------------------------
# 6. Subscription upgrade flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subscription_upgrade_via_checkout_and_webhook(
    app_with_db, client: AsyncClient
) -> None:
    """POST checkout (starter) → webhook active event → subscription marked ACTIVE PRO."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # Verify initial state
    sub_resp = await client.get("/api/v1/billing/subscription", headers=headers)
    assert sub_resp.json()["tier"] == "free"

    # Initiate checkout for PRO tier
    co_resp = await client.post(
        "/api/v1/billing/checkout", json={"tier": "pro"}, headers=headers
    )
    assert co_resp.status_code == 200, co_resp.text
    co_body = co_resp.json()
    assert co_body["checkout_url"].startswith("http")
    provider_sub_id = co_body["provider_subscription_id"]

    # Simulate provider webhook: payment succeeded, subscription active
    payload = json.dumps({"id": provider_sub_id, "status": "active"}).encode()
    sig = _sign(payload)
    webhook_resp = await client.post(
        "/api/v1/billing/webhook/mollie",
        content=payload,
        headers={"X-Mollie-Signature": sig, "Content-Type": "application/json"},
    )
    assert webhook_resp.status_code == 200, webhook_resp.text
    assert webhook_resp.json()["data"]["acknowledged"] is True

    # Subscription should now be ACTIVE / PRO
    sf = app_with_db.state.test_session_factory
    async with sf() as session:
        sub = (await session.execute(select(Subscription))).scalar_one()
        assert sub.status == SubscriptionStatus.ACTIVE.value
        assert sub.tier == SubscriptionTier.PRO.value
        assert sub.project_limit is None  # PRO = unlimited


@pytest.mark.asyncio
async def test_checkout_rejects_free_tier(client: AsyncClient) -> None:
    """Checkout endpoint returns 400 when requesting the FREE tier."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    resp = await client.post(
        "/api/v1/billing/checkout", json={"tier": "free"}, headers=headers
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_webhook_cancellation_downgrades_subscription(
    app_with_db, client: AsyncClient
) -> None:
    """Cancellation webhook sets status=CANCELLED and tier=FREE."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    co = await client.post(
        "/api/v1/billing/checkout", json={"tier": "starter"}, headers=headers
    )
    sub_id = co.json()["provider_subscription_id"]

    # Activate first
    p_active = json.dumps({"id": sub_id, "status": "active"}).encode()
    await client.post(
        "/api/v1/billing/webhook/mollie",
        content=p_active,
        headers={"X-Mollie-Signature": _sign(p_active)},
    )

    # Then cancel
    p_cancel = json.dumps({"id": sub_id, "status": "cancelled"}).encode()
    cancel_resp = await client.post(
        "/api/v1/billing/webhook/mollie",
        content=p_cancel,
        headers={"X-Mollie-Signature": _sign(p_cancel)},
    )
    assert cancel_resp.status_code == 200

    sf = app_with_db.state.test_session_factory
    async with sf() as session:
        sub = (
            await session.execute(
                select(Subscription).where(
                    Subscription.provider_subscription_id == sub_id
                )
            )
        ).scalar_one()
        assert sub.status == SubscriptionStatus.CANCELLED.value
        assert sub.tier == SubscriptionTier.FREE.value


# ---------------------------------------------------------------------------
# 7. Usage metering
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_usage_counter_created_on_registration(
    app_with_db, client: AsyncClient
) -> None:
    """Registration creates a usage counter with project_count=0."""
    await _register(client)
    sf = app_with_db.state.test_session_factory
    async with sf() as session:
        counter = (await session.execute(select(UsageCounter))).scalar_one()
        assert counter.project_count == 0
        assert counter.user_count == 1
        assert counter.storage_bytes == 0


@pytest.mark.asyncio
async def test_usage_counter_increments_on_project_create(
    app_with_db, client: AsyncClient
) -> None:
    """Creating a project bumps project_count; deleting it decrements it."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # Upgrade to paid so project limit doesn't block.
    await _upgrade_to_pro(app_with_db.state.test_session_factory)

    # Check initial usage via API
    usage_resp = await client.get("/api/v1/billing/usage", headers=headers)
    assert usage_resp.status_code == 200, usage_resp.text
    assert usage_resp.json()["project_count"] == 0

    # Create two projects
    r1 = await client.post("/api/v1/projects/", json={"name": "Alpha"}, headers=headers)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/projects/", json={"name": "Beta"}, headers=headers)
    assert r2.status_code == 201
    project_id = r2.json()["id"]

    # Usage should reflect both projects
    usage_resp2 = await client.get("/api/v1/billing/usage", headers=headers)
    assert usage_resp2.json()["project_count"] == 2

    # Delete one project — count should drop
    del_resp = await client.delete(f"/api/v1/projects/{project_id}", headers=headers)
    assert del_resp.status_code == 204

    sf = app_with_db.state.test_session_factory
    async with sf() as session:
        counter = (await session.execute(select(UsageCounter))).scalar_one()
        assert counter.project_count == 1


@pytest.mark.asyncio
async def test_invoice_list_status_filter(client: AsyncClient) -> None:
    """List endpoint status filter returns only matching invoices."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    customer = await _create_customer(client, headers)

    base_invoice = {
        "customer_id": customer["id"],
        "issue_date": "2025-04-01",
        "payment_terms_days": 30,
        "lines": [
            {
                "description": "Test line",
                "quantity": 1.0,
                "unit": "piece",
                "unit_price_cents": 1000,
                "vat_rate_bp": 2100,
            }
        ],
    }

    # Create 2 invoices; send one
    r1 = await client.post("/api/v1/invoices/", json=base_invoice, headers=headers)
    inv1_id = r1.json()["id"]
    await client.post("/api/v1/invoices/", json=base_invoice, headers=headers)

    await client.post(
        f"/api/v1/invoices/{inv1_id}/transition",
        json={"status": "sent"},
        headers=headers,
    )

    # Filter by draft — should return 1
    draft_resp = await client.get(
        "/api/v1/invoices/?status=draft", headers=headers
    )
    assert draft_resp.status_code == 200
    assert draft_resp.json()["total"] == 1

    # Filter by sent — should return 1
    sent_resp = await client.get(
        "/api/v1/invoices/?status=sent", headers=headers
    )
    assert sent_resp.status_code == 200
    assert sent_resp.json()["total"] == 1
