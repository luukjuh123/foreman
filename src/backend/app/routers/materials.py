"""Materials router — store integrations, material search, estimation."""

from __future__ import annotations

import csv
import io

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
from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()


# ---------------------------------------------------------------------------
# CSV import schemas
# ---------------------------------------------------------------------------


class MaterialImportRow(BaseModel):
    name: str
    quantity: float
    unit: str


class MaterialImportResponse(BaseModel):
    rows: list[MaterialImportRow]
    errors: list[str]


STORE_NAMES = ["hornbach", "gamma", "praxis", "bouwmaat"]


def _to_schema(p: ProductResult) -> ProductResultSchema:
    return ProductResultSchema(
        store=p.store, product_id=p.product_id, name=p.name, url=p.url,
        price_cents=p.price_cents, in_stock=p.in_stock, unit=p.unit, extra=dict(p.extra),
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
    clients = _make_clients()
    try:
        results = await compare_prices(query, clients)
    finally:
        for c in clients:
            await c.aclose()
    return {"data": [{"store": r.store, "product_id": r.product_id, "name": r.name, "url": r.url, "price_cents": r.price_cents, "in_stock": r.in_stock, "unit": r.unit} for r in results], "error": None, "query": query}


def _surface_area_m2(length_m: float, width_m: float, height_m: float, surface: str) -> float:
    """Compute the relevant surface area for a given room face."""
    areas = {"floor": length_m * width_m, "ceiling": length_m * width_m, "walls": 2.0 * (length_m + width_m) * height_m}
    if surface not in areas:
        raise ValueError(f"Unknown surface: {surface!r}")
    return areas[surface]


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
            area = _surface_area_m2(payload.length_m, payload.width_m, payload.height_m, spec.surface)
            est = estimate_paint(
                area_m2=area,
                coats=spec.coats,
                coverage_m2_per_liter=spec.coverage_m2_per_liter,
            )
        elif isinstance(spec, TileSpec):
            area = _surface_area_m2(payload.length_m, payload.width_m, payload.height_m, spec.surface)
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

        estimates.append(EstimateItem(material=est.material, quantity=est.quantity, unit=est.unit, notes=est.notes))

    return RoomEstimateResponse(data=RoomEstimateResponseData(estimates=estimates), error=None)


# ---------------------------------------------------------------------------
# CSV bulk import
# ---------------------------------------------------------------------------

_REQUIRED_COLUMNS = {"name", "quantity", "unit"}


@router.post("/import-csv", response_model=MaterialImportResponse)
async def import_csv(file: UploadFile) -> MaterialImportResponse:
    """Parse a CSV file and return a list of material rows.

    Required CSV columns: name, quantity, unit.
    Optional columns: description, store_preference (ignored but accepted).
    Rows with non-numeric quantity are skipped and reported in errors.
    """
    raw = await file.read()
    if not raw.strip():
        raise HTTPException(status_code=422, detail="Het bestand is leeg.")

    text = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    # Validate required columns exist in header
    fieldnames = {f.strip().lower() for f in (reader.fieldnames or [])}
    missing = _REQUIRED_COLUMNS - fieldnames
    if missing:
        missing_str = ", ".join(sorted(missing))
        raise HTTPException(
            status_code=422,
            detail=f"Ontbrekende kolommen: {missing_str}",
        )

    rows: list[MaterialImportRow] = []
    errors: list[str] = []

    for i, raw_row in enumerate(reader, start=1):
        name = (raw_row.get("name") or "").strip()
        unit = (raw_row.get("unit") or "").strip()
        qty_str = (raw_row.get("quantity") or "").strip()

        try:
            quantity = float(qty_str)
        except (ValueError, TypeError):
            errors.append(f"Rij {i} ({name!r}): ongeldige hoeveelheid {qty_str!r}")
            continue

        rows.append(MaterialImportRow(name=name, quantity=quantity, unit=unit))

    return MaterialImportResponse(rows=rows, errors=errors)
