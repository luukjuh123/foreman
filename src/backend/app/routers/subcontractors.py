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
from app.routers.deps import apply_updates, commit_refresh_validate, count_query, get_or_404
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _get_owned_sub_or_404(sub_id: uuid.UUID, user: User, db: AsyncSession) -> Subcontractor:
    return await get_or_404(
        db, Subcontractor,
        Subcontractor.id == sub_id, Subcontractor.owner_id == user.id, Subcontractor.deleted_at.is_(None),
        options=selectinload(Subcontractor.certifications),
    )


def _compute_assignment_cost(a: SubcontractorAssignment) -> int:
    return a.agreed_fixed_cost_cents if a.agreed_fixed_cost_cents is not None else int((a.actual_hours or 0.0) * (a.agreed_rate_cents or 0))


async def _fetch_sub_with_certs(sub_id: uuid.UUID, db: AsyncSession) -> Subcontractor:
    return (await db.execute(select(Subcontractor).where(Subcontractor.id == sub_id).options(selectinload(Subcontractor.certifications)))).scalar_one()


async def _paginate(db: AsyncSession, base_query, order_col, page: int, per_page: int) -> tuple[list, int]:
    return (await db.execute(base_query.order_by(order_col.asc()).offset((page - 1) * per_page).limit(per_page))).scalars().all(), await count_query(db, base_query)



# ─── Subcontractor CRUD ───────────────────────────────────────────────────────


@router.get("/", response_model=SubcontractorListResponse)
async def list_subcontractors(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    specialty: str | None = Query(None, description="Filter by specialty (substring match)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcontractorListResponse:
    q = select(Subcontractor).where(Subcontractor.owner_id == current_user.id, Subcontractor.deleted_at.is_(None))
    if specialty:
        q = q.where(Subcontractor.specialties_json.contains(specialty))
    q = q.options(selectinload(Subcontractor.certifications))
    rows, count = await _paginate(db, q, Subcontractor.created_at, page, per_page)
    return SubcontractorListResponse(
        data=[SubcontractorResponse.model_validate(s) for s in rows], total=count, page=page, per_page=per_page
    )


@router.post("/", response_model=SubcontractorResponse, status_code=status.HTTP_201_CREATED)
async def create_subcontractor(
    body: SubcontractorCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> SubcontractorResponse:
    data = body.model_dump()
    data["specialties_json"] = json.dumps(data.pop("specialties"))
    db.add(sub := Subcontractor(owner_id=current_user.id, **data))
    await db.commit()
    return SubcontractorResponse.model_validate(await _fetch_sub_with_certs(sub.id, db))


@router.get("/{sub_id}", response_model=SubcontractorResponse)
async def get_subcontractor(
    sub_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> SubcontractorResponse:
    return SubcontractorResponse.model_validate(await _get_owned_sub_or_404(sub_id, current_user, db))


@router.put("/{sub_id}", response_model=SubcontractorResponse)
async def update_subcontractor(
    sub_id: uuid.UUID, body: SubcontractorUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> SubcontractorResponse:
    sub = await _get_owned_sub_or_404(sub_id, current_user, db)
    update_data = body.model_dump(exclude_unset=True)
    if "specialties" in update_data:
        sub.specialties_json = json.dumps(update_data.pop("specialties"))
    for field, value in update_data.items():
        setattr(sub, field, value)
    await db.commit()
    return SubcontractorResponse.model_validate(await _fetch_sub_with_certs(sub.id, db))


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subcontractor(
    sub_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> None:
    (await _get_owned_sub_or_404(sub_id, current_user, db)).deleted_at = datetime.now(UTC)
    await db.commit()


# ─── Certifications ───────────────────────────────────────────────────────────


@router.post("/{sub_id}/certifications", response_model=CertificationResponse, status_code=status.HTTP_201_CREATED)
async def add_certification(
    sub_id: uuid.UUID, body: CertificationCreate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    await _get_owned_sub_or_404(sub_id, current_user, db)
    db.add(cert := SubcontractorCertification(subcontractor_id=sub_id, **body.model_dump()))
    return await commit_refresh_validate(db, cert, CertificationResponse)


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
    q = select(SubcontractorAssignment).where(
        SubcontractorAssignment.owner_id == current_user.id,
        *[col == val for col, val in [
            (SubcontractorAssignment.project_id, project_id),
            (SubcontractorAssignment.subcontractor_id, subcontractor_id),
        ] if val],
    )
    rows, count = await _paginate(db, q, SubcontractorAssignment.created_at, page, per_page)
    return AssignmentListResponse(
        data=[AssignmentResponse.model_validate(r) for r in rows], total=count, page=page, per_page=per_page
    )


@router.post("/assignments/", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    a = SubcontractorAssignment(owner_id=current_user.id, **body.model_dump())
    a.total_cost_cents = _compute_assignment_cost(a)
    db.add(a)
    return await commit_refresh_validate(db, a, AssignmentResponse)


async def _get_owned_assignment(assignment_id: uuid.UUID, user: User, db: AsyncSession) -> SubcontractorAssignment:
    return await get_or_404(db, SubcontractorAssignment, SubcontractorAssignment.id == assignment_id, SubcontractorAssignment.owner_id == user.id)


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    return AssignmentResponse.model_validate(await _get_owned_assignment(assignment_id, current_user, db))


@router.put("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: uuid.UUID, body: AssignmentUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    apply_updates(assignment := await _get_owned_assignment(assignment_id, current_user, db), body)
    assignment.total_cost_cents = _compute_assignment_cost(assignment)
    return await commit_refresh_validate(db, assignment, AssignmentResponse)


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
    q = select(SubcontractorInvoice).where(
        SubcontractorInvoice.owner_id == current_user.id,
        *[col == val for col, val in [
            (SubcontractorInvoice.project_id, project_id),
            (SubcontractorInvoice.subcontractor_id, subcontractor_id),
        ] if val],
    )
    rows, count = await _paginate(db, q, SubcontractorInvoice.invoice_date, page, per_page)
    return SubcontractorInvoiceListResponse(
        data=[SubcontractorInvoiceResponse.model_validate(r) for r in rows], total=count, page=page, per_page=per_page
    )


@router.post("/invoices/", response_model=SubcontractorInvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_subcontractor_invoice(
    body: SubcontractorInvoiceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> SubcontractorInvoiceResponse:
    db.add(inv := SubcontractorInvoice(owner_id=current_user.id, **body.model_dump()))
    return await commit_refresh_validate(db, inv, SubcontractorInvoiceResponse)


@router.post("/invoices/{invoice_id}/reconcile", response_model=SubcontractorInvoiceResponse)
async def reconcile_subcontractor_invoice(
    invoice_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> SubcontractorInvoiceResponse:
    inv = await get_or_404(db, SubcontractorInvoice, SubcontractorInvoice.id == invoice_id, SubcontractorInvoice.owner_id == current_user.id, detail="Invoice not found")
    if inv.status == "reconciled":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice already reconciled")
    db.add(je := JournalEntry(owner_id=current_user.id, entry_date=inv.invoice_date,
           description=f"Subcontractor cost: {inv.description} (ref: {inv.invoice_reference})", reference=inv.invoice_reference, is_posted=True))
    await db.flush()
    inv.journal_entry_id, inv.status, inv.reconciled_at = je.id, "reconciled", datetime.now(UTC)
    return await commit_refresh_validate(db, inv, SubcontractorInvoiceResponse)
