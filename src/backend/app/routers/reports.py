"""Reports router — generate, list, view, PDF download, and share reports."""

import secrets
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.project import Project
from app.models.report import Report
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.report import (
    ReportGenerateRequest,
    ReportListResponse,
    ReportResponse,
    ReportShareResponse,
    ReportSummaryResponse,
)
from app.services.reports.completion import generate_completion_report
from app.services.reports.pdf import render_report_pdf
from app.services.reports.weekly import generate_weekly_report

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_own_report_or_404(
    report_id: uuid.UUID, user: User, db: AsyncSession
) -> Report:
    """Fetch a report owned by the current user, or 404."""
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.created_by_id == user.id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/generate", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def generate_report(
    body: ReportGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportResponse:
    project_id = uuid.UUID(body.project_id)

    # Verify project exists and belongs to user
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")

    if body.type == "weekly":
        if body.period_start is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="period_start is required for weekly reports",
            )
        data = await generate_weekly_report(db, project_id, body.period_start)
        period_end = body.period_end or date.fromisoformat(data["period"]["end"])
        title = f"Weekly report — {project.name} ({body.period_start.isoformat()} – {period_end.isoformat() if isinstance(period_end, date) else period_end})"
    else:
        data = await generate_completion_report(db, project_id)
        title = f"Completion report — {project.name}"
        period_end = None

    report = Report(
        project_id=project_id,
        created_by_id=current_user.id,
        type=body.type,
        title=title,
        period_start=body.period_start,
        period_end=period_end if isinstance(period_end, date) else (date.fromisoformat(period_end) if period_end else None),
        data=data,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return ReportResponse(
        id=str(report.id),
        project_id=str(report.project_id),
        type=report.type,
        title=report.title,
        period_start=report.period_start,
        period_end=report.period_end,
        data=report.data,
        is_shared=report.is_shared,
        share_token=report.share_token,
        created_at=report.created_at,
    )


@router.get("/", response_model=ReportListResponse)
async def list_reports(
    project_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportListResponse:
    base = select(Report).where(Report.created_by_id == current_user.id)
    count_base = select(func.count()).select_from(Report).where(
        Report.created_by_id == current_user.id
    )

    if project_id:
        pid = uuid.UUID(project_id)
        base = base.where(Report.project_id == pid)
        count_base = count_base.where(Report.project_id == pid)

    total_result = await db.execute(count_base)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        base.order_by(Report.created_at.desc()).offset(offset).limit(per_page)
    )
    reports = result.scalars().all()

    return ReportListResponse(
        data=[
            ReportSummaryResponse(
                id=str(r.id),
                project_id=str(r.project_id),
                type=r.type,
                title=r.title,
                period_start=r.period_start,
                period_end=r.period_end,
                is_shared=r.is_shared,
                created_at=r.created_at,
            )
            for r in reports
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/shared/{token}", response_model=ReportResponse)
async def get_shared_report(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> ReportResponse:
    """Public endpoint — no auth required. Returns report data for customer view."""
    result = await db.execute(
        select(Report).where(Report.share_token == token, Report.is_shared.is_(True))
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return ReportResponse(
        id=str(report.id),
        project_id=str(report.project_id),
        type=report.type,
        title=report.title,
        period_start=report.period_start,
        period_end=report.period_end,
        data=report.data,
        is_shared=report.is_shared,
        share_token=report.share_token,
        created_at=report.created_at,
    )


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportResponse:
    report = await _get_own_report_or_404(report_id, current_user, db)
    return ReportResponse(
        id=str(report.id),
        project_id=str(report.project_id),
        type=report.type,
        title=report.title,
        period_start=report.period_start,
        period_end=report.period_end,
        data=report.data,
        is_shared=report.is_shared,
        share_token=report.share_token,
        created_at=report.created_at,
    )


@router.get("/{report_id}/pdf")
async def download_report_pdf(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    report = await _get_own_report_or_404(report_id, current_user, db)
    pdf_bytes = render_report_pdf(report.data)
    safe_title = report.title.encode("ascii", "replace").decode("ascii").lower().replace(" ", "-")
    filename = f"{safe_title}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{report_id}/share", response_model=ReportShareResponse)
async def toggle_share(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportShareResponse:
    report = await _get_own_report_or_404(report_id, current_user, db)

    if not report.is_shared:
        # Enable sharing
        report.is_shared = True
        report.share_token = secrets.token_urlsafe(32)
        await db.commit()
        await db.refresh(report)
        return ReportShareResponse(
            share_token=report.share_token,
            share_url=f"/report/{str(report.id)}",
        )
    else:
        # Disable sharing
        report.is_shared = False
        report.share_token = None
        await db.commit()
        await db.refresh(report)
        return ReportShareResponse(
            share_token=None,
            share_url="",
        )
