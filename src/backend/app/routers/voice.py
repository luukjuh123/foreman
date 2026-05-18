"""Voice router — command parsing endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.services.voice.commands import (
    CommandLLMFallback,
    get_command_llm_fallback,
    parse_command_async,
)

router = APIRouter()


class CommandRequest(BaseModel):
    utterance: str = Field(min_length=1)

    @field_validator("utterance")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("utterance must not be blank")
        return v


@router.post("/command")
async def parse_voice_command(
    body: CommandRequest,
    llm_fallback: CommandLLMFallback = Depends(get_command_llm_fallback),
) -> JSONResponse:
    """Parse a spoken utterance into an actionable intent + slots.

    Tries deterministic rules first; falls back to the configured LLM
    classifier when rules cannot match.
    """
    parsed = await parse_command_async(body.utterance, llm_fallback=llm_fallback)
    return JSONResponse(
        status_code=200,
        content={
            "data": {
                "intent": parsed.intent.value,
                "slots": parsed.slots,
                "confidence": parsed.confidence,
                "source": parsed.source,
                "reasoning": parsed.reasoning,
            },
            "error": None,
        },
    )
