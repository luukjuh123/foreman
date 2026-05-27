"""Customer model — canonical definition, used by both customers and invoices routers."""

# The canonical Customer model (scoped by owner_id, Dutch invoice fields) lives in
# invoice.py and was defined there first. Importing it here so app.routers.customers
# can reference the same class without a duplicate table definition.
from app.models.invoice import Customer

from app.core.database import Base
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class Customer(Base):
    """Billing/contact party for invoices and CRM, scoped per owner."""

    __tablename__ = "customers"
    # extend_existing resolves SQLAlchemy conflict with invoice.Customer
    # which also uses __tablename__ = "customers". Both classes map the same table.
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country_code: Mapped[str] = mapped_column(String(2), default="NL")
    kvk_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    btw_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
