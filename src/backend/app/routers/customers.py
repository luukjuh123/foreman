"""Customers router — CRUD for customers."""

import uuid

from app.core.database import get_db
from app.models.customer import Customer
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/customers")


async def _get_or_404(customer_id: uuid.UUID, db: AsyncSession) -> Customer:
    result = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None)))
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Customer:
    customer = Customer(owner_id=current_user.id, **body.model_dump())
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.get("/", response_model=list[CustomerResponse])
async def list_customers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Customer]:
    result = await db.execute(
        select(Customer)
        .where(Customer.owner_id == current_user.id, Customer.deleted_at.is_(None))
        .order_by(Customer.name)
    )
    return list(result.scalars().all())


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> Customer:
    return await _get_or_404(customer_id, db)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    body: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> Customer:
    customer = await _get_or_404(customer_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> None:
    customer = await _get_or_404(customer_id, db)
    await db.delete(customer)
    await db.commit()
