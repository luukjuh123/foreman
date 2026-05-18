"""LLM client interface used by AI planning services.

Production code wires an OpenAI-backed implementation; tests use a fake.
The interface is intentionally tiny — a single `complete_json` method that
returns a parsed dict — so callers don't depend on any vendor SDK.
"""

from __future__ import annotations

import json
import os
from typing import Any, Protocol


class LLMClient(Protocol):
    """Minimal LLM interface — returns a parsed JSON object."""

    async def complete_json(self, system: str, user: str) -> dict[str, Any]:
        """Return a JSON object produced by the LLM for the given prompt."""
        ...


class StaticLLMClient:
    """LLM client that always returns the same canned response.

    Useful as a safe default when no real client is configured (e.g. local
    development without an API key) and as a fixture base in tests.
    """

    def __init__(self, response: dict[str, Any] | None = None) -> None:
        self._response = response or {}

    async def complete_json(self, system: str, user: str) -> dict[str, Any]:  # noqa: ARG002
        return dict(self._response)


class OpenAILLMClient:
    """OpenAI-backed LLM client. Lazily imports the SDK so tests don't need it."""

    def __init__(self, *, model: str | None = None, api_key: str | None = None) -> None:
        self._model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")

    async def complete_json(self, system: str, user: str) -> dict[str, Any]:
        from openai import AsyncOpenAI  # local import — keeps import-time cheap

        client = AsyncOpenAI(api_key=self._api_key)
        resp = await client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)
