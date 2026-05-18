"""Tests for the ConversationalAIProvider interface and Personaplex endpoint."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.services.voice.conversation import (
    ConversationalAIProvider,
    ConversationMessage,
    ConversationReply,
    FakeConversationalAIProvider,
    get_conversational_ai_provider,
)


@pytest_asyncio.fixture
async def client_with_fake_persona():
    app = create_app()
    fake = FakeConversationalAIProvider(reply_text="Schedule looks good.")
    app.dependency_overrides[get_conversational_ai_provider] = lambda: fake
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, fake


def test_provider_is_abstract():
    with pytest.raises(TypeError):
        ConversationalAIProvider()  # type: ignore[abstract]


@pytest.mark.asyncio
async def test_fake_persona_returns_reply_and_records_history():
    fake = FakeConversationalAIProvider(reply_text="hi")
    messages = [ConversationMessage(role="user", content="hello")]
    reply = await fake.reply(messages=messages, system_prompt="you are foreman")
    assert isinstance(reply, ConversationReply)
    assert reply.text == "hi"
    assert reply.reasoning  # non-empty reasoning
    assert fake.last_messages == messages
    assert fake.last_system_prompt == "you are foreman"


@pytest.mark.asyncio
async def test_chat_endpoint_returns_reply(client_with_fake_persona):
    client, fake = client_with_fake_persona
    payload = {
        "messages": [
            {"role": "user", "content": "What's on the schedule today?"},
        ],
    }
    resp = await client.post("/api/v1/voice/chat", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["error"] is None
    assert body["data"]["reply"] == "Schedule looks good."
    # AI planning convention: human-readable reasoning string per decision.
    assert isinstance(body["data"]["reasoning"], str)
    assert body["data"]["reasoning"]
    assert fake.calls == 1


@pytest.mark.asyncio
async def test_chat_endpoint_rejects_empty_messages(client_with_fake_persona):
    client, _ = client_with_fake_persona
    resp = await client.post("/api/v1/voice/chat", json={"messages": []})
    assert resp.status_code == 422 or resp.status_code == 400


@pytest.mark.asyncio
async def test_chat_endpoint_rejects_invalid_role(client_with_fake_persona):
    client, _ = client_with_fake_persona
    payload = {"messages": [{"role": "wizard", "content": "hi"}]}
    resp = await client.post("/api/v1/voice/chat", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_chat_endpoint_passes_system_prompt(client_with_fake_persona):
    client, fake = client_with_fake_persona
    payload = {
        "messages": [{"role": "user", "content": "Hi"}],
        "system_prompt": "You are a Dutch construction site assistant.",
    }
    resp = await client.post("/api/v1/voice/chat", json=payload)
    assert resp.status_code == 200
    assert fake.last_system_prompt == "You are a Dutch construction site assistant."


@pytest.mark.asyncio
async def test_chat_endpoint_returns_502_on_provider_error():
    app = create_app()

    class BrokenPersona(ConversationalAIProvider):
        async def reply(self, messages, system_prompt=None):
            raise RuntimeError("nv api down")

    app.dependency_overrides[get_conversational_ai_provider] = lambda: BrokenPersona()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {"messages": [{"role": "user", "content": "hi"}]}
        resp = await ac.post("/api/v1/voice/chat", json=payload)
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "CONVERSATION_FAILED"


def test_default_factory_returns_provider():
    assert isinstance(get_conversational_ai_provider(), ConversationalAIProvider)
