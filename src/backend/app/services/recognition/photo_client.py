"""Photo recognition service — identify construction process from a site photo.

Defines `PhotoRecognitionClient` Protocol with two implementations:

- `FakePhotoRecognitionClient` — deterministic stub for tests / local dev
- `OpenAIPhotoRecognitionClient` — lazy, env-gated wrapper around the OpenAI
  Vision API; only constructed when `OPENAI_API_KEY` is set and called.

`get_default_client()` picks an implementation based on env. Tests inject the
fake via dependency override.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class RecognitionResult:
    """Outcome of analyzing a site photo."""

    process_slug: str | None
    """Slug of the recognized process (e.g. ``"stucen"``), or ``None`` if unknown."""

    completion_pct: int | None
    """Estimated completion percentage (0-100), or ``None`` if not estimable."""

    reasoning: str
    """Human-readable explanation of the decision (required for AI transparency)."""

    raw: dict
    """Provider-specific raw response payload, preserved for audit."""


@runtime_checkable
class PhotoRecognitionClient(Protocol):
    async def analyze(self, image_url: str) -> RecognitionResult:
        """Analyze a single image. Must always return a RecognitionResult
        (never raise for "unknown" — set fields to None instead)."""
        ...


class FakePhotoRecognitionClient:
    """Deterministic fake: returns whatever was configured at construction.

    Used in tests and as the default when no OpenAI key is configured.
    """

    def __init__(
        self,
        process_slug: str | None = "stucen",
        completion_pct: int | None = 50,
        reasoning: str = "Fake recognition result — no real model invoked.",
    ) -> None:
        self._slug = process_slug
        self._pct = completion_pct
        self._reasoning = reasoning

    async def analyze(self, image_url: str) -> RecognitionResult:
        return RecognitionResult(
            process_slug=self._slug,
            completion_pct=self._pct,
            reasoning=self._reasoning,
            raw={"provider": "fake", "image_url": image_url},
        )


class OpenAIPhotoRecognitionClient:
    """Lazy OpenAI Vision client. Imports + instantiates only on first call."""

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini") -> None:
        self._api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self._model = model
        self._client = None  # lazily initialised

    def _ensure_client(self) -> None:
        if self._client is not None:
            return
        if not self._api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        # Import lazily so tests don't need the SDK or env vars.
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(api_key=self._api_key)

    async def analyze(self, image_url: str) -> RecognitionResult:
        self._ensure_client()
        prompt = (
            "You are a construction site supervisor. Identify the construction "
            "process being performed in the photo (e.g. stucen, tegelen, "
            "schilderen, metselen). Estimate completion as an integer 0-100. "
            "Reply as JSON: {\"process_slug\": str|null, \"completion_pct\": "
            "int|null, \"reasoning\": str}."
        )
        # Real network call — never invoked from tests because get_default_client()
        # returns FakePhotoRecognitionClient when key is missing.
        response = await self._client.chat.completions.create(  # type: ignore[union-attr]
            model=self._model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
            response_format={"type": "json_object"},
        )
        import json

        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)
        return RecognitionResult(
            process_slug=parsed.get("process_slug"),
            completion_pct=parsed.get("completion_pct"),
            reasoning=parsed.get("reasoning", ""),
            raw={"provider": "openai", "model": self._model, "response": parsed},
        )


def get_default_client() -> PhotoRecognitionClient:
    """Return OpenAI client if key is set, otherwise the fake.

    This is the FastAPI dependency producer — tests override it via
    ``app.dependency_overrides[get_default_client]``.
    """

    if os.environ.get("OPENAI_API_KEY"):
        return OpenAIPhotoRecognitionClient()
    return FakePhotoRecognitionClient()
