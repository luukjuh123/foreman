"""Voice router — TTS, transcription, command parsing, and chat endpoints."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Annotated, Literal

from app.services.voice.commands import (
    CommandLLMFallback,
    get_command_llm_fallback,
    parse_command_async,
)
from app.services.voice.conversation import (
    ConversationMessage,
    ConversationalAIProvider,
    get_conversational_ai_provider,
)
from app.services.voice.transcription import TranscriptionProvider, get_transcription_provider
from app.services.voice.tts import TTSProvider, get_tts_provider
from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

router = APIRouter()
logger = logging.getLogger(__name__)

_SUPPORTED_AUDIO_TYPES = {
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/ogg",
    "audio/webm",
    "audio/flac",
    "audio/mp4",
    "audio/aac",
}
_MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB


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
    except Exception:
        logger.exception("tts provider failed")
        return JSONResponse(
            status_code=502,
            content={
                "data": None,
                "error": {"code": "TTS_FAILED", "message": "tts provider error"},
            },
        )

    return Response(content=result.audio, media_type=result.content_type)


# --- /transcribe ---


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    provider: TranscriptionProvider = Depends(get_transcription_provider),
) -> JSONResponse:
    """Accept an audio file upload and return its transcript."""
    content_type = audio.content_type or ""
    if content_type not in _SUPPORTED_AUDIO_TYPES:
        return JSONResponse(
            status_code=415,
            content={
                "data": None,
                "error": {
                    "code": "UNSUPPORTED_MEDIA_TYPE",
                    "message": f"unsupported content type: {content_type}",
                },
            },
        )

    data = await audio.read()

    if len(data) == 0:
        return JSONResponse(
            status_code=400,
            content={
                "data": None,
                "error": {"code": "EMPTY_AUDIO", "message": "audio file is empty"},
            },
        )

    if len(data) > _MAX_AUDIO_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "data": None,
                "error": {"code": "FILE_TOO_LARGE", "message": "audio file exceeds 25 MB limit"},
            },
        )

    tmp_path = Path(tempfile.gettempdir()) / f"foreman-voice-{audio.filename}"
    try:
        tmp_path.write_bytes(data)
        result = await provider.transcribe(tmp_path, content_type)
    except Exception:
        logger.exception("transcription provider failed")
        return JSONResponse(
            status_code=502,
            content={
                "data": None,
                "error": {"code": "TRANSCRIPTION_FAILED", "message": "transcription provider error"},
            },
        )
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

    return JSONResponse(
        status_code=200,
        content={
            "data": {"text": result.text, "language": result.language},
            "error": None,
        },
    )


# --- /command ---


class CommandRequest(BaseModel):
    utterance: str = Field(min_length=1)

    @field_validator("utterance")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("utterance must not be blank")
        return v


@router.post("/command")
async def command(
    body: CommandRequest,
    llm_fallback: CommandLLMFallback = Depends(get_command_llm_fallback),
) -> JSONResponse:
    """Parse a voice utterance into a structured command intent."""
    result = await parse_command_async(body.utterance, llm_fallback=llm_fallback)
    return JSONResponse(
        status_code=200,
        content={
            "data": {
                "intent": result.intent.value,
                "slots": result.slots,
                "confidence": result.confidence,
                "source": result.source,
                "reasoning": result.reasoning,
            },
            "error": None,
        },
    )


# --- /chat ---


class ChatMessageSchema(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessageSchema] = Field(min_length=1)
    system_prompt: str | None = None


@router.post("/chat")
async def chat(
    body: ChatRequest,
    provider: ConversationalAIProvider = Depends(get_conversational_ai_provider),
) -> JSONResponse:
    """Accept a conversation history and return an AI reply."""
    messages = [ConversationMessage(role=m.role, content=m.content) for m in body.messages]
    try:
        reply = await provider.reply(messages=messages, system_prompt=body.system_prompt)
    except Exception:
        logger.exception("conversational AI provider failed")
        return JSONResponse(
            status_code=502,
            content={
                "data": None,
                "error": {"code": "CONVERSATION_FAILED", "message": "conversational AI provider error"},
            },
        )

    return JSONResponse(
        status_code=200,
        content={
            "data": {"reply": reply.text, "reasoning": reply.reasoning},
            "error": None,
        },
    )
