"""Voice router — chat and (future) transcription endpoints."""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.voice.conversation import (
    ConversationalAIProvider,
    ConversationMessage,
    get_conversational_ai_provider,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatMessageIn(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1)
    system_prompt: str | None = None


def _error(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"data": None, "error": {"code": code, "message": message}},
    )


@router.post("/chat")
async def chat(
    body: ChatRequest,
    provider: ConversationalAIProvider = Depends(get_conversational_ai_provider),
) -> JSONResponse:
    """Conversational AI reply (Personaplex behind the ConversationalAIProvider seam).

    Returns `{data: {reply, reasoning}, error: null}` on success or a
    standard error envelope on provider failure.
    """
    messages = [ConversationMessage(role=m.role, content=m.content) for m in body.messages]
    try:
        result = await provider.reply(messages=messages, system_prompt=body.system_prompt)
    except Exception:  # noqa: BLE001
        logger.exception("conversational AI provider failed")
        return _error("CONVERSATION_FAILED", "conversational AI provider error", 502)

    return JSONResponse(
        status_code=200,
        content={
            "data": {
                "reply": result.text,
                "reasoning": result.reasoning,
                "metadata": result.metadata,
            },
            "error": None,
        },
    )
