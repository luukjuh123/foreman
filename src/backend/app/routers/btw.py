"""BTW (VAT) aangifte router.

Endpoints:
  POST /api/v1/btw/generate          — generate draft for a quarter
  GET  /api/v1/btw                   — list all aangiftes
  GET  /api/v1/btw/{id}              — get one aangifte
  PATCH /api/v1/btw/{id}             — update overrides / status
  GET  /api/v1/btw/{id}/export/csv   — export as CSV
"""

from __future__ import annotations

import csv
import io
import uuid

from app.core.database import get_db
from app.models.btw import BtwAangifte
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.btw import BtwAangifteResponse, BtwAangifteUpdate, BtwGenerateRequest
from app.services.btw.calculation import calculate_btw_boxes
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_aangifte_or_404(
    aangifte_id: uuid.UUID,
    owner_id: uuid.UUID,
    db: AsyncSession,
) -> BtwAangifte:
    result = await db.execute(
        select(BtwAangifte).where(
            BtwAangifte.id == aangifte_id,
            BtwAangifte.owner_id == owner_id,
        )
    )
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BTW aangifte not found")
    return obj


@router.post(
    "/generate",
    response_model=BtwAangifteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_btw_aangifte(
    body: BtwGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BtwAangifteResponse:
    """Generate a draft BTW aangifte for the given year/quarter.

    Aggregates invoice VAT data into boxes 1a-1c and 5a/5b/5d.
    If an aangifte for this period already exists it is regenerated
    (boxes recalculated, status reset to draft).
    """
    boxes = await calculate_btw_boxes(
        owner_id=current_user.id,
        year=body.year,
        quarter=body.quarter,
        db=db,
    )

    # Upsert: recalculate if draft exists, create if not.
    result = await db.execute(
        select(BtwAangifte).where(
            BtwAangifte.owner_id == current_user.id,
            BtwAangifte.year == body.year,
            BtwAangifte.quarter == body.quarter,
        )
    )
    existing = result.scalar_one_or_none()

    if existing is not None and existing.status == "draft":
        existing.box_1a_net_cents = boxes.box_1a_net_cents
        existing.box_1b_net_cents = boxes.box_1b_net_cents
        existing.box_1c_net_cents = boxes.box_1c_net_cents
        existing.box_1d_net_cents = boxes.box_1d_net_cents
        existing.box_5a_vat_due_cents = boxes.box_5a_vat_due_cents
        existing.box_5b_voorbelasting_cents = boxes.box_5b_voorbelasting_cents
        existing.box_5d_payable_cents = boxes.box_5d_payable_cents
        await db.commit()
        await db.refresh(existing)
        return BtwAangifteResponse.model_validate(existing)

    aangifte = BtwAangifte(
        owner_id=current_user.id,
        year=body.year,
        quarter=body.quarter,
        status="draft",
        box_1a_net_cents=boxes.box_1a_net_cents,
        box_1b_net_cents=boxes.box_1b_net_cents,
        box_1c_net_cents=boxes.box_1c_net_cents,
        box_1d_net_cents=boxes.box_1d_net_cents,
        box_5a_vat_due_cents=boxes.box_5a_vat_due_cents,
        box_5b_voorbelasting_cents=boxes.box_5b_voorbelasting_cents,
        box_5d_payable_cents=boxes.box_5d_payable_cents,
    )
    db.add(aangifte)
    await db.commit()
    await db.refresh(aangifte)
    return BtwAangifteResponse.model_validate(aangifte)


@router.get("/", response_model=list[BtwAangifteResponse])
async def list_btw_aangiftes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BtwAangifteResponse]:
    """List all BTW aangiftes for the current user, newest first."""
    result = await db.execute(
        select(BtwAangifte)
        .where(BtwAangifte.owner_id == current_user.id)
        .order_by(BtwAangifte.year.desc(), BtwAangifte.quarter.desc())
    )
    return [BtwAangifteResponse.model_validate(r) for r in result.scalars().all()]


@router.get("/{aangifte_id}", response_model=BtwAangifteResponse)
async def get_btw_aangifte(
    aangifte_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BtwAangifteResponse:
    obj = await _get_aangifte_or_404(aangifte_id, current_user.id, db)
    return BtwAangifteResponse.model_validate(obj)


@router.patch("/{aangifte_id}", response_model=BtwAangifteResponse)
async def update_btw_aangifte(
    aangifte_id: uuid.UUID,
    body: BtwAangifteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BtwAangifteResponse:
    """Update notes, status, or manual box overrides."""
    obj = await _get_aangifte_or_404(aangifte_id, current_user.id, db)
    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return BtwAangifteResponse.model_validate(obj)


@router.get("/{aangifte_id}/export/csv")
async def export_btw_csv(
    aangifte_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export BTW aangifte as CSV for accountant."""
    obj = await _get_aangifte_or_404(aangifte_id, current_user.id, db)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["BTW Aangifte", f"Q{obj.quarter} {obj.year}"])
    writer.writerow(["Status", obj.status])
    writer.writerow([])
    writer.writerow(["Veld", "Omschrijving", "Bedrag (euro cents)"])
    writer.writerow(["box_1a", "Leveringen/diensten 21% (netto)", obj.box_1a_net_cents])
    writer.writerow(["box_1b", "Leveringen/diensten 9% (netto)", obj.box_1b_net_cents])
    writer.writerow(["box_1c", "Leveringen/diensten 0% (netto)", obj.box_1c_net_cents])
    writer.writerow(["box_1d", "Privégebruik (netto)", obj.box_1d_net_cents])
    writer.writerow(["box_5a", "Totaal BTW verschuldigd", obj.box_5a_vat_due_cents])
    writer.writerow(["box_5b", "Totaal voorbelasting", obj.box_5b_voorbelasting_cents])
    writer.writerow(["box_5d", "Te betalen / terug te ontvangen", obj.box_5d_payable_cents])
    if obj.notes:
        writer.writerow([])
        writer.writerow(["Notities", obj.notes])

    filename = f"btw-aangifte-{obj.year}-q{obj.quarter}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
