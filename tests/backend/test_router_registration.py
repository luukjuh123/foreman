"""Tests verifying all expected routers are registered in the FastAPI app."""

import pytest
from app.main import create_app

EXPECTED_PREFIXES = [
    "/api/v1/weather",
    "/api/v1/subcontractors",
    "/api/v1/equipment",
    "/api/v1/webhooks",
]


@pytest.fixture
def app():
    return create_app()


def test_weather_router_registered(app):
    paths = [route.path for route in app.routes]
    assert any(p.startswith("/api/v1/weather") for p in paths), (
        "weather router not registered — no routes with prefix /api/v1/weather"
    )


def test_subcontractors_router_registered(app):
    paths = [route.path for route in app.routes]
    assert any(p.startswith("/api/v1/subcontractors") for p in paths), (
        "subcontractors router not registered — no routes with prefix /api/v1/subcontractors"
    )


def test_equipment_router_registered(app):
    paths = [route.path for route in app.routes]
    assert any(p.startswith("/api/v1/equipment") for p in paths), (
        "equipment router not registered — no routes with prefix /api/v1/equipment"
    )


def test_webhooks_router_registered(app):
    paths = [route.path for route in app.routes]
    assert any(p.startswith("/api/v1/webhooks") for p in paths), (
        "webhooks router not registered — no routes with prefix /api/v1/webhooks"
    )


def test_all_expected_prefixes_registered(app):
    """Single test that checks all four missing routers at once."""
    paths = [route.path for route in app.routes]
    missing = [
        prefix for prefix in EXPECTED_PREFIXES
        if not any(p.startswith(prefix) for p in paths)
    ]
    assert not missing, f"Routers not registered: {missing}"
