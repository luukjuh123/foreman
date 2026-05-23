"""Subcontractor router — Phase 19.

Endpoints:
  CRUD: /api/v1/subcontractors/
  Project access: /api/v1/subcontractors/{id}/project-access
  Hours:          /api/v1/subcontractors/{id}/hours
  Invoices:       /api/v1/subcontractors/{id}/invoices
"""

import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.subcontractor import (
    Subcontractor,
    SubcontractorHourEntry,
    SubcontractorInvoice,
    SubcontractorProjectAccess,
)
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.subcontractor import (
    HourEntryCreate,
    HourEntryResponse,
    ProjectAccessCreate,
    ProjectAccessResponse,
    SubcontractorCreate,
    SubcontractorInvoiceCreate,
    SubcontractorInvoiceResponse,
    SubcontractorInvoiceUpdate,
    SubcontractorListResponse,
    SubcontractorResponse,
    SubcontractorUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_owned_sub_or_404(sub_id: uuid.UUID, user: User, db: AsyncSession) -> Subcontractor:
    result = await db.execute(
        select(Subcontractor).where(
            Subcontractor.id == sub_id,
            Subcontractor.owner_id == user.id,
            Subcontractor.deleted_at.is_(None),
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subcontractor not found")
    return sub


# ---------------------------------------------------------------------------
# Subcontractor CRUD
# ---------------------------------------------------------------------------


@router.get("/", response_model=SubcontractorListResponse)
async def list_subcontractors(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorListResponse:
    offset = (page - 1) * per_page
    count = (
        await db.execute(
            select(func.count())
            .select_from(Subcontractor)
            .where(
                Subcontractor.owner_id == current_user.id,
                Subcontractor.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    rows = (
        (
            await db.execute(
                select(Subcontractor)
                .where(
                    Subcontractor.owner_id == current_user.id,
                    Subcontractor.deleted_at.is_(None),
                )
                .order_by(Subcontractor.created_at.asc())
                .offset(offset)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )
    return SubcontractorListResponse(
        data=[SubcontractorResponse.model_validate(s) for s in rows],
        total=count,
        page=page,
        per_page=per_page,
    )


@router.post("/", response_model=SubcontractorResponse, status_code=status.HTTP_201_CREATED)
async def create_subcontractor(
    body: SubcontractorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorResponse:
    sub = Subcontractor(
        owner_id=current_user.id,
        company_name=body.company_name,
        contact_name=body.contact_name,
        email=body.email,
        phone=body.phone,
        specialty=body.specialty,
        hourly_rate_cents=body.hourly_rate_cents,
        notes=body.notes,
        active=body.active,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return SubcontractorResponse.model_validate(sub)


@router.get("/{sub_id}", response_model=SubcontractorResponse)
async def get_subcontractor(
    sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorResponse:
    sub = await _get_owned_sub_or_404(sub_id, current_user, db)
    return SubcontractorResponse.model_validate(sub)


@router.put("/{sub_id}", response_model=SubcontractorResponse)
async def update_subcontractor(
    sub_id: uuid.UUID,
    body: SubcontractorUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorResponse:
    sub = await _get_owned_sub_or_404(sub_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(sub, field, value)
    await db.commit()
    await db.refresh(sub)
    return SubcontractorResponse.model_validate(sub)


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subcontractor(
    sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    sub = await _get_owned_sub_or_404(sub_id, current_user, db)
    sub.deleted_at = datetime.now(UTC)
    await db.commit()


# ---------------------------------------------------------------------------
# Project access
# ---------------------------------------------------------------------------


@router.post(
    "/{sub_id}/project-access",
    response_model=ProjectAccessResponse,
    status_code=status.HTTP_201_CREATED,
)
async def grant_project_access(
    sub_id: uuid.UUID,
    body: ProjectAccessCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectAccessResponse:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    grant = SubcontractorProjectAccess(
        subcontractor_id=sub_id,
        project_id=body.project_id,
    )
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    return ProjectAccessResponse.model_validate(grant)


@router.get("/{sub_id}/project-access", response_model=list[ProjectAccessResponse])
async def list_project_access(
    sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectAccessResponse]:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    rows = (
        (
            await db.execute(
                select(SubcontractorProjectAccess).where(SubcontractorProjectAccess.subcontractor_id == sub_id)
            )
        )
        .scalars()
        .all()
    )
    return [ProjectAccessResponse.model_validate(r) for r in rows]


@router.delete("/{sub_id}/project-access/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_project_access(
    sub_id: uuid.UUID,
    grant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    result = await db.execute(
        select(SubcontractorProjectAccess).where(
            SubcontractorProjectAccess.id == grant_id,
            SubcontractorProjectAccess.subcontractor_id == sub_id,
        )
    )
    grant = result.scalar_one_or_none()
    if grant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access grant not found")
    await db.delete(grant)
    await db.commit()


# ---------------------------------------------------------------------------
# Hour entries
# ---------------------------------------------------------------------------


@router.post(
    "/{sub_id}/hours",
    response_model=HourEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def log_hours(
    sub_id: uuid.UUID,
    body: HourEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HourEntryResponse:
    sub = await _get_owned_sub_or_404(sub_id, current_user, db)
    cost_cents = round(body.hours * sub.hourly_rate_cents)
    entry = SubcontractorHourEntry(
        subcontractor_id=sub_id,
        project_id=body.project_id,
        work_date=body.work_date,
        hours=body.hours,
        cost_cents=cost_cents,
        description=body.description,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return HourEntryResponse.model_validate(entry)


@router.get("/{sub_id}/hours", response_model=list[HourEntryResponse])
async def list_hours(
    sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HourEntryResponse]:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    rows = (
        (
            await db.execute(
                select(SubcontractorHourEntry)
                .where(SubcontractorHourEntry.subcontractor_id == sub_id)
                .order_by(SubcontractorHourEntry.work_date.asc())
            )
        )
        .scalars()
        .all()
    )
    return [HourEntryResponse.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


@router.post(
    "/{sub_id}/invoices",
    response_model=SubcontractorInvoiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_invoice(
    sub_id: uuid.UUID,
    body: SubcontractorInvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorInvoiceResponse:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    invoice = SubcontractorInvoice(
        subcontractor_id=sub_id,
        project_id=body.project_id,
        invoice_number=body.invoice_number,
        invoice_date=body.invoice_date,
        amount_cents=body.amount_cents,
        description=body.description,
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    return SubcontractorInvoiceResponse.model_validate(invoice)


@router.get("/{sub_id}/invoices", response_model=list[SubcontractorInvoiceResponse])
async def list_invoices(
    sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SubcontractorInvoiceResponse]:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    rows = (
        (
            await db.execute(
                select(SubcontractorInvoice)
                .where(SubcontractorInvoice.subcontractor_id == sub_id)
                .order_by(SubcontractorInvoice.invoice_date.asc())
            )
        )
        .scalars()
        .all()
    )
    return [SubcontractorInvoiceResponse.model_validate(r) for r in rows]


@router.patch("/{sub_id}/invoices/{invoice_id}", response_model=SubcontractorInvoiceResponse)
async def update_invoice_status(
    sub_id: uuid.UUID,
    invoice_id: uuid.UUID,
    body: SubcontractorInvoiceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorInvoiceResponse:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    result = await db.execute(
        select(SubcontractorInvoice).where(
            SubcontractorInvoice.id == invoice_id,
            SubcontractorInvoice.subcontractor_id == sub_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    invoice.status = body.status
    await db.commit()
    await db.refresh(invoice)
    return SubcontractorInvoiceResponse.model_validate(invoice)
