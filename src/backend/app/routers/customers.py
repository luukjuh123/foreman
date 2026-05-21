"""Customers router — CRUD for client (opdrachtgever) management."""

import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.invoice import Customer
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.customer import (
    CustomerCreate,
    CustomerListResponse,
    CustomerResponse,
    CustomerUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_customer_or_404(
    customer_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


@router.get("/", response_model=CustomerListResponse)
async def list_customers(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerListResponse:
    offset = (page - 1) * per_page

    count_result = await db.execute(
        select(func.count())
        .select_from(Customer)
        .where(Customer.owner_id == current_user.id, Customer.deleted_at.is_(None))
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(Customer)
        .where(Customer.owner_id == current_user.id, Customer.deleted_at.is_(None))
        .offset(offset)
        .limit(per_page)
    )
    customers = result.scalars().all()

    return CustomerListResponse(
        data=[CustomerResponse.model_validate(c) for c in customers],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    customer = Customer(
        owner_id=current_user.id,
        name=body.name,
        contact_name=body.contact_name,
        email=body.email,
        phone=body.phone,
        address_line1=body.address_line1,
        postal_code=body.postal_code,
        city=body.city,
        kvk_number=body.kvk_number,
        vat_number=body.vat_number,
        notes=body.notes,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    customer = await _get_customer_or_404(customer_id, current_user.id, db)
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    body: CustomerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    customer = await _get_customer_or_404(customer_id, current_user.id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)

    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    customer = await _get_customer_or_404(customer_id, current_user.id, db)
    customer.deleted_at = datetime.now(UTC)
    await db.commit()
