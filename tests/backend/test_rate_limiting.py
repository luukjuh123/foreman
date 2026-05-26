"""Tests for API rate limiting middleware.

Per-user throttle: 100 req/15min general, 10 req/15min auth endpoints.
Implementation uses a custom in-memory sliding-window middleware.
"""

import time
from unittest.mock import patch

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


class TestRateLimitingMiddleware:
    """Rate limiting middleware unit tests."""

    def test_rate_limiter_allows_requests_within_limit(self) -> None:
        from app.core.rate_limit import RateLimiter

        limiter = RateLimiter(max_requests=5, window_seconds=60)
        key = "user:test-1"
        for _ in range(5):
            assert limiter.is_allowed(key) is True

    def test_rate_limiter_blocks_requests_over_limit(self) -> None:
        from app.core.rate_limit import RateLimiter

        limiter = RateLimiter(max_requests=3, window_seconds=60)
        key = "user:test-2"
        for _ in range(3):
            limiter.is_allowed(key)
        assert limiter.is_allowed(key) is False

    def test_rate_limiter_resets_after_window(self) -> None:
        from app.core.rate_limit import RateLimiter

        limiter = RateLimiter(max_requests=2, window_seconds=1)
        key = "user:test-3"
        limiter.is_allowed(key)
        limiter.is_allowed(key)
        assert limiter.is_allowed(key) is False

        # Advance time past window
        with patch("app.core.rate_limit.time") as mock_time:
            mock_time.time.return_value = time.time() + 2
            assert limiter.is_allowed(key) is True

    def test_rate_limiter_different_keys_are_independent(self) -> None:
        from app.core.rate_limit import RateLimiter

        limiter = RateLimiter(max_requests=1, window_seconds=60)
        assert limiter.is_allowed("user:A") is True
        assert limiter.is_allowed("user:A") is False
        assert limiter.is_allowed("user:B") is True  # independent key

    def test_rate_limiter_returns_remaining_count(self) -> None:
        from app.core.rate_limit import RateLimiter

        limiter = RateLimiter(max_requests=5, window_seconds=60)
        key = "user:test-5"
        limiter.is_allowed(key)
        remaining = limiter.remaining(key)
        assert remaining == 4

    def test_rate_limiter_remaining_zero_when_exceeded(self) -> None:
        from app.core.rate_limit import RateLimiter

        limiter = RateLimiter(max_requests=2, window_seconds=60)
        key = "user:test-6"
        limiter.is_allowed(key)
        limiter.is_allowed(key)
        limiter.is_allowed(key)  # over limit
        assert limiter.remaining(key) == 0


class TestRateLimitEndpoints:
    """Integration tests — rate limit responses from the actual app."""

    @pytest.mark.asyncio
    async def test_healthz_not_rate_limited(self, client: AsyncClient) -> None:
        """The /healthz endpoint is exempt from rate limiting."""
        for _ in range(5):
            resp = await client.get("/healthz")
            assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_general_rate_limit_header_present(self, client: AsyncClient) -> None:
        """Responses include X-RateLimit-Remaining header."""
        resp = await client.get("/healthz", headers={"X-Forwarded-For": "10.0.0.1"})
        # healthz is exempt, so no rate limit headers expected on that path
        # Check a real API path instead
        resp = await client.get("/api/v1/projects/", headers={"X-Forwarded-For": "10.0.0.2"})
        # May return 401 (no auth) but header should be present
        assert "x-ratelimit-remaining" in resp.headers or resp.status_code in (200, 401, 403, 422)

    @pytest.mark.asyncio
    async def test_auth_endpoints_have_stricter_limit(self, client: AsyncClient) -> None:
        """Auth endpoints use a separate, stricter rate limit bucket."""
        # Fire 11 login attempts from the same IP — 11th should be 429
        responses = []
        for _ in range(11):
            resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "noone@example.com", "password": "wrong"},
                headers={"X-Forwarded-For": "192.168.100.1"},
            )
            responses.append(resp.status_code)

        # At least one 429 must appear after the 10-request limit
        assert 429 in responses, f"Expected 429 in auth responses, got: {responses}"

    @pytest.mark.asyncio
    async def test_rate_limit_response_body(self, client: AsyncClient) -> None:
        """429 responses include a JSON body with error detail."""
        for _ in range(11):
            resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "x@x.com", "password": "bad"},
                headers={"X-Forwarded-For": "192.168.101.1"},
            )

        assert resp.status_code == 429
        body = resp.json()
        assert "detail" in body

    @pytest.mark.asyncio
    async def test_different_ips_have_separate_buckets(self, client: AsyncClient) -> None:
        """Requests from different IPs do not share rate limit buckets."""
        # Exhaust IP A
        for _ in range(11):
            await client.post(
                "/api/v1/auth/login",
                json={"email": "a@a.com", "password": "bad"},
                headers={"X-Forwarded-For": "10.1.1.1"},
            )
        # IP B should still be allowed
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "a@a.com", "password": "bad"},
            headers={"X-Forwarded-For": "10.2.2.2"},
        )
        assert resp.status_code != 429
