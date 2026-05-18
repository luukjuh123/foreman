"""Invoices router — customer + invoice CRUD."""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.invoice import Customer, Invoice, InvoiceLine
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.invoice import (
    CustomerCreate,
    CustomerResponse,
    InvoiceCreate,
    InvoiceListResponse,
    InvoiceResponse,
)
from app.services.invoices.numbering import allocate_invoice_number
from app.services.invoices.totals import compute_line_totals

router = APIRouter()


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------


@router.post(
    "/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED
)
async def create_customer(
    body: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    customer = Customer(owner_id=current_user.id, **body.model_dump())
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.get("/customers", response_model=list[CustomerResponse])
async def list_customers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CustomerResponse]:
    result = await db.execute(
        select(Customer).where(
            Customer.owner_id == current_user.id, Customer.deleted_at.is_(None)
        )
    )
    return [CustomerResponse.model_validate(c) for c in result.scalars().all()]


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


async def _load_customer(
    db: AsyncSession, owner_id: uuid.UUID, customer_id: uuid.UUID
) -> Customer:
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.owner_id == owner_id,
            Customer.deleted_at.is_(None),
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
        )
    return customer


async def _load_invoice(
    db: AsyncSession, owner_id: uuid.UUID, invoice_id: uuid.UUID
) -> Invoice:
    result = await db.execute(
        select(Invoice)
        .where(
            Invoice.id == invoice_id,
            Invoice.owner_id == owner_id,
            Invoice.deleted_at.is_(None),
        )
        .options(selectinload(Invoice.lines))
    )
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    return invoice


@router.post(
    "/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED
)
async def create_invoice(
    body: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceResponse:
    await _load_customer(db, current_user.id, body.customer_id)

    year = body.issue_date.year
    invoice_number = await allocate_invoice_number(
        db, owner_id=current_user.id, year=year
    )

    invoice = Invoice(
        owner_id=current_user.id,
        customer_id=body.customer_id,
        project_id=body.project_id,
        invoice_number=invoice_number,
        issue_date=body.issue_date,
        due_date=body.issue_date + timedelta(days=body.payment_terms_days),
        payment_terms_days=body.payment_terms_days,
        notes=body.notes,
        status="draft",
    )
    subtotal = 0
    vat_total = 0
    for idx, line_in in enumerate(body.lines):
        net, vat = compute_line_totals(
            quantity=line_in.quantity,
            unit_price_cents=line_in.unit_price_cents,
            vat_rate_bp=line_in.vat_rate_bp,
        )
        invoice.lines.append(
            InvoiceLine(
                position=idx,
                description=line_in.description,
                quantity=line_in.quantity,
                unit=line_in.unit,
                unit_price_cents=line_in.unit_price_cents,
                vat_rate_bp=line_in.vat_rate_bp,
                line_net_cents=net,
                line_vat_cents=vat,
            )
        )
        subtotal += net
        vat_total += vat

    invoice.subtotal_cents = subtotal
    invoice.vat_total_cents = vat_total
    invoice.total_cents = subtotal + vat_total

    db.add(invoice)
    await db.commit()

    loaded = await _load_invoice(db, current_user.id, invoice.id)
    return InvoiceResponse.model_validate(loaded)


@router.get("/", response_model=InvoiceListResponse)
async def list_invoices(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceListResponse:
    offset = (page - 1) * per_page
    base = select(Invoice).where(
        Invoice.owner_id == current_user.id, Invoice.deleted_at.is_(None)
    )
    if status_filter:
        base = base.where(Invoice.status == status_filter)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(
        base.options(selectinload(Invoice.lines))
        .order_by(Invoice.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    invoices = result.scalars().all()
    return InvoiceListResponse(
        data=[InvoiceResponse.model_validate(i) for i in invoices],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceResponse:
    invoice = await _load_invoice(db, current_user.id, invoice_id)
    return InvoiceResponse.model_validate(invoice)
