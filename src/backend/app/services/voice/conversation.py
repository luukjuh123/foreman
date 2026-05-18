"""Conversational AI provider — Nvidia Personaplex behind a swappable interface.

The voice chat endpoint depends on a `ConversationalAIProvider`. Production
deployments inject a Personaplex-backed implementation; tests inject the
`FakeConversationalAIProvider` to keep behavior deterministic.

All replies expose a `reasoning` field per the foreman AI planning convention.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

ConversationRole = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class ConversationMessage:
    role: ConversationRole
    content: str


@dataclass(frozen=True)
class ConversationReply:
    text: str
    reasoning: str
    metadata: dict[str, str] = field(default_factory=dict)


class ConversationalAIProvider(ABC):
    """Abstract conversational AI provider (e.g. Nvidia Personaplex)."""

    @abstractmethod
    async def reply(
        self,
        messages: list[ConversationMessage],
        system_prompt: str | None = None,
    ) -> ConversationReply:
        """Produce a conversational reply for the given message history."""
        ...


class FakeConversationalAIProvider(ConversationalAIProvider):
    """Deterministic in-memory provider used by tests and local dev."""

    def __init__(self, reply_text: str = "OK") -> None:
        self.reply_text = reply_text
        self.calls = 0
        self.last_messages: list[ConversationMessage] | None = None
        self.last_system_prompt: str | None = None

    async def reply(
        self,
        messages: list[ConversationMessage],
        system_prompt: str | None = None,
    ) -> ConversationReply:
        self.calls += 1
        self.last_messages = list(messages)
        self.last_system_prompt = system_prompt
        return ConversationReply(
            text=self.reply_text,
            reasoning=f"fake provider replied after seeing {len(messages)} message(s)",
        )


def get_conversational_ai_provider() -> ConversationalAIProvider:
    """FastAPI dependency. Default to the fake until Personaplex is wired in.

    Override via `app.dependency_overrides` in tests; replace with the real
    Personaplex client once credentials and SDK are available.
    """
    return FakeConversationalAIProvider(reply_text="Acknowledged.")
