"""Pydantic schemas for safety & compliance."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

# ---------------------------------------------------------------------------
# Certification schemas
# ---------------------------------------------------------------------------

_CERT_TYPES = {"VCA_BASIS", "VCA_VOL", "BHV", "EHBO", "ARBO", "ASBESTVERWIJDERING", "OTHER"}
_CERT_STATUSES = {"active", "expiring_soon", "expired"}


class CertificationCreate(BaseModel):
    cert_type: str = Field(description="One of: VCA_BASIS, VCA_VOL, BHV, EHBO, ARBO, ASBESTVERWIJDERING, OTHER")
    cert_name: str = Field(min_length=1, max_length=255)
    issued_date: date
    expiry_date: date
    issuing_body: str = Field(min_length=1, max_length=255)
    staff_id: uuid.UUID | None = None
    company_wide: bool = False
    document_url: str | None = None

    @model_validator(mode="after")
    def _check_cert_type(self) -> CertificationCreate:
        if self.cert_type not in _CERT_TYPES:
            raise ValueError(f"cert_type must be one of {sorted(_CERT_TYPES)}")
        return self


class CertificationUpdate(BaseModel):
    cert_name: str | None = None
    issuing_body: str | None = None
    issued_date: date | None = None
    expiry_date: date | None = None
    document_url: str | None = None
    status: str | None = None


class CertificationResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    staff_id: uuid.UUID | None
    company_wide: bool
    cert_type: str
    cert_name: str
    issued_date: date
    expiry_date: date
    issuing_body: str
    document_url: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CertificationListResponse(BaseModel):
    data: list[CertificationResponse]
    total: int
    page: int
    per_page: int


# ---------------------------------------------------------------------------
# Incident schemas
# ---------------------------------------------------------------------------

_SEVERITIES = {"near_miss", "minor", "major", "critical"}


class IncidentCreate(BaseModel):
    project_id: uuid.UUID
    incident_date: date
    severity: str
    description: str = Field(min_length=1)
    corrective_action: str | None = None
    reported_by_user_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _check_severity(self) -> IncidentCreate:
        if self.severity not in _SEVERITIES:
            raise ValueError(f"severity must be one of {sorted(_SEVERITIES)}")
        return self


class IncidentUpdate(BaseModel):
    incident_date: date | None = None
    severity: str | None = None
    description: str | None = None
    corrective_action: str | None = None
    resolved_at: datetime | None = None


class IncidentResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    project_id: uuid.UUID
    reported_by_user_id: uuid.UUID | None
    incident_date: date
    severity: str
    description: str
    corrective_action: str | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IncidentListResponse(BaseModel):
    data: list[IncidentResponse]
    total: int
    page: int
    per_page: int


class IncidentStatsResponse(BaseModel):
    total: int
    by_severity: dict[str, int]
    by_project: dict[str, int]


# ---------------------------------------------------------------------------
# RIE Checklist schemas
# ---------------------------------------------------------------------------


class RIECreate(BaseModel):
    project_id: uuid.UUID
    template_name: str = Field(min_length=1, max_length=255)
    items: list[dict[str, Any]] = Field(default_factory=list)


class RIEUpdate(BaseModel):
    template_name: str | None = None
    items: list[dict[str, Any]] | None = None
    completed_at: datetime | None = None


class RIEResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    project_id: uuid.UUID
    template_name: str
    items: list[dict[str, Any]]
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class RIEListResponse(BaseModel):
    data: list[RIEResponse]
    total: int
    page: int
    per_page: int


# ---------------------------------------------------------------------------
# Dashboard schema
# ---------------------------------------------------------------------------


class SafetyDashboardResponse(BaseModel):
    expiring_certs_count: int
    open_incidents_count: int
    incomplete_checklists_count: int
