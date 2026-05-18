"""Tests for voice command parser — rule-based with LLM fallback."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.services.voice.commands import (
    CommandIntent,
    CommandLLMFallback,
    FakeCommandLLMFallback,
    ParsedCommand,
    get_command_llm_fallback,
    parse_command,
)


# --- Deterministic rule-based parsing ---


@pytest.mark.parametrize(
    "utterance, intent, slots",
    [
        ("create task install kitchen tiles", CommandIntent.CREATE_TASK,
         {"name": "install kitchen tiles"}),
        ("Create a task: paint the hallway", CommandIntent.CREATE_TASK,
         {"name": "paint the hallway"}),
        ("add task fix the roof", CommandIntent.CREATE_TASK,
         {"name": "fix the roof"}),
        ("log 3 hours on tiling", CommandIntent.LOG_HOURS,
         {"hours": 3.0, "task": "tiling"}),
        ("log 2.5 hours on plastering", CommandIntent.LOG_HOURS,
         {"hours": 2.5, "task": "plastering"}),
        ("check schedule", CommandIntent.CHECK_SCHEDULE, {}),
        ("what's on the schedule today", CommandIntent.CHECK_SCHEDULE, {"when": "today"}),
        ("what's on the schedule tomorrow", CommandIntent.CHECK_SCHEDULE, {"when": "tomorrow"}),
        ("show me the schedule for this week", CommandIntent.CHECK_SCHEDULE, {"when": "this_week"}),
    ],
)
def test_rule_based_parsing(utterance, intent, slots):
    result = parse_command(utterance)
    assert isinstance(result, ParsedCommand)
    assert result.intent is intent
    assert result.slots == slots
    assert result.source == "rule"
    assert 0.0 < result.confidence <= 1.0
    assert result.reasoning  # always present


def test_parser_is_case_insensitive_and_strips_whitespace():
    result = parse_command("   CREATE TASK   Install Boiler   ")
    assert result.intent is CommandIntent.CREATE_TASK
    assert result.slots == {"name": "Install Boiler"}


def test_unknown_utterance_returns_unknown_without_fallback():
    result = parse_command("the weather is nice today")
    assert result.intent is CommandIntent.UNKNOWN
    assert result.source == "rule"
    assert result.confidence == 0.0


def test_empty_utterance_returns_unknown():
    result = parse_command("")
    assert result.intent is CommandIntent.UNKNOWN


# --- LLM fallback ---


@pytest.mark.asyncio
async def test_llm_fallback_invoked_when_rules_fail():
    fallback = FakeCommandLLMFallback(
        intent=CommandIntent.CREATE_TASK,
        slots={"name": "build a shed"},
    )
    result = await parse_command_async(
        "yo could you maybe possibly add: build a shed to my list",
        llm_fallback=fallback,
    )
    assert result.intent is CommandIntent.CREATE_TASK
    assert result.slots == {"name": "build a shed"}
    assert result.source == "llm"
    assert fallback.calls == 1


@pytest.mark.asyncio
async def test_llm_fallback_not_invoked_when_rules_succeed():
    fallback = FakeCommandLLMFallback(intent=CommandIntent.UNKNOWN, slots={})
    result = await parse_command_async(
        "create task pour the foundation", llm_fallback=fallback
    )
    assert result.intent is CommandIntent.CREATE_TASK
    assert result.source == "rule"
    assert fallback.calls == 0


# We import the async variant inside the test module to make the interface explicit.
from app.services.voice.commands import parse_command_async  # noqa: E402


# --- Endpoint ---


@pytest_asyncio.fixture
async def client_with_fake_fallback():
    app = create_app()
    fallback = FakeCommandLLMFallback(
        intent=CommandIntent.LOG_HOURS, slots={"hours": 4.0, "task": "painting"}
    )
    app.dependency_overrides[get_command_llm_fallback] = lambda: fallback
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, fallback


@pytest.mark.asyncio
async def test_endpoint_rule_path(client_with_fake_fallback):
    client, fallback = client_with_fake_fallback
    resp = await client.post(
        "/api/v1/voice/command", json={"utterance": "create task install boiler"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["error"] is None
    data = body["data"]
    assert data["intent"] == "create_task"
    assert data["slots"] == {"name": "install boiler"}
    assert data["source"] == "rule"
    assert isinstance(data["reasoning"], str) and data["reasoning"]
    assert fallback.calls == 0


@pytest.mark.asyncio
async def test_endpoint_llm_fallback_path(client_with_fake_fallback):
    client, fallback = client_with_fake_fallback
    resp = await client.post(
        "/api/v1/voice/command",
        json={"utterance": "uhh I worked four hours doing the painting today"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["intent"] == "log_hours"
    assert data["slots"] == {"hours": 4.0, "task": "painting"}
    assert data["source"] == "llm"
    assert fallback.calls == 1


@pytest.mark.asyncio
async def test_endpoint_rejects_empty_utterance(client_with_fake_fallback):
    client, _ = client_with_fake_fallback
    resp = await client.post("/api/v1/voice/command", json={"utterance": "   "})
    assert resp.status_code == 422


def test_default_llm_fallback_factory():
    assert isinstance(get_command_llm_fallback(), CommandLLMFallback)
