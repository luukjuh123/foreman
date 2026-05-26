"""Offertes router — CRUD, status transitions, PDF export."""

from __future__ import annotations

import uuid
from datetime import date as _date
from datetime import timedelta

from app.core.database import get_db
from app.models.invoice import Customer, Invoice, InvoiceLine
from app.models.offerte import Offerte, OfferteLine
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.offerte import (
    OfferteAccept,
    OfferteCreate,
    OfferteListResponse,
    OfferteResponse,
    OfferteUpdate,
)
from app.services.invoices.numbering import allocate_invoice_number
from app.services.invoices.totals import compute_line_totals
from app.services.offertes.numbering import next_offerte_number
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


async def _load_offerte(db: AsyncSession, owner_id: uuid.UUID, offerte_id: uuid.UUID) -> Offerte:
    result = await db.execute(
        select(Offerte)
        .where(Offerte.id == offerte_id, Offerte.owner_id == owner_id)
        .options(selectinload(Offerte.lines))
    )
    offerte = result.scalar_one_or_none()
    if offerte is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offerte not found")
    return offerte


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


@router.post("/", response_model=OfferteResponse, status_code=status.HTTP_201_CREATED)
async def create_offerte(
    body: OfferteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferteResponse:
    await _load_customer(db, current_user.id, body.customer_id)

    offerte_number = await next_offerte_number(db, owner_id=current_user.id, year=body.issue_date.year)

    offerte = Offerte(
        owner_id=current_user.id,
        customer_id=body.customer_id,
        offerte_number=offerte_number,
        issue_date=body.issue_date,
        valid_until=body.valid_until,
        notes=body.notes,
        terms_conditions=body.terms_conditions,
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
        offerte.lines.append(
            OfferteLine(
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

    offerte.subtotal_cents = subtotal
    offerte.vat_total_cents = vat_total
    offerte.total_cents = subtotal + vat_total

    db.add(offerte)
    await db.commit()

    loaded = await _load_offerte(db, current_user.id, offerte.id)
    return OfferteResponse.model_validate(loaded)


@router.get("/", response_model=OfferteListResponse)
async def list_offertes(
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferteListResponse:
    base = select(Offerte).where(Offerte.owner_id == current_user.id)
    if status_filter:
        base = base.where(Offerte.status == status_filter)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(
        base.options(selectinload(Offerte.lines)).order_by(Offerte.created_at.desc())
    )
    offertes = result.scalars().all()
    return OfferteListResponse(
        data=[OfferteResponse.model_validate(o) for o in offertes],
        total=total,
    )


@router.get("/{offerte_id}", response_model=OfferteResponse)
async def get_offerte(
    offerte_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferteResponse:
    offerte = await _load_offerte(db, current_user.id, offerte_id)
    return OfferteResponse.model_validate(offerte)


@router.patch("/{offerte_id}", response_model=OfferteResponse)
async def update_offerte(
    offerte_id: uuid.UUID,
    body: OfferteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferteResponse:
    offerte = await _load_offerte(db, current_user.id, offerte_id)
    if offerte.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only draft offertes can be updated",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(offerte, field, value)
    await db.commit()
    loaded = await _load_offerte(db, current_user.id, offerte_id)
    return OfferteResponse.model_validate(loaded)


@router.delete("/{offerte_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offerte(
    offerte_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    offerte = await _load_offerte(db, current_user.id, offerte_id)
    await db.delete(offerte)
    await db.commit()


@router.post("/{offerte_id}/send", response_model=OfferteResponse)
async def send_offerte(
    offerte_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferteResponse:
    offerte = await _load_offerte(db, current_user.id, offerte_id)
    offerte.status = "sent"
    await db.commit()
    loaded = await _load_offerte(db, current_user.id, offerte_id)
    return OfferteResponse.model_validate(loaded)


@router.post("/{offerte_id}/reject", response_model=OfferteResponse)
async def reject_offerte(
    offerte_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferteResponse:
    offerte = await _load_offerte(db, current_user.id, offerte_id)
    if offerte.status != "sent":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only sent offertes can be rejected",
        )
    offerte.status = "rejected"
    await db.commit()
    loaded = await _load_offerte(db, current_user.id, offerte_id)
    return OfferteResponse.model_validate(loaded)


@router.post("/{offerte_id}/accept", response_model=OfferteResponse)
async def accept_offerte(
    offerte_id: uuid.UUID,
    body: OfferteAccept,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferteResponse:
    offerte = await _load_offerte(db, current_user.id, offerte_id)
    if offerte.status != "sent":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only sent offertes can be accepted",
        )

    invoice_id: uuid.UUID | None = None
    if body.create_invoice:
        issue_date = offerte.issue_date
        invoice_number = await allocate_invoice_number(db, owner_id=current_user.id, year=issue_date.year)
        invoice = Invoice(
            owner_id=current_user.id,
            customer_id=offerte.customer_id,
            invoice_number=invoice_number,
            issue_date=issue_date,
            due_date=issue_date + timedelta(days=30),
            payment_terms_days=30,
            notes=offerte.notes,
            status="draft",
            subtotal_cents=offerte.subtotal_cents,
            vat_total_cents=offerte.vat_total_cents,
            total_cents=offerte.total_cents,
        )
        for ln in offerte.lines:
            invoice.lines.append(
                InvoiceLine(
                    position=ln.position,
                    description=ln.description,
                    quantity=ln.quantity,
                    unit=ln.unit,
                    unit_price_cents=ln.unit_price_cents,
                    vat_rate_bp=ln.vat_rate_bp,
                    line_net_cents=ln.line_net_cents,
                    line_vat_cents=ln.line_vat_cents,
                )
            )
        db.add(invoice)
        await db.flush()
        invoice_id = invoice.id

    offerte.status = "accepted"
    offerte.invoice_id = invoice_id
    await db.commit()
    loaded = await _load_offerte(db, current_user.id, offerte_id)
    return OfferteResponse.model_validate(loaded)


@router.get(
    "/{offerte_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
async def get_offerte_pdf(
    offerte_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    offerte = await _load_offerte(db, current_user.id, offerte_id)
    import app.services.offertes.pdf as pdf_mod

    offerte_dict = {
        "offerte_number": offerte.offerte_number,
        "issue_date": offerte.issue_date,
        "valid_until": offerte.valid_until,
        "notes": offerte.notes,
        "terms_conditions": offerte.terms_conditions,
        "subtotal_cents": offerte.subtotal_cents,
        "vat_total_cents": offerte.vat_total_cents,
        "total_cents": offerte.total_cents,
        "lines": [
            {
                "description": ln.description,
                "quantity": ln.quantity,
                "unit": ln.unit,
                "unit_price_cents": ln.unit_price_cents,
                "vat_rate_bp": ln.vat_rate_bp,
                "line_net_cents": ln.line_net_cents,
                "line_vat_cents": ln.line_vat_cents,
            }
            for ln in offerte.lines
        ],
    }
    pdf_bytes = pdf_mod.render_offerte_pdf(offerte_dict)
    filename = f"offerte-{offerte.offerte_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
