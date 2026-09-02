"""Pydantic schemas for the project health score endpoint."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class HealthFactorsResponse(BaseModel):
    schedule_variance: float
    budget_burn_rate: float
    time_accuracy: float
    task_completion_rate: float


class HealthScoreResponse(BaseModel):
    score: int
    grade: Literal["green", "amber", "red"]
    threshold: int
    factors: HealthFactorsResponse
