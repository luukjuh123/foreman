"""Voice router — audio upload, transcription, future TTS/conversation endpoints."""

from __future__ import annotations

import logging
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import JSONResponse

from app.services.voice.transcription import (
    TranscriptionProvider,
    get_transcription_provider,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Hard upload cap — Whisper-style APIs typically cap at 25 MB.
MAX_AUDIO_BYTES = 25 * 1024 * 1024

# Allowed MIME types for uploaded audio.
ALLOWED_CONTENT_TYPES = {
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/webm",
    "audio/ogg",
    "audio/flac",
    "audio/aac",
}


def _error(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"data": None, "error": {"code": code, "message": message}},
    )


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    provider: TranscriptionProvider = Depends(get_transcription_provider),
) -> JSONResponse:
    """Accept an audio upload and return its transcription.

    The audio bytes are written to an ephemeral temp file, passed to the configured
    `TranscriptionProvider`, and the temp file is removed before the response is
    returned (even if transcription fails).
    """
    content_type = (audio.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        return _error(
            "UNSUPPORTED_MEDIA_TYPE",
            f"content_type '{content_type}' is not a supported audio type",
            415,
        )

    # Stream into a temp file with a known prefix so callers can audit cleanup.
    tmp_dir = tempfile.gettempdir()
    suffix = Path(audio.filename or "audio").suffix or ".bin"
    fd, tmp_path_str = tempfile.mkstemp(
        prefix=f"foreman-voice-{uuid.uuid4().hex}-",
        suffix=suffix,
        dir=tmp_dir,
    )
    tmp_path = Path(tmp_path_str)
    total = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await audio.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_AUDIO_BYTES:
                    return _error(
                        "FILE_TOO_LARGE",
                        f"audio exceeds maximum size of {MAX_AUDIO_BYTES} bytes",
                        413,
                    )
                out.write(chunk)

        if total == 0:
            return _error("EMPTY_AUDIO", "audio file is empty", 400)

        try:
            result = await provider.transcribe(tmp_path, content_type)
        except Exception:  # noqa: BLE001
            logger.exception("transcription provider failed")
            return _error("TRANSCRIPTION_FAILED", "transcription provider error", 502)

        return JSONResponse(
            status_code=200,
            content={
                "data": {"text": result.text, "language": result.language},
                "error": None,
            },
        )
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("failed to remove temp audio file %s", tmp_path)
