"""Voice router — TTS endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

from app.services.voice.tts import TTSProvider, get_tts_provider

router = APIRouter()
logger = logging.getLogger(__name__)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: str | None = None

    @field_validator("text")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v


@router.post("/speak")
async def speak(
    body: SpeakRequest,
    provider: TTSProvider = Depends(get_tts_provider),
) -> Response:
    """Synthesize speech audio from `text` using the configured TTSProvider.

    Returns raw audio bytes (Content-Type from the provider). On provider
    failure, returns the standard JSON error envelope with status 502.
    """
    try:
        result = await provider.synthesize(text=body.text, voice=body.voice)
    except Exception:  # noqa: BLE001
        logger.exception("tts provider failed")
        return JSONResponse(
            status_code=502,
            content={
                "data": None,
                "error": {"code": "TTS_FAILED", "message": "tts provider error"},
            },
        )

    return Response(content=result.audio, media_type=result.content_type)
