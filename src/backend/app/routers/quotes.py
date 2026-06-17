"""Quotes (Offertes) router — CRUD, status transitions, and conversion."""

from __future__ import annotations

import uuid
from datetime import date as _date
from datetime import timedelta

from app.core.database import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceLine
from app.models.project import Project
from app.models.quote import Quote, QuoteLine
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.quote import (
    QuoteConvertRequest,
    QuoteConvertResponse,
    QuoteCreate,
    QuoteListResponse,
    QuoteResponse,
)
from app.services.invoices.numbering import allocate_invoice_number
from app.services.invoices.totals import compute_line_totals
from app.services.quotes.numbering import allocate_quote_number
from app.services.quotes.status import apply_quote_transition
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_customer(db: AsyncSession, owner_id: uuid.UUID, customer_id: uuid.UUID) -> Customer:
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


async def _load_quote(db: AsyncSession, owner_id: uuid.UUID, quote_id: uuid.UUID) -> Quote:
    result = await db.execute(
        select(Quote)
        .where(
            Quote.id == quote_id,
            Quote.owner_id == owner_id,
            Quote.deleted_at.is_(None),
        )
        .options(selectinload(Quote.lines))
    )
    quote = result.scalar_one_or_none()
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return quote


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.post("/", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
async def create_quote(
    body: QuoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    await _load_customer(db, current_user.id, body.customer_id)

    year = _date.today().year
    quote_number = await allocate_quote_number(db, owner_id=current_user.id, year=year)

    quote = Quote(
        owner_id=current_user.id,
        customer_id=body.customer_id,
        quote_number=quote_number,
        valid_until=body.valid_until,
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
        quote.lines.append(
            QuoteLine(
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

    quote.subtotal_cents = subtotal
    quote.vat_total_cents = vat_total
    quote.total_cents = subtotal + vat_total

    db.add(quote)
    await db.commit()

    loaded = await _load_quote(db, current_user.id, quote.id)
    return QuoteResponse.model_validate(loaded)


@router.get("/", response_model=QuoteListResponse)
async def list_quotes(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteListResponse:
    offset = (page - 1) * per_page
    base = select(Quote).where(Quote.owner_id == current_user.id, Quote.deleted_at.is_(None))
    if status_filter:
        base = base.where(Quote.status == status_filter)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(
        base.options(selectinload(Quote.lines)).order_by(Quote.created_at.desc()).offset(offset).limit(per_page)
    )
    quotes = result.scalars().all()
    return QuoteListResponse(
        data=[QuoteResponse.model_validate(q) for q in quotes],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{quote_id}", response_model=QuoteResponse)
async def get_quote(
    quote_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    quote = await _load_quote(db, current_user.id, quote_id)
    return QuoteResponse.model_validate(quote)


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------


@router.post("/{quote_id}/send", response_model=QuoteResponse)
async def send_quote(
    quote_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    quote = await _load_quote(db, current_user.id, quote_id)
    try:
        apply_quote_transition(quote, "sent")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    loaded = await _load_quote(db, current_user.id, quote_id)
    return QuoteResponse.model_validate(loaded)


@router.post("/{quote_id}/accept", response_model=QuoteResponse)
async def accept_quote(
    quote_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    quote = await _load_quote(db, current_user.id, quote_id)
    try:
        apply_quote_transition(quote, "accepted")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    loaded = await _load_quote(db, current_user.id, quote_id)
    return QuoteResponse.model_validate(loaded)


# ---------------------------------------------------------------------------
# Convert accepted quote → Project + optional draft Invoice
# ---------------------------------------------------------------------------


@router.post("/{quote_id}/convert", response_model=QuoteConvertResponse)
async def convert_quote(
    quote_id: uuid.UUID,
    body: QuoteConvertRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteConvertResponse:
    quote = await _load_quote(db, current_user.id, quote_id)

    if quote.status != "accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only accepted quotes can be converted to a project.",
        )

    customer = await _load_customer(db, current_user.id, quote.customer_id)

    # Create a project from the quote
    project = Project(
        owner_id=current_user.id,
        name=f"Project – {customer.name} ({quote.quote_number})",
        description=quote.notes,
        status="active",
        budget_cents=quote.total_cents,
    )
    db.add(project)
    await db.flush()

    invoice_id: uuid.UUID | None = None

    if body.create_invoice:
        today = _date.today()
        invoice_number = await allocate_invoice_number(db, owner_id=current_user.id, year=today.year)
        invoice = Invoice(
            owner_id=current_user.id,
            customer_id=quote.customer_id,
            project_id=project.id,
            invoice_number=invoice_number,
            issue_date=today,
            due_date=today + timedelta(days=30),
            payment_terms_days=30,
            notes=quote.notes,
            status="draft",
            subtotal_cents=quote.subtotal_cents,
            vat_total_cents=quote.vat_total_cents,
            total_cents=quote.total_cents,
        )
        for idx, ql in enumerate(quote.lines):
            invoice.lines.append(
                InvoiceLine(
                    position=idx,
                    description=ql.description,
                    quantity=ql.quantity,
                    unit=ql.unit,
                    unit_price_cents=ql.unit_price_cents,
                    vat_rate_bp=ql.vat_rate_bp,
                    line_net_cents=ql.line_net_cents,
                    line_vat_cents=ql.line_vat_cents,
                )
            )
        db.add(invoice)
        await db.flush()
        invoice_id = invoice.id

    await db.commit()
    return QuoteConvertResponse(project_id=project.id, invoice_id=invoice_id)
