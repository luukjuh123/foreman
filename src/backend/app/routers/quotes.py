"""Quotes router — offerte CRUD, status transitions, and convert-to-project."""

from __future__ import annotations

import uuid
from datetime import date as _date

from app.core.database import get_db
from app.models.customer import Customer
from app.models.project import Project
from app.models.quote import Quote, QuoteLine
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.quote import (
    QuoteCreate,
    QuoteListResponse,
    QuoteResponse,
    QuoteStatusUpdate,
    QuoteUpdate,
)
from app.services.quotes.numbering import allocate_quote_number
from app.services.quotes.status import apply_transition
from app.services.quotes.totals import compute_line_totals
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


def _compute_lines(line_inputs: list) -> tuple[list[QuoteLine], int, int]:
    """Build QuoteLine objects and return (lines, subtotal_cents, vat_total_cents)."""
    lines = []
    subtotal = 0
    vat_total = 0
    for idx, line_in in enumerate(line_inputs):
        net, vat = compute_line_totals(
            quantity=line_in.quantity,
            unit_price_cents=line_in.unit_price_cents,
            vat_rate_bp=line_in.vat_rate_bp,
        )
        lines.append(
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
    return lines, subtotal, vat_total


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

    lines, subtotal, vat_total = _compute_lines(body.lines)

    quote = Quote(
        owner_id=current_user.id,
        customer_id=body.customer_id,
        project_id=body.project_id,
        quote_number=quote_number,
        valid_until=body.valid_until,
        notes=body.notes,
        status="draft",
        subtotal_cents=subtotal,
        vat_total_cents=vat_total,
        total_cents=subtotal + vat_total,
        lines=lines,
    )
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


@router.put("/{quote_id}", response_model=QuoteResponse)
async def update_quote(
    quote_id: uuid.UUID,
    body: QuoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    quote = await _load_quote(db, current_user.id, quote_id)

    if quote.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only draft quotes can be edited",
        )

    if body.customer_id is not None:
        await _load_customer(db, current_user.id, body.customer_id)
        quote.customer_id = body.customer_id

    if body.project_id is not None:
        quote.project_id = body.project_id

    if body.valid_until is not None:
        quote.valid_until = body.valid_until

    if body.notes is not None:
        quote.notes = body.notes

    if body.lines is not None:
        new_lines, subtotal, vat_total = _compute_lines(body.lines)
        # quote is loaded with selectinload so .lines is already a list
        quote.lines[:] = new_lines
        quote.subtotal_cents = subtotal
        quote.vat_total_cents = vat_total
        quote.total_cents = subtotal + vat_total

    await db.commit()
    loaded = await _load_quote(db, current_user.id, quote_id)
    return QuoteResponse.model_validate(loaded)


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quote(
    quote_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    quote = await _load_quote(db, current_user.id, quote_id)
    from datetime import UTC, datetime

    quote.deleted_at = datetime.now(UTC)
    await db.commit()


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------


@router.post("/{quote_id}/status", response_model=QuoteResponse)
async def transition_quote_status(
    quote_id: uuid.UUID,
    body: QuoteStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    quote = await _load_quote(db, current_user.id, quote_id)
    try:
        apply_transition(quote, body.status)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    loaded = await _load_quote(db, current_user.id, quote_id)
    return QuoteResponse.model_validate(loaded)


# ---------------------------------------------------------------------------
# Convert to project
# ---------------------------------------------------------------------------


@router.post("/{quote_id}/convert", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
async def convert_quote_to_project(
    quote_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    """Mark the quote as accepted and create a draft project linked to the customer."""
    quote = await _load_quote(db, current_user.id, quote_id)

    if quote.status not in ("sent", "accepted"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only sent or accepted quotes can be converted to a project",
        )

    # Transition to accepted if not already.
    if quote.status != "accepted":
        try:
            apply_transition(quote, "accepted")
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    # Load customer name for the project name.
    customer_result = await db.execute(
        select(Customer).where(Customer.id == quote.customer_id)
    )
    customer = customer_result.scalar_one_or_none()
    project_name = f"Project {customer.name if customer else 'Onbekend'} — {quote.quote_number}"

    project = Project(
        owner_id=current_user.id,
        name=project_name,
        description=f"Aangemaakt vanuit offerte {quote.quote_number}",
        status="draft",
        budget_cents=quote.total_cents,
    )
    db.add(project)
    await db.flush()

    # Link the quote to the newly created project.
    quote.project_id = project.id

    await db.commit()
    loaded = await _load_quote(db, current_user.id, quote_id)
    return QuoteResponse.model_validate(loaded)
