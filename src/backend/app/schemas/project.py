"""Pydantic schemas for Project, Phase, Task, and TaskDependency."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------


class TaskCreate(BaseModel):
    name: str
    description: str | None = None
    status: Literal["todo", "in_progress", "done", "blocked"] = "todo"
    priority: int = 0
    estimated_hours: float = 0.0
    labor_cost_cents: int = 0
    start_date: date | None = None
    end_date: date | None = None


class TaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: Literal["todo", "in_progress", "done", "blocked"] | None = None
    priority: int | None = None
    estimated_hours: float | None = None
    labor_cost_cents: int | None = None
    start_date: date | None = None
    end_date: date | None = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    phase_id: uuid.UUID
    name: str
    description: str | None
    status: str
    priority: int
    estimated_hours: float
    labor_cost_cents: int
    start_date: date | None
    end_date: date | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Phase
# ---------------------------------------------------------------------------


class PhaseCreate(BaseModel):
    name: str
    description: str | None = None
    order_index: int = 0
    status: Literal["pending", "active", "completed"] = "pending"
    start_date: date | None = None
    end_date: date | None = None


class PhaseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    order_index: int | None = None
    status: Literal["pending", "active", "completed"] | None = None
    start_date: date | None = None
    end_date: date | None = None


class PhaseResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    order_index: int
    status: str
    start_date: date | None
    end_date: date | None
    created_at: datetime
    updated_at: datetime
    tasks: list[TaskResponse] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    status: Literal["draft", "active", "completed", "archived"] = "draft"
    start_date: date | None = None
    end_date: date | None = None
    budget_cents: int = 0


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: Literal["draft", "active", "completed", "archived"] | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget_cents: int | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: str | None
    status: str
    start_date: date | None
    end_date: date | None
    budget_cents: int
    created_at: datetime
    updated_at: datetime
    phases: list[PhaseResponse] = []

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    data: list[ProjectResponse]
    total: int
    page: int
    per_page: int


# ---------------------------------------------------------------------------
# TaskDependency
# ---------------------------------------------------------------------------


class TaskDependencyCreate(BaseModel):
    depends_on_task_id: uuid.UUID


class TaskDependencyResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    depends_on_task_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
