"""Subcontractors router — CRUD for subcontractor companies, certifications, assignments, invoices."""

import json
import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.finance import JournalEntry
from app.models.subcontractor import (
    Subcontractor,
    SubcontractorAssignment,
    SubcontractorCertification,
    SubcontractorInvoice,
)
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.subcontractor import (
    AssignmentCreate,
    AssignmentListResponse,
    AssignmentResponse,
    AssignmentUpdate,
    CertificationCreate,
    CertificationResponse,
    SubcontractorCreate,
    SubcontractorInvoiceCreate,
    SubcontractorInvoiceListResponse,
    SubcontractorInvoiceResponse,
    SubcontractorListResponse,
    SubcontractorResponse,
    SubcontractorUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _get_owned_sub_or_404(sub_id: uuid.UUID, user: User, db: AsyncSession) -> Subcontractor:
    result = await db.execute(
        select(Subcontractor)
        .where(
            Subcontractor.id == sub_id,
            Subcontractor.owner_id == user.id,
            Subcontractor.deleted_at.is_(None),
        )
        .options(selectinload(Subcontractor.certifications))
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subcontractor not found")
    return sub


def _compute_assignment_cost(assignment: SubcontractorAssignment) -> int:
    if assignment.agreed_fixed_cost_cents is not None:
        return assignment.agreed_fixed_cost_cents
    actual = assignment.actual_hours or 0.0
    rate = assignment.agreed_rate_cents or 0
    return int(actual * rate)


# ─── Subcontractor CRUD ───────────────────────────────────────────────────────


@router.get("/", response_model=SubcontractorListResponse)
async def list_subcontractors(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    specialty: str | None = Query(None, description="Filter by specialty (substring match)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorListResponse:
    base_query = select(Subcontractor).where(
        Subcontractor.owner_id == current_user.id,
        Subcontractor.deleted_at.is_(None),
    )
    if specialty:
        base_query = base_query.where(Subcontractor.specialties_json.contains(specialty))

    count = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    offset = (page - 1) * per_page
    rows = (
        (
            await db.execute(
                base_query.options(selectinload(Subcontractor.certifications))
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
        kvk_number=body.kvk_number,
        contact_name=body.contact_name,
        email=body.email,
        phone=body.phone,
        specialties_json=json.dumps(body.specialties),
        hourly_rate_cents=body.hourly_rate_cents,
        fixed_rate_cents=body.fixed_rate_cents,
        rating=body.rating,
        notes=body.notes,
        active=body.active,
    )
    db.add(sub)
    await db.commit()
    result = await db.execute(
        select(Subcontractor).where(Subcontractor.id == sub.id).options(selectinload(Subcontractor.certifications))
    )
    return SubcontractorResponse.model_validate(result.scalar_one())


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
    update_data = body.model_dump(exclude_unset=True)
    if "specialties" in update_data:
        sub.specialties_json = json.dumps(update_data.pop("specialties"))
    for field, value in update_data.items():
        setattr(sub, field, value)
    await db.commit()
    result = await db.execute(
        select(Subcontractor).where(Subcontractor.id == sub.id).options(selectinload(Subcontractor.certifications))
    )
    return SubcontractorResponse.model_validate(result.scalar_one())


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subcontractor(
    sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    sub = await _get_owned_sub_or_404(sub_id, current_user, db)
    sub.deleted_at = datetime.now(UTC)
    await db.commit()


# ─── Certifications ───────────────────────────────────────────────────────────


@router.post(
    "/{sub_id}/certifications",
    response_model=CertificationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_certification(
    sub_id: uuid.UUID,
    body: CertificationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    cert = SubcontractorCertification(
        subcontractor_id=sub_id,
        cert_type=body.cert_type,
        expiry_date=body.expiry_date,
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return CertificationResponse.model_validate(cert)


# ─── Assignments ──────────────────────────────────────────────────────────────


@router.get("/assignments/", response_model=AssignmentListResponse)
async def list_assignments(
    project_id: uuid.UUID | None = Query(None),
    subcontractor_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentListResponse:
    base_query = select(SubcontractorAssignment).where(
        SubcontractorAssignment.owner_id == current_user.id,
    )
    if project_id:
        base_query = base_query.where(SubcontractorAssignment.project_id == project_id)
    if subcontractor_id:
        base_query = base_query.where(SubcontractorAssignment.subcontractor_id == subcontractor_id)

    count = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    offset = (page - 1) * per_page
    rows = (
        (await db.execute(base_query.order_by(SubcontractorAssignment.created_at.asc()).offset(offset).limit(per_page)))
        .scalars()
        .all()
    )
    return AssignmentListResponse(
        data=[AssignmentResponse.model_validate(r) for r in rows],
        total=count,
        page=page,
        per_page=per_page,
    )


@router.post("/assignments/", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    assignment = SubcontractorAssignment(
        owner_id=current_user.id,
        subcontractor_id=body.subcontractor_id,
        project_id=body.project_id,
        phase_id=body.phase_id,
        task_id=body.task_id,
        description=body.description,
        estimated_hours=body.estimated_hours,
        agreed_rate_cents=body.agreed_rate_cents,
        agreed_fixed_cost_cents=body.agreed_fixed_cost_cents,
    )
    assignment.total_cost_cents = _compute_assignment_cost(assignment)
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    result = await db.execute(
        select(SubcontractorAssignment).where(
            SubcontractorAssignment.id == assignment_id,
            SubcontractorAssignment.owner_id == current_user.id,
        )
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return AssignmentResponse.model_validate(assignment)


@router.put("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: uuid.UUID,
    body: AssignmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    result = await db.execute(
        select(SubcontractorAssignment).where(
            SubcontractorAssignment.id == assignment_id,
            SubcontractorAssignment.owner_id == current_user.id,
        )
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(assignment, field, value)
    assignment.total_cost_cents = _compute_assignment_cost(assignment)
    await db.commit()
    await db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


# ─── Invoices ─────────────────────────────────────────────────────────────────


@router.get("/invoices/", response_model=SubcontractorInvoiceListResponse)
async def list_subcontractor_invoices(
    project_id: uuid.UUID | None = Query(None),
    subcontractor_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorInvoiceListResponse:
    base_query = select(SubcontractorInvoice).where(
        SubcontractorInvoice.owner_id == current_user.id,
    )
    if project_id:
        base_query = base_query.where(SubcontractorInvoice.project_id == project_id)
    if subcontractor_id:
        base_query = base_query.where(SubcontractorInvoice.subcontractor_id == subcontractor_id)

    count = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    offset = (page - 1) * per_page
    rows = (
        (await db.execute(base_query.order_by(SubcontractorInvoice.invoice_date.asc()).offset(offset).limit(per_page)))
        .scalars()
        .all()
    )
    return SubcontractorInvoiceListResponse(
        data=[SubcontractorInvoiceResponse.model_validate(r) for r in rows],
        total=count,
        page=page,
        per_page=per_page,
    )


@router.post("/invoices/", response_model=SubcontractorInvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_subcontractor_invoice(
    body: SubcontractorInvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorInvoiceResponse:
    inv = SubcontractorInvoice(
        owner_id=current_user.id,
        subcontractor_id=body.subcontractor_id,
        project_id=body.project_id,
        assignment_id=body.assignment_id,
        invoice_reference=body.invoice_reference,
        invoice_date=body.invoice_date,
        description=body.description,
        amount_cents=body.amount_cents,
        vat_cents=body.vat_cents,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return SubcontractorInvoiceResponse.model_validate(inv)


@router.post("/invoices/{invoice_id}/reconcile", response_model=SubcontractorInvoiceResponse)
async def reconcile_subcontractor_invoice(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorInvoiceResponse:
    """Auto-reconcile the invoice by creating a journal entry for the subcontractor cost."""
    result = await db.execute(
        select(SubcontractorInvoice).where(
            SubcontractorInvoice.id == invoice_id,
            SubcontractorInvoice.owner_id == current_user.id,
        )
    )
    inv = result.scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    if inv.status == "reconciled":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice already reconciled")

    # Create a journal entry recording the subcontractor cost.
    journal_entry = JournalEntry(
        owner_id=current_user.id,
        entry_date=inv.invoice_date,
        description=f"Subcontractor cost: {inv.description} (ref: {inv.invoice_reference})",
        reference=inv.invoice_reference,
        is_posted=True,
    )
    db.add(journal_entry)
    await db.flush()

    inv.journal_entry_id = journal_entry.id
    inv.status = "reconciled"
    inv.reconciled_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(inv)
    return SubcontractorInvoiceResponse.model_validate(inv)
