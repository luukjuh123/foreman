"""Tests for the webhook system — configurable HTTP callbacks on project/invoice/report events."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from unittest.mock import AsyncMock, patch

from app.core.database import Base, get_db
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
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


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/api/v1/auth/register",
        json={"name": "Webhook User", "email": "webhook@test.com", "password": "Wh00kP@ss!"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "webhook@test.com", "password": "Wh00kP@ss!"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Webhook model / service unit tests
# ---------------------------------------------------------------------------

class TestWebhookService:
    """Unit tests for the WebhookDelivery service."""

    @pytest.mark.asyncio
    async def test_deliver_calls_target_url(self) -> None:
        from app.services.webhooks.delivery import deliver_webhook

        mock_post = AsyncMock(return_value=AsyncMock(status_code=200))
        with patch("app.services.webhooks.delivery.httpx.AsyncClient") as mock_client_cls:
            mock_client_cls.return_value.__aenter__ = AsyncMock(
                return_value=AsyncMock(post=mock_post)
            )
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            await deliver_webhook(
                url="https://example.com/hook",
                event="project.created",
                payload={"project_id": "abc"},
                secret=None,
            )
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        assert call_kwargs[0][0] == "https://example.com/hook" or call_kwargs[1].get("url") == "https://example.com/hook"

    @pytest.mark.asyncio
    async def test_deliver_sends_hmac_signature_when_secret_set(self) -> None:
        from app.services.webhooks.delivery import deliver_webhook

        captured_headers: dict = {}

        async def fake_post(url: str, **kwargs: object) -> AsyncMock:
            captured_headers.update(kwargs.get("headers", {}))
            m = AsyncMock()
            m.status_code = 200
            return m

        with patch("app.services.webhooks.delivery.httpx.AsyncClient") as mock_client_cls:
            mock_client_cls.return_value.__aenter__ = AsyncMock(
                return_value=AsyncMock(post=fake_post)
            )
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            await deliver_webhook(
                url="https://example.com/hook",
                event="invoice.paid",
                payload={"invoice_id": "xyz"},
                secret="mysecret",
            )

        assert "X-Foreman-Signature" in captured_headers

    def test_compute_signature_is_deterministic(self) -> None:
        from app.services.webhooks.delivery import compute_signature

        sig1 = compute_signature(b'{"key": "val"}', "secret")
        sig2 = compute_signature(b'{"key": "val"}', "secret")
        assert sig1 == sig2

    def test_compute_signature_differs_for_different_secrets(self) -> None:
        from app.services.webhooks.delivery import compute_signature

        body = b'{"key": "val"}'
        assert compute_signature(body, "secret1") != compute_signature(body, "secret2")


# ---------------------------------------------------------------------------
# Webhook CRUD API tests
# ---------------------------------------------------------------------------

class TestWebhookCRUD:
    @pytest.mark.asyncio
    async def test_create_webhook_returns_201(self, client: AsyncClient, auth_headers: dict) -> None:
        resp = await client.post(
            "/api/v1/webhooks/",
            json={"url": "https://example.com/hook", "events": ["project.created"], "secret": None},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["url"] == "https://example.com/hook"
        assert "project.created" in data["events"]
        assert "id" in data

    @pytest.mark.asyncio
    async def test_list_webhooks_returns_own_webhooks(self, client: AsyncClient, auth_headers: dict) -> None:
        await client.post(
            "/api/v1/webhooks/",
            json={"url": "https://example.com/hook1", "events": ["invoice.paid"], "secret": None},
            headers=auth_headers,
        )
        resp = await client.get("/api/v1/webhooks/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    @pytest.mark.asyncio
    async def test_delete_webhook(self, client: AsyncClient, auth_headers: dict) -> None:
        create_resp = await client.post(
            "/api/v1/webhooks/",
            json={"url": "https://del.example.com/hook", "events": ["report.ready"], "secret": None},
            headers=auth_headers,
        )
        webhook_id = create_resp.json()["id"]
        del_resp = await client.delete(f"/api/v1/webhooks/{webhook_id}", headers=auth_headers)
        assert del_resp.status_code == 204

    @pytest.mark.asyncio
    async def test_create_webhook_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/api/v1/webhooks/",
            json={"url": "https://example.com/hook", "events": ["project.created"], "secret": None},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_create_webhook_validates_url(self, client: AsyncClient, auth_headers: dict) -> None:
        resp = await client.post(
            "/api/v1/webhooks/",
            json={"url": "not-a-url", "events": ["project.created"], "secret": None},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_valid_events_accepted(self, client: AsyncClient, auth_headers: dict) -> None:
        for event in ["project.created", "project.updated", "invoice.paid", "report.ready"]:
            resp = await client.post(
                "/api/v1/webhooks/",
                json={"url": f"https://example.com/{event}", "events": [event], "secret": None},
                headers=auth_headers,
            )
            assert resp.status_code == 201, f"Failed for event {event}: {resp.json()}"
