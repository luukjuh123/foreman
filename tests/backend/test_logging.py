"""Tests for structured JSON logging."""

import json
import logging

import pytest

from app.core.logging import JsonFormatter, configure_logging


def test_json_formatter_produces_valid_json() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="hello world",
        args=(),
        exc_info=None,
    )
    output = formatter.format(record)
    parsed = json.loads(output)
    assert parsed["message"] == "hello world"
    assert parsed["level"] == "INFO"
    assert "timestamp" in parsed
    assert parsed["logger"] == "test"


def test_json_formatter_includes_extra_fields() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="foreman.access",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="GET /healthz 200",
        args=(),
        exc_info=None,
    )
    record.method = "GET"  # type: ignore[attr-defined]
    record.path = "/healthz"  # type: ignore[attr-defined]
    record.status_code = 200  # type: ignore[attr-defined]
    record.duration_ms = 1.5  # type: ignore[attr-defined]
    parsed = json.loads(formatter.format(record))
    assert parsed["method"] == "GET"
    assert parsed["path"] == "/healthz"
    assert parsed["status_code"] == 200
    assert parsed["duration_ms"] == 1.5


def test_configure_logging_sets_json_handler() -> None:
    configure_logging("DEBUG")
    root = logging.getLogger()
    assert len(root.handlers) > 0
    assert isinstance(root.handlers[0].formatter, JsonFormatter)


@pytest.mark.asyncio
async def test_request_logging_middleware(client) -> None:
    response = await client.get("/healthz")
    assert response.status_code == 200
