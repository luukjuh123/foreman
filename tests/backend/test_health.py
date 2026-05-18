"""Tests for the /healthz endpoint."""

import pytest


@pytest.mark.asyncio
async def test_health_check(client) -> None:
    response = await client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "foreman"
