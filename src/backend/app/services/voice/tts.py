"""TTS provider interface — Whisper/Riva/Personaplex implementations swap in here."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class SynthesisResult:
    audio: bytes
    content_type: str


class TTSProvider(ABC):
    """Abstract text-to-speech provider."""

    @abstractmethod
    async def synthesize(self, text: str, voice: str | None = None) -> SynthesisResult:
        """Render `text` as speech audio. Returns raw bytes + content type."""
        ...


class FakeTTSProvider(TTSProvider):
    """Deterministic in-memory provider used by tests and local dev."""

    def __init__(self, audio: bytes = b"FAKE", content_type: str = "audio/wav") -> None:
        self.audio = audio
        self.content_type = content_type
        self.calls = 0
        self.last_text: str | None = None
        self.last_voice: str | None = None

    async def synthesize(self, text: str, voice: str | None = None) -> SynthesisResult:
        self.calls += 1
        self.last_text = text
        self.last_voice = voice
        return SynthesisResult(audio=self.audio, content_type=self.content_type)


def get_tts_provider() -> TTSProvider:
    """FastAPI dependency. Defaults to the fake provider; override in tests/prod."""
    return FakeTTSProvider(audio=b"", content_type="audio/wav")
