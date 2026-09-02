"""Recognition feedback loop router.

POST /api/v1/photos/{photo_id}/corrections  — submit a correction
GET  /api/v1/recognition/metrics            — accuracy metrics over time
GET  /api/v1/recognition/training-data      — export corrected samples
"""

from __future__ import annotations

import uuid

from app.core.database import get_db
from app.models.process import Process
from app.models.process_photo import ProcessPhoto
from app.models.project import Project
from app.models.recognition_correction import RecognitionCorrection
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.recognition_correction import (
    ConfusedPair,
    CorrectionCreate,
    CorrectionResponse,
    RecognitionMetricsResponse,
    TrainingDataResponse,
    TrainingSample,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_photo_owned(photo_id: uuid.UUID, user: User, db: AsyncSession) -> ProcessPhoto:
    """Load a photo and verify the authenticated user owns its project."""
    result = await db.execute(select(ProcessPhoto).where(ProcessPhoto.id == photo_id))
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    proj_result = await db.execute(select(Project).where(Project.id == photo.project_id, Project.deleted_at.is_(None)))
    project = proj_result.scalar_one_or_none()
    if project is None or project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your photo")

    return photo


@router.post(
    "/photos/{photo_id}/corrections",
    response_model=CorrectionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["recognition"],
)
async def create_correction(
    photo_id: uuid.UUID,
    body: CorrectionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CorrectionResponse:
    """Store a user correction for an AI recognition result."""
    photo = await _get_photo_owned(photo_id, user, db)

    correction = RecognitionCorrection(
        photo_id=photo.id,
        user_id=user.id,
        correct_process_id=body.correct_process_id,
        correct_completion_pct=body.correct_completion_pct,
        notes=body.notes,
    )
    db.add(correction)
    await db.commit()
    await db.refresh(correction)
    return CorrectionResponse.model_validate(correction)


@router.get(
    "/recognition/metrics",
    response_model=RecognitionMetricsResponse,
    tags=["recognition"],
)
async def get_recognition_metrics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RecognitionMetricsResponse:
    """Return accuracy metrics over all photos belonging to the authenticated user."""

    # Total photos uploaded by this user (via their projects).
    photos_q = (
        select(func.count(ProcessPhoto.id))
        .join(Project, ProcessPhoto.project_id == Project.id)
        .where(Project.owner_id == user.id, Project.deleted_at.is_(None))
    )
    total_predictions: int = (await db.execute(photos_q)).scalar_one()

    # Total corrections made by this user.
    corrections_q = select(func.count(RecognitionCorrection.id)).where(RecognitionCorrection.user_id == user.id)
    total_corrections: int = (await db.execute(corrections_q)).scalar_one()

    accuracy_pct: float | None = None
    if total_predictions > 0:
        accuracy_pct = round((total_predictions - total_corrections) / total_predictions * 100, 2)

    # Confused pairs: (ai process slug, correct process slug, count).
    # Join corrections → photo → recognized process slug, correct process slug.
    ai_proc = Process.__table__.alias("ai_proc")
    correct_proc = Process.__table__.alias("correct_proc")

    pairs_q = (
        select(
            ai_proc.c.slug.label("ai_slug"),
            correct_proc.c.slug.label("correct_slug"),
            func.count(RecognitionCorrection.id).label("count"),
        )
        .select_from(RecognitionCorrection)
        .join(
            ProcessPhoto,
            RecognitionCorrection.photo_id == ProcessPhoto.id,
        )
        .outerjoin(
            ai_proc,
            ProcessPhoto.recognized_process_id == ai_proc.c.id,
        )
        .join(
            correct_proc,
            RecognitionCorrection.correct_process_id == correct_proc.c.id,
        )
        .where(RecognitionCorrection.user_id == user.id)
        .group_by(ai_proc.c.slug, correct_proc.c.slug)
        .order_by(func.count(RecognitionCorrection.id).desc())
    )
    rows = (await db.execute(pairs_q)).all()
    confused_pairs = [ConfusedPair(ai_slug=row.ai_slug, correct_slug=row.correct_slug, count=row.count) for row in rows]

    return RecognitionMetricsResponse(
        total_predictions=total_predictions,
        total_corrections=total_corrections,
        accuracy_pct=accuracy_pct,
        confused_pairs=confused_pairs,
    )


@router.get(
    "/recognition/training-data",
    response_model=TrainingDataResponse,
    tags=["recognition"],
)
async def get_training_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrainingDataResponse:
    """Export corrected samples as training data.

    Returns all photos the user corrected, with the original AI prediction
    and the ground-truth label supplied by the user.
    """
    ai_proc = Process.__table__.alias("ai_proc")
    correct_proc = Process.__table__.alias("correct_proc")

    q = (
        select(
            ProcessPhoto.id.label("photo_id"),
            ProcessPhoto.image_url,
            ai_proc.c.slug.label("ai_process_slug"),
            correct_proc.c.slug.label("correct_process_slug"),
            RecognitionCorrection.correct_completion_pct,
            RecognitionCorrection.created_at.label("corrected_at"),
        )
        .select_from(RecognitionCorrection)
        .join(ProcessPhoto, RecognitionCorrection.photo_id == ProcessPhoto.id)
        .outerjoin(ai_proc, ProcessPhoto.recognized_process_id == ai_proc.c.id)
        .join(
            correct_proc,
            RecognitionCorrection.correct_process_id == correct_proc.c.id,
        )
        .where(RecognitionCorrection.user_id == user.id)
        .order_by(RecognitionCorrection.created_at)
    )
    rows = (await db.execute(q)).all()
    samples = [
        TrainingSample(
            photo_id=row.photo_id,
            image_url=row.image_url,
            ai_process_slug=row.ai_process_slug,
            correct_process_slug=row.correct_process_slug,
            correct_completion_pct=row.correct_completion_pct,
            corrected_at=row.corrected_at,
        )
        for row in rows
    ]
    return TrainingDataResponse(data=samples, total=len(samples))
