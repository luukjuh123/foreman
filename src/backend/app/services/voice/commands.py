"""Voice command parser — rule-based first, LLM fallback when rules miss.

Rules are deterministic and unit-tested. The LLM fallback is an injectable
interface that wraps an external LLM (OpenAI/Personaplex) for utterances the
rules cannot confidently classify.

Supported intents (initial set):
- CREATE_TASK    -> slots: {name}
- LOG_HOURS      -> slots: {hours: float, task: str}
- CHECK_SCHEDULE -> slots: {when?: "today"|"tomorrow"|"this_week"}
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import StrEnum


class CommandIntent(StrEnum):
    CREATE_TASK = "create_task"
    LOG_HOURS = "log_hours"
    CHECK_SCHEDULE = "check_schedule"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class ParsedCommand:
    intent: CommandIntent
    slots: dict[str, object] = field(default_factory=dict)
    confidence: float = 0.0
    source: str = "rule"  # "rule" or "llm"
    reasoning: str = ""


# --- Rule definitions ---

_CREATE_TASK_RE = re.compile(
    r"^(?:create|add)\s+(?:a\s+)?task[:\s]+(?P<name>.+?)\s*$",
    re.IGNORECASE,
)

_LOG_HOURS_RE = re.compile(
    r"^log\s+(?P<hours>\d+(?:\.\d+)?)\s+hours?\s+on\s+(?P<task>.+?)\s*$",
    re.IGNORECASE,
)

_CHECK_SCHEDULE_PLAIN_RE = re.compile(r"^(?:check|show)\s+(?:my\s+|the\s+)?schedule\s*$", re.IGNORECASE)

_SCHEDULE_WHEN_RE = re.compile(
    r"\b(?:what'?s\s+on\s+the\s+schedule|show\s+(?:me\s+)?(?:the\s+)?schedule(?:\s+for)?)"
    r"\s+(?P<when>today|tomorrow|this\s+week)\s*\??$",
    re.IGNORECASE,
)


def parse_command(utterance: str) -> ParsedCommand:
    """Parse `utterance` using deterministic rules. Never raises.

    Returns `ParsedCommand(intent=UNKNOWN, ...)` if no rule matches.
    """
    text = (utterance or "").strip()
    if not text:
        return ParsedCommand(
            intent=CommandIntent.UNKNOWN,
            reasoning="empty utterance",
            confidence=0.0,
            source="rule",
        )

    m = _CREATE_TASK_RE.match(text)
    if m:
        return ParsedCommand(
            intent=CommandIntent.CREATE_TASK,
            slots={"name": m.group("name").strip()},
            confidence=0.95,
            source="rule",
            reasoning="matched create-task pattern",
        )

    m = _LOG_HOURS_RE.match(text)
    if m:
        return ParsedCommand(
            intent=CommandIntent.LOG_HOURS,
            slots={"hours": float(m.group("hours")), "task": m.group("task").strip()},
            confidence=0.95,
            source="rule",
            reasoning="matched log-hours pattern",
        )

    m = _SCHEDULE_WHEN_RE.search(text)
    if m:
        when = m.group("when").lower().replace(" ", "_")
        return ParsedCommand(
            intent=CommandIntent.CHECK_SCHEDULE,
            slots={"when": when},
            confidence=0.9,
            source="rule",
            reasoning="matched schedule-with-when pattern",
        )

    if _CHECK_SCHEDULE_PLAIN_RE.match(text):
        return ParsedCommand(
            intent=CommandIntent.CHECK_SCHEDULE,
            slots={},
            confidence=0.9,
            source="rule",
            reasoning="matched check-schedule pattern",
        )

    return ParsedCommand(
        intent=CommandIntent.UNKNOWN,
        confidence=0.0,
        source="rule",
        reasoning="no rule matched",
    )


# --- LLM fallback interface ---


class CommandLLMFallback(ABC):
    """Abstract LLM-backed fallback parser for utterances the rules miss."""

    @abstractmethod
    async def classify(self, utterance: str) -> ParsedCommand: ...


class FakeCommandLLMFallback(CommandLLMFallback):
    """Deterministic fake used by tests."""

    def __init__(
        self,
        intent: CommandIntent = CommandIntent.UNKNOWN,
        slots: dict[str, object] | None = None,
    ) -> None:
        self.intent = intent
        self.slots = slots or {}
        self.calls = 0
        self.last_utterance: str | None = None

    async def classify(self, utterance: str) -> ParsedCommand:
        self.calls += 1
        self.last_utterance = utterance
        return ParsedCommand(
            intent=self.intent,
            slots=dict(self.slots),
            confidence=0.6,
            source="llm",
            reasoning="fake LLM fallback classification",
        )


def get_command_llm_fallback() -> CommandLLMFallback:
    """FastAPI dependency. Defaults to fake until real LLM client is wired."""
    return FakeCommandLLMFallback()


async def parse_command_async(
    utterance: str,
    llm_fallback: CommandLLMFallback,
) -> ParsedCommand:
    """Parse with rules first; fall back to the LLM when rules fail."""
    rule_result = parse_command(utterance)
    if rule_result.intent is not CommandIntent.UNKNOWN:
        return rule_result
    if not (utterance or "").strip():
        return rule_result
    return await llm_fallback.classify(utterance)
