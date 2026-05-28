"""Safety & compliance models — VCA, ARBO, RI&E tracking."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class CertType(enum.StrEnum):
    VCA_BASIS = "VCA_BASIS"
    VCA_VOL = "VCA_VOL"
    BHV = "BHV"
    EHBO = "EHBO"
    ARBO = "ARBO"
    ASBESTVERWIJDERING = "ASBESTVERWIJDERING"
    OTHER = "OTHER"


class CertStatus(enum.StrEnum):
    active = "active"
    expiring_soon = "expiring_soon"
    expired = "expired"


class IncidentSeverity(enum.StrEnum):
    near_miss = "near_miss"
    minor = "minor"
    major = "major"
    critical = "critical"


class SafetyCertification(Base):
    """A safety certification held by a staff member or at company level."""

    __tablename__ = "safety_certifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL"), nullable=True, index=True
    )
    company_wide: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    cert_name: Mapped[str] = mapped_column(String(255), nullable=False)
    issued_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    issuing_body: Mapped[str] = mapped_column(String(255), nullable=False)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SafetyIncident(Base):
    """A safety incident logged against a project."""

    __tablename__ = "safety_incidents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reported_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    incident_date: Mapped[date] = mapped_column(Date, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    corrective_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RIEChecklist(Base):
    """A Risico-Inventarisatie en -Evaluatie checklist for a project."""

    __tablename__ = "rie_checklists"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # JSON array of {question, risk_level, mitigation, checked_by, checked_at}
    items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
