"""Materials router — store integrations, material search, estimation."""

from __future__ import annotations

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
from app.schemas.materials_search import (
    ProductResultSchema,
    StoresResponse,
)
from app.services.material_estimation import (
    estimate_concrete,
    estimate_lumber,
    estimate_paint,
    estimate_tiles,
)
from app.services.stores.base import ProductResult
from app.services.stores.bouwmaat import BouwmaatClient
from app.services.stores.comparison import compare_prices
from app.services.stores.gamma import GammaClient
from app.services.stores.hornbach import HornbachClient
from app.services.stores.praxis import PraxisClient
from fastapi import APIRouter

router = APIRouter()

STORE_NAMES = ["hornbach", "gamma", "praxis", "bouwmaat"]


def _to_schema(p: ProductResult) -> ProductResultSchema:
    return ProductResultSchema(
        store=p.store,
        product_id=p.product_id,
        name=p.name,
        url=p.url,
        price_cents=p.price_cents,
        in_stock=p.in_stock,
        unit=p.unit,
        extra=dict(p.extra),
    )


def _make_clients() -> list:
    return [HornbachClient(), GammaClient(), PraxisClient(), BouwmaatClient()]


@router.get("/stores", response_model=StoresResponse)
async def list_stores() -> StoresResponse:
    """Return list of available hardware store names."""
    return StoresResponse(data=STORE_NAMES, error=None)


@router.get("/search")
async def search_materials(query: str = "") -> dict:
    """Search hardware stores for a material query.

    Fans out to Hornbach, Gamma, Praxis, and Bouwmaat concurrently via the
    comparison engine. Individual store failures are swallowed — other stores
    still contribute results. Returns results ranked: in-stock first, then
    cheapest, then store name.
    """
    clients = [
        HornbachClient(),
        GammaClient(),
        PraxisClient(),
        BouwmaatClient(),
    ]
    try:
        results = await compare_prices(query, clients)
    finally:
        for c in clients:
            await c.aclose()

    data = [
        {
            "store": r.store,
            "product_id": r.product_id,
            "name": r.name,
            "url": r.url,
            "price_cents": r.price_cents,
            "in_stock": r.in_stock,
            "unit": r.unit,
        }
        for r in results
    ]
    return {"data": data, "error": None, "query": query}


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
