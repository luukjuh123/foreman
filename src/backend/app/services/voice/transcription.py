"""Transcription provider interface and implementations.

The voice input endpoint depends on a `TranscriptionProvider`. Production deployments
will inject a Whisper-backed or Nvidia Riva-backed implementation; tests inject the
`FakeTranscriptionProvider` to keep the test suite hermetic and deterministic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TranscriptionResult:
    """Result of a speech-to-text transcription."""

    text: str
    language: str | None = None


class TranscriptionProvider(ABC):
    """Abstract speech-to-text provider."""

    @abstractmethod
    async def transcribe(self, path: Path, content_type: str) -> TranscriptionResult:
        """Transcribe audio at `path`. `content_type` is the upload MIME type."""
        ...


class FakeTranscriptionProvider(TranscriptionProvider):
    """In-memory deterministic provider used by tests and local development.

    Returns the configured text on every call; tracks call count for assertions.
    """

    def __init__(self, text: str = "", language: str | None = None) -> None:
        self.text = text
        self.language = language
        self.calls = 0

    async def transcribe(self, path: Path, content_type: str) -> TranscriptionResult:
        self.calls += 1
        return TranscriptionResult(text=self.text, language=self.language)


def get_transcription_provider() -> TranscriptionProvider:
    """FastAPI dependency. Returns the configured transcription provider.

    Defaults to `FakeTranscriptionProvider` until a real provider is wired in
    (Whisper / Nvidia Riva). Override via `app.dependency_overrides` in tests.
    """
    return FakeTranscriptionProvider(text="", language=None)
