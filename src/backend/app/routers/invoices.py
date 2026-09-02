"""Invoices router — customer + invoice CRUD."""

from __future__ import annotations

import uuid
from datetime import date as _date
from datetime import timedelta

from app.core.config import settings
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
    InvoiceStatusUpdate,
)
from app.services.invoices.from_project import build_project_lines
from app.services.invoices.numbering import allocate_invoice_number
from app.services.invoices.status import apply_transition
from app.services.invoices.totals import compute_line_totals
from app.services.invoices.ubl import build_invoice_ubl_xml
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------


def _invoice_customer_to_model(body_data: dict, owner_id: uuid.UUID) -> dict:
    """Map invoice CustomerCreate fields to the Customer model field names."""
    return {
        "owner_id": owner_id,
        "name": body_data.get("name"),
        "email": body_data.get("email"),
        "kvk_number": body_data.get("kvk_number"),
        # invoice schema uses vat_number; model uses btw_number
        "btw_number": body_data.get("vat_number"),
        # invoice schema uses address_line1; model uses address
        "address": body_data.get("address_line1"),
        "postal_code": body_data.get("postal_code"),
        "city": body_data.get("city"),
    }


def _customer_to_invoice_response(customer: Customer) -> dict:
    """Map Customer model fields to the invoice CustomerResponse schema fields."""
    return {
        "id": customer.id,
        "name": customer.name,
        "email": customer.email,
        "kvk_number": customer.kvk_number,
        # model uses btw_number; invoice schema uses vat_number
        "vat_number": customer.btw_number,
        # model uses address; invoice schema uses address_line1
        "address_line1": customer.address,
        "address_line2": None,
        "postal_code": customer.postal_code,
        "city": customer.city,
        "country_code": "NL",
    }


@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    customer = Customer(**_invoice_customer_to_model(body.model_dump(), current_user.id))
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return CustomerResponse(**_customer_to_invoice_response(customer))


@router.get("/customers", response_model=list[CustomerResponse])
async def list_customers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CustomerResponse]:
    result = await db.execute(
        select(Customer).where(Customer.owner_id == current_user.id, Customer.deleted_at.is_(None))
    )
    return [CustomerResponse(**_customer_to_invoice_response(c)) for c in result.scalars().all()]


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


async def _load_customer(db: AsyncSession, owner_id: uuid.UUID, customer_id: uuid.UUID) -> Customer:
    q = select(Customer).where(Customer.id == customer_id, Customer.owner_id == owner_id, Customer.deleted_at.is_(None))
    c = (await db.execute(q)).scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return c


async def _load_invoice(db: AsyncSession, owner_id: uuid.UUID, invoice_id: uuid.UUID) -> Invoice:
    q = select(Invoice).where(Invoice.id == invoice_id, Invoice.owner_id == owner_id, Invoice.deleted_at.is_(None)).options(selectinload(Invoice.lines))
    inv = (await db.execute(q)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return inv


def _attach_lines(invoice: Invoice, lines: list) -> None:
    subtotal = vat_total = 0
    for idx, ln in enumerate(lines):
        net, vat = compute_line_totals(quantity=ln.quantity, unit_price_cents=ln.unit_price_cents, vat_rate_bp=ln.vat_rate_bp)
        invoice.lines.append(InvoiceLine(position=idx, description=ln.description, quantity=ln.quantity, unit=ln.unit, unit_price_cents=ln.unit_price_cents, vat_rate_bp=ln.vat_rate_bp, line_net_cents=net, line_vat_cents=vat))
        subtotal += net
        vat_total += vat
    invoice.subtotal_cents, invoice.vat_total_cents, invoice.total_cents = subtotal, vat_total, subtotal + vat_total


@router.post("/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceResponse:
    await _load_customer(db, current_user.id, body.customer_id)
    invoice_number = await allocate_invoice_number(db, owner_id=current_user.id, year=body.issue_date.year)
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
    _attach_lines(invoice, body.lines)
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
    base = select(Invoice).where(Invoice.owner_id == current_user.id, Invoice.deleted_at.is_(None))
    if status_filter:
        base = base.where(Invoice.status == status_filter)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(
        base.options(selectinload(Invoice.lines)).order_by(Invoice.created_at.desc()).offset(offset).limit(per_page)
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


def _invoice_to_dict(invoice: Invoice) -> dict:
    return {
        "invoice_number": invoice.invoice_number,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "currency": invoice.currency,
        "notes": invoice.notes,
        "payment_terms_days": invoice.payment_terms_days,
        "subtotal_cents": invoice.subtotal_cents,
        "vat_total_cents": invoice.vat_total_cents,
        "total_cents": invoice.total_cents,
        "lines": [
            {
                "position": ln.position,
                "description": ln.description,
                "quantity": ln.quantity,
                "unit": ln.unit,
                "unit_price_cents": ln.unit_price_cents,
                "vat_rate_bp": ln.vat_rate_bp,
                "line_net_cents": ln.line_net_cents,
                "line_vat_cents": ln.line_vat_cents,
            }
            for ln in invoice.lines
        ],
    }


def _customer_to_dict(customer: Customer) -> dict:
    return {
        "name": customer.name,
        "email": customer.email,
        "vat_number": customer.btw_number,
        "kvk_number": customer.kvk_number,
        # model uses address; PDF schema uses address_line1
        "address_line1": customer.address,
        "postal_code": customer.postal_code,
        "city": customer.city,
        "country_code": "NL",
    }


def _supplier_from_settings() -> dict:
    s = settings
    return {"name": s.company_name, "vat_number": s.company_vat_number, "kvk_number": s.company_kvk, "address_line1": s.company_address_line1, "postal_code": s.company_postal_code, "city": s.company_city, "country_code": s.company_country_code, "email": s.company_email, "iban": s.company_iban}


async def _invoice_render_context(db: AsyncSession, owner_id: uuid.UUID, invoice_id: uuid.UUID) -> tuple[Invoice, dict, dict, dict]:
    invoice = await _load_invoice(db, owner_id, invoice_id)
    customer = await _load_customer(db, owner_id, invoice.customer_id)
    return invoice, _invoice_to_dict(invoice), _customer_to_dict(customer), _supplier_from_settings()


@router.get(
    "/{invoice_id}/ubl",
    response_class=Response,
    responses={200: {"content": {"application/xml": {}}}},
)
async def get_invoice_ubl(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    invoice, inv_dict, cust_dict, sup_dict = await _invoice_render_context(db, current_user.id, invoice_id)
    return Response(
        content=build_invoice_ubl_xml(inv_dict, customer=cust_dict, supplier=sup_dict),
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="invoice-{invoice.invoice_number}.xml"'},
    )


@router.get(
    "/{invoice_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
async def get_invoice_pdf(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    invoice, inv_dict, cust_dict, sup_dict = await _invoice_render_context(db, current_user.id, invoice_id)
    # Import the function lazily via the module so tests can monkeypatch it.
    from app.services.invoices import pdf as pdf_mod

    return Response(
        content=pdf_mod.render_invoice_pdf(inv_dict, customer=cust_dict, supplier=sup_dict),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{invoice.invoice_number}.pdf"'},
    )


# ---------------------------------------------------------------------------
# Status transitions & overdue sweep
# ---------------------------------------------------------------------------


class _SweepRequest(BaseModel):
    as_of: _date | None = None


@router.post("/sweep-overdue")
async def sweep_overdue_endpoint(
    body: _SweepRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark all of the caller's `sent` invoices past their due date as `overdue`.

    Scoped to the caller's invoices so users can opt-in to a cleanup pass.
    """
    today = body.as_of if body and body.as_of else _date.today()
    result = await db.execute(
        select(Invoice).where(
            Invoice.owner_id == current_user.id,
            Invoice.status == "sent",
            Invoice.due_date < today,
            Invoice.deleted_at.is_(None),
        )
    )
    invoices = result.scalars().all()
    for inv in invoices:
        inv.status = "overdue"
    await db.commit()
    return {"updated": len(invoices)}


@router.post("/{invoice_id}/transition", response_model=InvoiceResponse)
async def transition_invoice(
    invoice_id: uuid.UUID,
    body: InvoiceStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceResponse:
    invoice = await _load_invoice(db, current_user.id, invoice_id)
    try:
        apply_transition(invoice, body.status)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    loaded = await _load_invoice(db, current_user.id, invoice_id)
    return InvoiceResponse.model_validate(loaded)


# ---------------------------------------------------------------------------
# Build invoice from project
# ---------------------------------------------------------------------------


class _FromProjectRequest(BaseModel):
    customer_id: uuid.UUID
    issue_date: _date | None = None
    payment_terms_days: int = 30
    default_vat_rate_bp: int = 2100
    include_materials: bool = True
    include_labor: bool = True
    notes: str | None = None


@router.post(
    "/from-project/{project_id}",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invoice_from_project(
    project_id: uuid.UUID,
    body: _FromProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceResponse:
    customer = await _load_customer(db, current_user.id, body.customer_id)

    try:
        project, draft_lines = await build_project_lines(
            db,
            project_id=project_id,
            owner_id=current_user.id,
            vat_rate_bp=body.default_vat_rate_bp,
            include_materials=body.include_materials,
            include_labor=body.include_labor,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if not draft_lines:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Project has no billable materials or labor — invoice would be empty.",
        )

    issue_date = body.issue_date or _date.today()
    invoice_number = await allocate_invoice_number(db, owner_id=current_user.id, year=issue_date.year)

    invoice = Invoice(
        owner_id=current_user.id,
        customer_id=customer.id,
        project_id=project.id,
        invoice_number=invoice_number,
        issue_date=issue_date,
        due_date=issue_date + timedelta(days=body.payment_terms_days),
        payment_terms_days=body.payment_terms_days,
        notes=body.notes,
        status="draft",
    )

    _attach_lines(invoice, draft_lines)
    db.add(invoice)
    await db.commit()
    loaded = await _load_invoice(db, current_user.id, invoice.id)
    return InvoiceResponse.model_validate(loaded)
