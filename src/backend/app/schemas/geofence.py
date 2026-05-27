"""Pydantic schemas for GPS geofence and attendance log."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class GeofenceCreate(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    radius_meters: int = Field(..., gt=0, le=50_000)


class GeofenceResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    lat: float
    lng: float
    radius_meters: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CheckInRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)


class CheckOutRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)


class AttendanceLogResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    checked_in_at: datetime
    checked_out_at: datetime | None
    duration_seconds: int | None
    checkin_lat: float
    checkin_lng: float
    checkout_lat: float | None
    checkout_lng: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AttendanceListResponse(BaseModel):
    data: list[AttendanceLogResponse]
