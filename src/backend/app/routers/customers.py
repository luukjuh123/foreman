"""Customers router — CRUD for customers, scoped per authenticated owner."""

import uuid
from datetime import date

from app.core.database import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.customer import (
    CustomerCreate,
    CustomerListResponse,
    CustomerResponse,
    CustomerSummaryResponse,
    CustomerUpdate,
    InvoiceSummaryItem,
    ProjectSummaryItem,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/customers")


def _fmt_date(d: date | None) -> str | None:
    return d.strftime("%d-%m-%Y") if d else None


async def _get_or_404(customer_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> Customer:
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.owner_id == owner_id,
            Customer.deleted_at.is_(None),
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    customer = Customer(owner_id=current_user.id, **body.model_dump())
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.get("/", response_model=CustomerListResponse)
async def list_customers(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerListResponse:
    base_q = select(Customer).where(
        Customer.owner_id == current_user.id,
        Customer.deleted_at.is_(None),
    )
    if search:
        term = f"%{search}%"
        base_q = base_q.where(
            Customer.name.ilike(term)
            | Customer.city.ilike(term)
            | Customer.email.ilike(term)
        )

    count_q = select(func.count()).select_from(base_q.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar_one()

    items_q = base_q.order_by(Customer.name).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(items_q)
    customers = list(result.scalars().all())

    return CustomerListResponse(data=customers, total=total, page=page, per_page=per_page)


@router.get("/{customer_id}/summary", response_model=CustomerSummaryResponse)
async def get_customer_summary(
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerSummaryResponse:
    customer = await _get_or_404(customer_id, current_user.id, db)

    # Invoices linked to this customer
    inv_result = await db.execute(
        select(Invoice).where(
            Invoice.customer_id == customer_id,
            Invoice.owner_id == current_user.id,
            Invoice.deleted_at.is_(None),
        ).order_by(Invoice.issue_date.desc())
    )
    invoices = list(inv_result.scalars().all())

    # Projects linked via invoices (unique project_ids)
    project_ids = {inv.project_id for inv in invoices if inv.project_id is not None}
    projects: list[ProjectSummaryItem] = []
    if project_ids:
        proj_result = await db.execute(
            select(Project).where(
                Project.id.in_(project_ids),
                Project.deleted_at.is_(None),
            )
        )
        for p in proj_result.scalars().all():
            projects.append(
                ProjectSummaryItem(
                    id=p.id,
                    name=p.name,
                    status=p.status,
                    start_date=_fmt_date(p.start_date),
                    end_date=_fmt_date(p.end_date),
                )
            )

    invoice_items = [
        InvoiceSummaryItem(
            id=inv.id,
            invoice_number=inv.invoice_number,
            issue_date=_fmt_date(inv.issue_date),  # type: ignore[arg-type]
            due_date=_fmt_date(inv.due_date),      # type: ignore[arg-type]
            status=inv.status,
            total_cents=inv.total_cents,
        )
        for inv in invoices
    ]

    outstanding_cents = sum(
        inv.total_cents for inv in invoices
        if inv.status not in ("paid", "cancelled")
    )

    return CustomerSummaryResponse(
        id=customer.id,
        name=customer.name,
        projects=projects,
        invoices=invoice_items,
        outstanding_cents=outstanding_cents,
    )


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    return await _get_or_404(customer_id, current_user.id, db)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    body: CustomerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    customer = await _get_or_404(customer_id, current_user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    customer = await _get_or_404(customer_id, current_user.id, db)
    await db.delete(customer)
    await db.commit()
