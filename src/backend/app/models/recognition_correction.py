"""RecognitionCorrection model — user feedback on AI process identification.

Stores the user's correction when the AI predicted the wrong process or
completion percentage for a photo. Used as training data and for accuracy
metrics.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class RecognitionCorrection(Base):
    __tablename__ = "recognition_corrections"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    photo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("process_photos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Who submitted this correction — for auth checks and per-user scoping.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # What the user says is the correct process.
    correct_process_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("processes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Optional corrected completion estimate (0-100).
    correct_completion_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Optional free-text note from the user.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
