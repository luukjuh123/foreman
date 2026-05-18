"""Pydantic schemas for the /materials/estimate (Phase 13) endpoint."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ---------------------------------------------------------------------------
# Per-material specs. Each variant declares exactly the inputs needed in
# addition to the room dimensions provided at the top level.
# ---------------------------------------------------------------------------

Surface = Literal["walls", "ceiling", "floor"]


class PaintSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["paint"]
    surface: Surface
    coats: Annotated[int, Field(ge=1, le=10)] = 2
    coverage_m2_per_liter: Annotated[float | None, Field(gt=0)] = None


class TileSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["tiles"]
    surface: Literal["floor", "walls"]
    waste_pct: Annotated[float | None, Field(ge=0)] = None


class ConcreteSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["concrete"]
    surface: Literal["floor"]
    thickness_m: Annotated[float, Field(gt=0)]


class LumberSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["lumber"]
    total_length_m: Annotated[float, Field(ge=0)]
    piece_length_m: Annotated[float, Field(gt=0)]


MaterialSpec = Annotated[
    PaintSpec | TileSpec | ConcreteSpec | LumberSpec,
    Field(discriminator="type"),
]


class RoomEstimateRequest(BaseModel):
    """Room/area dimensions + list of materials to estimate."""

    model_config = ConfigDict(extra="forbid")

    length_m: Annotated[float, Field(gt=0)]
    width_m: Annotated[float, Field(gt=0)]
    height_m: Annotated[float, Field(gt=0)]
    materials: list[MaterialSpec]

    @model_validator(mode="after")
    def _dims_finite(self) -> RoomEstimateRequest:
        # Pydantic's gt=0 already rejects negatives/zero, but guard against NaN.
        for name, val in (
            ("length_m", self.length_m),
            ("width_m", self.width_m),
            ("height_m", self.height_m),
        ):
            if val != val:  # NaN check
                msg = f"{name} must be a finite positive number"
                raise ValueError(msg)
        return self


class EstimateItem(BaseModel):
    material: str
    quantity: float
    unit: str
    notes: str = ""


class RoomEstimateResponseData(BaseModel):
    estimates: list[EstimateItem]


class RoomEstimateResponse(BaseModel):
    data: RoomEstimateResponseData | None
    error: dict | None = None
