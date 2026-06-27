"""Customer portal router — read-only project view via share tokens.

Endpoints are unauthenticated; access is granted by a valid, non-expired
share token.  Clients only see project overview, timeline, progress photos,
and invoice status — never internal cost/staff details.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.process_photo import ProcessPhoto
from app.models.project import Phase, Project
from app.models.share_token import ShareToken
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.deps import get_or_404
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()

# Share tokens are valid for 30 days by default.
_TOKEN_TTL_DAYS = 30


# ---------------------------------------------------------------------------
# Response schemas (inline — portal-specific, no reuse needed elsewhere)
# ---------------------------------------------------------------------------


class ShareTokenResponse(BaseModel):
    token: str
    expires_at: datetime
    project_id: uuid.UUID


class TaskSummary(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    start_date: str | None
    end_date: str | None


class PhaseSummary(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    order_index: int
    start_date: str | None
    end_date: str | None
    tasks: list[TaskSummary]


class ProjectSummary(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: str
    start_date: str | None
    end_date: str | None


class PortalOverviewResponse(BaseModel):
    project: ProjectSummary
    phases: list[PhaseSummary]


class PortalTimelineResponse(BaseModel):
    phases: list[PhaseSummary]


class PhotoSummary(BaseModel):
    id: uuid.UUID
    image_url: str
    completion_pct: int | None
    reasoning: str | None
    created_at: datetime


class PortalPhotosResponse(BaseModel):
    photos: list[PhotoSummary]


class InvoiceSummary(BaseModel):
    id: uuid.UUID
    invoice_number: str
    issue_date: str
    due_date: str
    status: str
    total_cents: int
    paid_at: datetime | None


class PortalInvoicesResponse(BaseModel):
    invoices: list[InvoiceSummary]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_token(token: str, db: AsyncSession) -> ShareToken:
    """Fetch a share token and verify it is not expired."""
    result = await db.execute(select(ShareToken).where(ShareToken.token == token))
    share = result.scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    # Support both tz-aware (PostgreSQL) and tz-naive (SQLite in tests).
    expires = share.expires_at
    now = datetime.now(UTC)
    if expires.tzinfo is None:
        now = datetime.utcnow()
    if expires < now:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token expired")
    return share


async def _get_project(project_id: uuid.UUID, db: AsyncSession) -> Project:
    return await get_or_404(
        db, Project,
        Project.id == project_id, Project.deleted_at.is_(None),
        options=selectinload(Project.phases).selectinload(Phase.tasks),
    )


def _date_str(d) -> str | None:
    return d.isoformat() if d is not None else None


def _phase_to_summary(phase: Phase) -> PhaseSummary:
    return PhaseSummary(
        id=phase.id,
        name=phase.name,
        status=phase.status,
        order_index=phase.order_index,
        start_date=_date_str(phase.start_date),
        end_date=_date_str(phase.end_date),
        tasks=[
            TaskSummary(
                id=t.id,
                name=t.name,
                status=t.status,
                start_date=_date_str(t.start_date),
                end_date=_date_str(t.end_date),
            )
            for t in sorted(phase.tasks, key=lambda x: x.priority, reverse=True)
        ],
    )


# ---------------------------------------------------------------------------
# Generate share token (requires auth)
# ---------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/share-token",
    response_model=ShareTokenResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["portal"],
)
async def generate_share_token(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ShareTokenResponse:
    """Generate a shareable token for a project.  Auth required; only owner can generate."""
    project = await get_or_404(db, Project, Project.id == project_id, Project.deleted_at.is_(None))
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")

    token_str = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(days=_TOKEN_TTL_DAYS)
    share = ShareToken(project_id=project_id, token=token_str, expires_at=expires)
    db.add(share)
    await db.commit()
    await db.refresh(share)

    return ShareTokenResponse(token=share.token, expires_at=share.expires_at, project_id=share.project_id)


# ---------------------------------------------------------------------------
# Portal endpoints (no auth — token-based)
# ---------------------------------------------------------------------------


@router.get(
    "/portal/{token}",
    response_model=PortalOverviewResponse,
    tags=["portal"],
)
async def portal_overview(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> PortalOverviewResponse:
    """Return project overview — name, status, phases with tasks."""
    share = await _resolve_token(token, db)
    project = await _get_project(share.project_id, db)

    return PortalOverviewResponse(
        project=ProjectSummary(
            id=project.id,
            name=project.name,
            description=project.description,
            status=project.status,
            start_date=_date_str(project.start_date),
            end_date=_date_str(project.end_date),
        ),
        phases=[_phase_to_summary(ph) for ph in sorted(project.phases, key=lambda p: p.order_index)],
    )


@router.get(
    "/portal/{token}/timeline",
    response_model=PortalTimelineResponse,
    tags=["portal"],
)
async def portal_timeline(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> PortalTimelineResponse:
    """Return project timeline — phases with tasks and dates."""
    share = await _resolve_token(token, db)
    project = await _get_project(share.project_id, db)

    return PortalTimelineResponse(
        phases=[_phase_to_summary(ph) for ph in sorted(project.phases, key=lambda p: p.order_index)],
    )


@router.get(
    "/portal/{token}/photos",
    response_model=PortalPhotosResponse,
    tags=["portal"],
)
async def portal_photos(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> PortalPhotosResponse:
    """Return progress photos for the project."""
    share = await _resolve_token(token, db)

    result = await db.execute(
        select(ProcessPhoto).where(ProcessPhoto.project_id == share.project_id).order_by(ProcessPhoto.created_at)
    )
    photos = result.scalars().all()

    return PortalPhotosResponse(
        photos=[
            PhotoSummary(
                id=p.id,
                image_url=p.image_url,
                completion_pct=p.completion_pct,
                reasoning=p.reasoning,
                created_at=p.created_at,
            )
            for p in photos
        ]
    )


@router.get(
    "/portal/{token}/invoices",
    response_model=PortalInvoicesResponse,
    tags=["portal"],
)
async def portal_invoices(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> PortalInvoicesResponse:
    """Return invoice status for the project — amounts, paid/unpaid."""
    share = await _resolve_token(token, db)

    result = await db.execute(
        select(Invoice)
        .where(Invoice.project_id == share.project_id, Invoice.deleted_at.is_(None))
        .order_by(Invoice.issue_date)
    )
    invoices = result.scalars().all()

    return PortalInvoicesResponse(
        invoices=[
            InvoiceSummary(
                id=inv.id,
                invoice_number=inv.invoice_number,
                issue_date=inv.issue_date.isoformat(),
                due_date=inv.due_date.isoformat(),
                status=inv.status,
                total_cents=inv.total_cents,
                paid_at=inv.paid_at,
            )
            for inv in invoices
        ]
    )
