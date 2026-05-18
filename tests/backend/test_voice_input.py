"""Tests for the voice transcription endpoint and TranscriptionProvider interface."""

import io
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.services.voice.transcription import (
    FakeTranscriptionProvider,
    TranscriptionProvider,
    TranscriptionResult,
    get_transcription_provider,
)


@pytest_asyncio.fixture
async def client_with_fake_provider():
    app = create_app()
    fake = FakeTranscriptionProvider(text="hallo wereld", language="nl")
    app.dependency_overrides[get_transcription_provider] = lambda: fake
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, fake


# --- Provider interface ---


def test_provider_is_abstract():
    with pytest.raises(TypeError):
        TranscriptionProvider()  # type: ignore[abstract]


@pytest.mark.asyncio
async def test_fake_provider_returns_configured_text(tmp_path: Path):
    fake = FakeTranscriptionProvider(text="create a task", language="en")
    audio = tmp_path / "clip.wav"
    audio.write_bytes(b"RIFF....FAKEAUDIO")
    result = await fake.transcribe(audio, content_type="audio/wav")
    assert isinstance(result, TranscriptionResult)
    assert result.text == "create a task"
    assert result.language == "en"
    assert fake.calls == 1


# --- Endpoint ---


@pytest.mark.asyncio
async def test_upload_audio_returns_transcript(client_with_fake_provider):
    client, fake = client_with_fake_provider
    audio_bytes = b"\x00\x01" * 256
    files = {"audio": ("clip.wav", io.BytesIO(audio_bytes), "audio/wav")}
    resp = await client.post("/api/v1/voice/transcribe", files=files)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["error"] is None
    assert body["data"]["text"] == "hallo wereld"
    assert body["data"]["language"] == "nl"
    assert fake.calls == 1


@pytest.mark.asyncio
async def test_upload_rejects_empty_file(client_with_fake_provider):
    client, _ = client_with_fake_provider
    files = {"audio": ("empty.wav", io.BytesIO(b""), "audio/wav")}
    resp = await client.post("/api/v1/voice/transcribe", files=files)
    assert resp.status_code == 400
    body = resp.json()
    assert body["data"] is None
    assert body["error"]["code"] == "EMPTY_AUDIO"


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_content_type(client_with_fake_provider):
    client, _ = client_with_fake_provider
    files = {"audio": ("note.txt", io.BytesIO(b"not audio"), "text/plain")}
    resp = await client.post("/api/v1/voice/transcribe", files=files)
    assert resp.status_code == 415
    body = resp.json()
    assert body["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


@pytest.mark.asyncio
async def test_upload_rejects_oversized_file(client_with_fake_provider):
    client, _ = client_with_fake_provider
    big = b"\x00" * (26 * 1024 * 1024)
    files = {"audio": ("big.wav", io.BytesIO(big), "audio/wav")}
    resp = await client.post("/api/v1/voice/transcribe", files=files)
    assert resp.status_code == 413
    body = resp.json()
    assert body["error"]["code"] == "FILE_TOO_LARGE"


@pytest.mark.asyncio
async def test_temp_file_cleaned_up(client_with_fake_provider, tmp_path: Path, monkeypatch):
    client, _ = client_with_fake_provider
    import tempfile

    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    files = {"audio": ("clip.wav", io.BytesIO(b"\x00" * 128), "audio/wav")}
    resp = await client.post("/api/v1/voice/transcribe", files=files)
    assert resp.status_code == 200

    leftovers = list(tmp_path.glob("foreman-voice-*"))
    assert leftovers == [], f"temp files left behind: {leftovers}"


def test_default_provider_factory_returns_provider():
    provider = get_transcription_provider()
    assert isinstance(provider, TranscriptionProvider)


@pytest.mark.asyncio
async def test_provider_exception_returns_502():
    app = create_app()

    class BrokenProvider(TranscriptionProvider):
        async def transcribe(self, path, content_type):
            raise RuntimeError("upstream down")

    app.dependency_overrides[get_transcription_provider] = lambda: BrokenProvider()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        files = {"audio": ("clip.wav", io.BytesIO(b"\x00" * 64), "audio/wav")}
        resp = await ac.post("/api/v1/voice/transcribe", files=files)
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "TRANSCRIPTION_FAILED"
