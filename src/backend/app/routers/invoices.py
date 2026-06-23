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
from app.routers.deps import count_query, get_or_404
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()

_CUSTOMER_FIELD_MAP = {
    "vat_number": "btw_number",
    "address_line1": "address",
}
_CUSTOMER_FIELDS = ("name", "email", "kvk_number", "postal_code", "city")


def _customer_schema_to_model(data: dict, owner_id: uuid.UUID) -> dict:
    mapped = {"owner_id": owner_id}
    for k in _CUSTOMER_FIELDS:
        mapped[k] = data.get(k)
    for schema_k, model_k in _CUSTOMER_FIELD_MAP.items():
        mapped[model_k] = data.get(schema_k)
    return mapped


def _customer_to_response(c: Customer) -> CustomerResponse:
    return CustomerResponse(
        id=c.id, name=c.name, email=c.email, kvk_number=c.kvk_number,
        vat_number=c.btw_number, address_line1=c.address, address_line2=None,
        postal_code=c.postal_code, city=c.city, country_code="NL",
    )


def _customer_to_dict(c: Customer) -> dict:
    return dict(
        name=c.name, email=c.email, vat_number=c.btw_number,
        kvk_number=c.kvk_number, address_line1=c.address,
        postal_code=c.postal_code, city=c.city, country_code="NL",
    )


@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    customer = Customer(**_customer_schema_to_model(body.model_dump(), current_user.id))
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return _customer_to_response(customer)


@router.get("/customers", response_model=list[CustomerResponse])
async def list_customers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CustomerResponse]:
    result = await db.execute(
        select(Customer).where(Customer.owner_id == current_user.id, Customer.deleted_at.is_(None))
    )
    return [_customer_to_response(c) for c in result.scalars().all()]


async def _load_customer(db: AsyncSession, owner_id: uuid.UUID, customer_id: uuid.UUID) -> Customer:
    return await get_or_404(
        db, Customer,
        Customer.id == customer_id, Customer.owner_id == owner_id, Customer.deleted_at.is_(None),
    )


async def _load_invoice(db: AsyncSession, owner_id: uuid.UUID, invoice_id: uuid.UUID) -> Invoice:
    return await get_or_404(
        db, Invoice,
        Invoice.id == invoice_id, Invoice.owner_id == owner_id, Invoice.deleted_at.is_(None),
        options=selectinload(Invoice.lines),
    )


def _build_lines(invoice: Invoice, lines) -> None:
    subtotal = vat_total = 0
    for idx, ln in enumerate(lines):
        net, vat = compute_line_totals(
            quantity=ln.quantity, unit_price_cents=ln.unit_price_cents, vat_rate_bp=ln.vat_rate_bp,
        )
        invoice.lines.append(InvoiceLine(
            position=idx, description=ln.description, quantity=ln.quantity, unit=ln.unit,
            unit_price_cents=ln.unit_price_cents, vat_rate_bp=ln.vat_rate_bp,
            line_net_cents=net, line_vat_cents=vat,
        ))
        subtotal += net
        vat_total += vat
    invoice.subtotal_cents = subtotal
    invoice.vat_total_cents = vat_total
    invoice.total_cents = subtotal + vat_total


async def _create_and_save(db: AsyncSession, invoice: Invoice, lines, owner_id: uuid.UUID) -> InvoiceResponse:
    _build_lines(invoice, lines)
    db.add(invoice)
    await db.commit()
    loaded = await _load_invoice(db, owner_id, invoice.id)
    return InvoiceResponse.model_validate(loaded)


@router.post("/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceResponse:
    await _load_customer(db, current_user.id, body.customer_id)
    invoice_number = await allocate_invoice_number(db, owner_id=current_user.id, year=body.issue_date.year)
    invoice = Invoice(
        owner_id=current_user.id, customer_id=body.customer_id, project_id=body.project_id,
        invoice_number=invoice_number, issue_date=body.issue_date,
        due_date=body.issue_date + timedelta(days=body.payment_terms_days),
        payment_terms_days=body.payment_terms_days, notes=body.notes, status="draft",
    )
    return await _create_and_save(db, invoice, body.lines, current_user.id)


@router.get("/", response_model=InvoiceListResponse)
async def list_invoices(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceListResponse:
    base = select(Invoice).where(Invoice.owner_id == current_user.id, Invoice.deleted_at.is_(None))
    if status_filter:
        base = base.where(Invoice.status == status_filter)
    total = await count_query(db, base)
    result = await db.execute(
        base.options(selectinload(Invoice.lines)).order_by(Invoice.created_at.desc())
        .offset((page - 1) * per_page).limit(per_page)
    )
    return InvoiceListResponse(
        data=[InvoiceResponse.model_validate(i) for i in result.scalars().all()],
        total=total, page=page, per_page=per_page,
    )


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceResponse:
    return InvoiceResponse.model_validate(await _load_invoice(db, current_user.id, invoice_id))


def _invoice_to_dict(invoice: Invoice) -> dict:
    return {
        "invoice_number": invoice.invoice_number, "issue_date": invoice.issue_date,
        "due_date": invoice.due_date, "currency": invoice.currency, "notes": invoice.notes,
        "payment_terms_days": invoice.payment_terms_days, "subtotal_cents": invoice.subtotal_cents,
        "vat_total_cents": invoice.vat_total_cents, "total_cents": invoice.total_cents,
        "lines": [
            {k: getattr(ln, k) for k in (
                "position", "description", "quantity", "unit",
                "unit_price_cents", "vat_rate_bp", "line_net_cents", "line_vat_cents",
            )} for ln in invoice.lines
        ],
    }


def _supplier_from_settings() -> dict:
    _map = {"kvk_number": "company_kvk"}
    keys = ("name", "vat_number", "kvk_number", "address_line1", "postal_code", "city", "country_code", "email", "iban")
    return {k: getattr(settings, _map.get(k, f"company_{k}")) for k in keys}


async def _render_doc(db, current_user, invoice_id, render_fn, media_type, ext):
    invoice = await _load_invoice(db, current_user.id, invoice_id)
    customer = await _load_customer(db, current_user.id, invoice.customer_id)
    content = render_fn(
        _invoice_to_dict(invoice), customer=_customer_to_dict(customer), supplier=_supplier_from_settings(),
    )
    return Response(
        content=content, media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="invoice-{invoice.invoice_number}.{ext}"'},
    )


@router.get("/{invoice_id}/ubl", response_class=Response, responses={200: {"content": {"application/xml": {}}}})
async def get_invoice_ubl(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await _render_doc(db, current_user, invoice_id, build_invoice_ubl_xml, "application/xml", "xml")


@router.get("/{invoice_id}/pdf", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
async def get_invoice_pdf(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    from app.services.invoices import pdf as pdf_mod
    return await _render_doc(db, current_user, invoice_id, pdf_mod.render_invoice_pdf, "application/pdf", "pdf")


class _SweepRequest(BaseModel):
    as_of: _date | None = None


@router.post("/sweep-overdue")
async def sweep_overdue_endpoint(
    body: _SweepRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    today = body.as_of if body and body.as_of else _date.today()
    result = await db.execute(
        select(Invoice).where(
            Invoice.owner_id == current_user.id, Invoice.status == "sent",
            Invoice.due_date < today, Invoice.deleted_at.is_(None),
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
    return InvoiceResponse.model_validate(await _load_invoice(db, current_user.id, invoice_id))


class _FromProjectRequest(BaseModel):
    customer_id: uuid.UUID
    issue_date: _date | None = None
    payment_terms_days: int = 30
    default_vat_rate_bp: int = 2100
    include_materials: bool = True
    include_labor: bool = True
    notes: str | None = None


@router.post("/from-project/{project_id}", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice_from_project(
    project_id: uuid.UUID,
    body: _FromProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceResponse:
    customer = await _load_customer(db, current_user.id, body.customer_id)
    try:
        project, draft_lines = await build_project_lines(
            db, project_id=project_id, owner_id=current_user.id,
            vat_rate_bp=body.default_vat_rate_bp,
            include_materials=body.include_materials, include_labor=body.include_labor,
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
        owner_id=current_user.id, customer_id=customer.id, project_id=project.id,
        invoice_number=invoice_number, issue_date=issue_date,
        due_date=issue_date + timedelta(days=body.payment_terms_days),
        payment_terms_days=body.payment_terms_days, notes=body.notes, status="draft",
    )
    return await _create_and_save(db, invoice, draft_lines, current_user.id)
