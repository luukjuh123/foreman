"""Materials router — store integrations, material search, estimation."""

from fastapi import APIRouter

from app.schemas.material_estimate import (
    ConcreteSpec,
    EstimateItem,
    LumberSpec,
    PaintSpec,
    RoomEstimateRequest,
    RoomEstimateResponse,
    RoomEstimateResponseData,
    TileSpec,
)
from app.services.material_estimation import (
    estimate_concrete,
    estimate_lumber,
    estimate_paint,
    estimate_tiles,
)

router = APIRouter()


@router.get("/search")
async def search_materials(query: str = "") -> dict:
    """Stub — implement in todo item: Backend: Scraping service base."""
    return {"data": [], "error": None, "query": query}


def _surface_area_m2(length_m: float, width_m: float, height_m: float, surface: str) -> float:
    """Compute the relevant surface area for a given room face."""
    if surface == "floor" or surface == "ceiling":
        return length_m * width_m
    if surface == "walls":
        # 4 walls of a rectangular room.
        return 2.0 * (length_m + width_m) * height_m
    msg = f"Unknown surface: {surface!r}"
    raise ValueError(msg)


@router.post("/estimate", response_model=RoomEstimateResponse)
async def estimate_room_materials(payload: RoomEstimateRequest) -> RoomEstimateResponse:
    """Estimate material quantities for a rectangular room.

    Derives the relevant surface (floor/ceiling/walls) area from the room
    dimensions for each material spec, then delegates to the SI-unit
    estimators in :mod:`app.services.material_estimation`.
    """
    estimates: list[EstimateItem] = []
    for spec in payload.materials:
        if isinstance(spec, PaintSpec):
            area = _surface_area_m2(
                payload.length_m, payload.width_m, payload.height_m, spec.surface
            )
            est = estimate_paint(
                area_m2=area,
                coats=spec.coats,
                coverage_m2_per_liter=spec.coverage_m2_per_liter,
            )
        elif isinstance(spec, TileSpec):
            area = _surface_area_m2(
                payload.length_m, payload.width_m, payload.height_m, spec.surface
            )
            est = estimate_tiles(area_m2=area, waste_pct=spec.waste_pct)
        elif isinstance(spec, ConcreteSpec):
            est = estimate_concrete(
                length_m=payload.length_m,
                width_m=payload.width_m,
                thickness_m=spec.thickness_m,
            )
        elif isinstance(spec, LumberSpec):
            est = estimate_lumber(
                total_length_m=spec.total_length_m,
                piece_length_m=spec.piece_length_m,
            )
        else:  # pragma: no cover — discriminated union exhausts above
            msg = f"Unhandled material spec: {type(spec).__name__}"
            raise TypeError(msg)

        estimates.append(
            EstimateItem(
                material=est.material,
                quantity=est.quantity,
                unit=est.unit,
                notes=est.notes,
            )
        )

    return RoomEstimateResponse(
        data=RoomEstimateResponseData(estimates=estimates),
        error=None,
    )
