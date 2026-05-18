"""Tests for the TTS provider interface and /voice/speak endpoint."""

from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.services.voice.tts import (
    FakeTTSProvider,
    SynthesisResult,
    TTSProvider,
    get_tts_provider,
)


@pytest_asyncio.fixture
async def client_with_fake_tts():
    app = create_app()
    fake = FakeTTSProvider(audio=b"FAKEAUDIO", content_type="audio/wav")
    app.dependency_overrides[get_tts_provider] = lambda: fake
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, fake


def test_provider_is_abstract():
    with pytest.raises(TypeError):
        TTSProvider()  # type: ignore[abstract]


@pytest.mark.asyncio
async def test_fake_provider_synthesizes():
    fake = FakeTTSProvider(audio=b"BYTES", content_type="audio/mpeg")
    result = await fake.synthesize(text="hello world", voice="nl-NL-female")
    assert isinstance(result, SynthesisResult)
    assert result.audio == b"BYTES"
    assert result.content_type == "audio/mpeg"
    assert fake.calls == 1
    assert fake.last_text == "hello world"
    assert fake.last_voice == "nl-NL-female"


@pytest.mark.asyncio
async def test_speak_endpoint_returns_audio(client_with_fake_tts):
    client, fake = client_with_fake_tts
    resp = await client.post(
        "/api/v1/voice/speak",
        json={"text": "Schedule for today: install kitchen tiles."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("audio/wav")
    assert resp.content == b"FAKEAUDIO"
    assert fake.calls == 1


@pytest.mark.asyncio
async def test_speak_endpoint_passes_voice(client_with_fake_tts):
    client, fake = client_with_fake_tts
    resp = await client.post(
        "/api/v1/voice/speak",
        json={"text": "Goedemorgen.", "voice": "nl-NL-male"},
    )
    assert resp.status_code == 200
    assert fake.last_voice == "nl-NL-male"


@pytest.mark.asyncio
async def test_speak_endpoint_rejects_blank_text(client_with_fake_tts):
    client, _ = client_with_fake_tts
    resp = await client.post("/api/v1/voice/speak", json={"text": "   "})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_speak_endpoint_rejects_too_long_text(client_with_fake_tts):
    client, _ = client_with_fake_tts
    resp = await client.post(
        "/api/v1/voice/speak", json={"text": "x" * 5001}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_speak_endpoint_returns_502_on_provider_error():
    app = create_app()

    class BrokenTTS(TTSProvider):
        async def synthesize(self, text, voice=None):
            raise RuntimeError("nv tts down")

    app.dependency_overrides[get_tts_provider] = lambda: BrokenTTS()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/voice/speak", json={"text": "hi"})
    assert resp.status_code == 502
    body = resp.json()
    assert body["data"] is None
    assert body["error"]["code"] == "TTS_FAILED"


def test_default_factory_returns_provider():
    assert isinstance(get_tts_provider(), TTSProvider)
