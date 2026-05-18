"""AI-assisted review reply drafter.

Wraps the OpenAI chat-completions API behind a small `ReplyDrafter` interface
so tests can inject a deterministic fake without touching the network. The
live implementation reads its key from `settings.openai_api_key`.

The drafter must return both the proposed `reply_text` and a short
human-readable `reasoning` string, per the project rule that AI planning
responses must explain themselves.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class DraftedReply:
    reply_text: str
    reasoning: str


class ReplyDrafter(ABC):
    @abstractmethod
    async def draft_reply(
        self,
        *,
        author_name: str,
        rating: int,
        comment: str | None,
        company_name: str = "our team",
    ) -> DraftedReply:
        ...


def _tone_for(rating: int) -> str:
    if rating >= 5:
        return "warm, grateful"
    if rating == 4:
        return "appreciative, friendly"
    if rating == 3:
        return "courteous, constructive"
    return "apologetic, solution-oriented"


def _build_prompt(
    *,
    author_name: str,
    rating: int,
    comment: str | None,
    company_name: str,
) -> str:
    tone = _tone_for(rating)
    body = (comment or "").strip() or "(no comment provided)"
    return (
        "You are a professional customer-service representative for a Dutch "
        "construction company. Draft a short, polite, on-brand reply to a "
        f"Google review by {author_name} (rating: {rating}/5). Use a {tone} "
        "tone, address them by first name, thank them for the feedback, and "
        "for ratings <= 3 offer to discuss the issue offline. Sign off as "
        f"{company_name}. Keep the reply under 80 words and avoid generic "
        "marketing phrases.\n\nReview comment:\n"
        f"\"{body}\""
    )


class HeuristicReplyDrafter(ReplyDrafter):
    """Fallback drafter that produces a deterministic templated reply.

    Used in tests and when the OpenAI key is not configured.
    """

    async def draft_reply(
        self,
        *,
        author_name: str,
        rating: int,
        comment: str | None,
        company_name: str = "our team",
    ) -> DraftedReply:
        first = author_name.split()[0] if author_name else "there"
        if rating >= 4:
            text = (
                f"Hi {first}, thank you so much for the kind {rating}-star "
                f"review — it means a lot to {company_name}. We hope to "
                "work with you again soon!"
            )
            reasoning = (
                f"Positive rating ({rating}/5): warm, grateful tone, no offer "
                "to follow up offline."
            )
        elif rating == 3:
            text = (
                f"Hi {first}, thank you for taking the time to share your "
                "feedback. We take every comment seriously — please feel "
                f"free to reach out so {company_name} can do better next "
                "time."
            )
            reasoning = (
                "Neutral rating (3/5): courteous tone, soft invitation to "
                "follow up."
            )
        else:
            text = (
                f"Hi {first}, we are sorry to hear about your experience. "
                f"This is not the standard {company_name} aims for. Please "
                "contact us directly so we can investigate and make it right."
            )
            reasoning = (
                f"Low rating ({rating}/5): apologetic tone with an explicit "
                "offline-resolution offer."
            )
        return DraftedReply(reply_text=text, reasoning=reasoning)


class OpenAIReplyDrafter(ReplyDrafter):
    """Live OpenAI-backed drafter — used when an API key is configured."""

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            msg = "OpenAI API key required"
            raise ValueError(msg)
        # Import lazily so tests never need the real openai client.
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def draft_reply(
        self,
        *,
        author_name: str,
        rating: int,
        comment: str | None,
        company_name: str = "our team",
    ) -> DraftedReply:
        prompt = _build_prompt(
            author_name=author_name,
            rating=rating,
            comment=comment,
            company_name=company_name,
        )
        resp = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You write short, professional replies to customer "
                        "reviews for a Dutch construction company."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=200,
        )
        text = (resp.choices[0].message.content or "").strip()
        reasoning = (
            f"OpenAI {self._model}: tone={_tone_for(rating)}, "
            f"rating={rating}/5, model decided the wording."
        )
        return DraftedReply(reply_text=text, reasoning=reasoning)


def get_reply_drafter() -> ReplyDrafter:
    """FastAPI dependency — uses OpenAI if configured, else heuristic."""
    key = settings.openai_api_key
    if key:
        return OpenAIReplyDrafter(api_key=key, model=settings.openai_model)
    return HeuristicReplyDrafter()
