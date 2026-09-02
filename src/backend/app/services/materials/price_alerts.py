"""Smart material price alert service.

Responsibilities:
- detect_price_drop: pure function — returns PriceAlert when new price is >10% below old.
- detect_stock_change: pure function — returns PriceAlert when item goes from OOS → in-stock.
- PriceAlertService.get_alerts_for_project: reads snapshot history, surfaces alerts for all
  materials in a project.
- PriceAlertService.get_weekly_trends: per-material summary of last 7 days' prices (min, max,
  avg, direction).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.models.material import Material
from app.models.price_alert import MaterialPriceSnapshot
from app.models.project import Phase, Task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Alert fires when drop exceeds this percentage (strictly greater than).
_DROP_THRESHOLD_PCT = 10.0

# Weekly window in days.
_TREND_WINDOW_DAYS = 7

# Direction thresholds: >2% change from first to last price to be "up" or "down".
_TREND_DIRECTION_THRESHOLD_PCT = 2.0


@dataclass(frozen=True)
class PriceAlert:
    """A single price or stock alert for a material."""

    alert_type: str  # "price_drop" | "restock"
    material_id: uuid.UUID
    material_name: str
    store: str
    old_price_cents: int
    new_price_cents: int
    drop_pct: float  # 0.0 for restock alerts


@dataclass(frozen=True)
class PriceTrendSummary:
    """Weekly price trend summary for one material."""

    material_id: uuid.UUID
    material_name: str
    min_price_cents: int
    max_price_cents: int
    avg_price_cents: float
    trend_direction: str  # "up" | "down" | "stable"
    snapshot_count: int


# ---------------------------------------------------------------------------
# Pure detection functions
# ---------------------------------------------------------------------------


def detect_price_drop(
    *,
    material_name: str,
    old_price: int,
    new_price: int,
    store: str,
    material_id: uuid.UUID | None = None,
) -> PriceAlert | None:
    """Return a PriceAlert if new_price is more than 10% below old_price.

    Returns None when:
    - old_price is 0 (no baseline)
    - drop is <= 10%
    - price increased
    """
    if old_price <= 0:
        return None
    if new_price >= old_price:
        return None
    drop_pct = (old_price - new_price) / old_price * 100.0
    if drop_pct <= _DROP_THRESHOLD_PCT:
        return None
    return PriceAlert(
        alert_type="price_drop",
        material_id=material_id or uuid.UUID(int=0),
        material_name=material_name,
        store=store,
        old_price_cents=old_price,
        new_price_cents=new_price,
        drop_pct=round(drop_pct, 2),
    )


def detect_stock_change(
    *,
    material_name: str,
    was_in_stock: bool,
    now_in_stock: bool,
    store: str,
    material_id: uuid.UUID | None = None,
    price_cents: int = 0,
) -> PriceAlert | None:
    """Return a PriceAlert when a previously OOS item becomes available.

    Only fires on out-of-stock → in-stock transitions.
    """
    if was_in_stock or not now_in_stock:
        return None
    return PriceAlert(
        alert_type="restock",
        material_id=material_id or uuid.UUID(int=0),
        material_name=material_name,
        store=store,
        old_price_cents=price_cents,
        new_price_cents=price_cents,
        drop_pct=0.0,
    )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PriceAlertService:
    """Reads snapshot history from the database and surfaces alerts + trends."""

    async def get_alerts_for_project(
        self,
        db: AsyncSession,
        *,
        project_id: uuid.UUID,
    ) -> list[PriceAlert]:
        """Scan all materials in a project and return active alerts.

        For each (material, store) pair, compares the two most recent snapshots:
        - If price dropped >10%: price_drop alert.
        - If stock changed OOS→available: restock alert.
        """
        materials = await self._get_project_materials(db, project_id)
        if not materials:
            return []

        alerts: list[PriceAlert] = []
        for material in materials:
            mat_alerts = await self._alerts_for_material(db, material)
            alerts.extend(mat_alerts)
        return alerts

    async def get_weekly_trends(
        self,
        db: AsyncSession,
        *,
        project_id: uuid.UUID,
    ) -> list[PriceTrendSummary]:
        """Return weekly price trend summaries for all materials in a project.

        Only includes snapshots from the last 7 days. Materials with no recent
        snapshots are excluded.
        """
        materials = await self._get_project_materials(db, project_id)
        if not materials:
            return []

        cutoff = datetime.now(UTC) - timedelta(days=_TREND_WINDOW_DAYS)
        summaries: list[PriceTrendSummary] = []

        for material in materials:
            rows = (
                (
                    await db.execute(
                        select(MaterialPriceSnapshot)
                        .where(
                            MaterialPriceSnapshot.material_id == material.id,
                            MaterialPriceSnapshot.snapped_at >= cutoff,
                        )
                        .order_by(MaterialPriceSnapshot.snapped_at.asc())
                    )
                )
                .scalars()
                .all()
            )

            if not rows:
                continue

            prices = [r.price_cents for r in rows]
            min_p = min(prices)
            max_p = max(prices)
            avg_p = sum(prices) / len(prices)

            # Direction: compare first vs last price in the window.
            first_price = prices[0]
            last_price = prices[-1]
            if first_price > 0:
                change_pct = (last_price - first_price) / first_price * 100.0
            else:
                change_pct = 0.0

            if change_pct > _TREND_DIRECTION_THRESHOLD_PCT:
                direction = "up"
            elif change_pct < -_TREND_DIRECTION_THRESHOLD_PCT:
                direction = "down"
            else:
                direction = "stable"

            summaries.append(
                PriceTrendSummary(
                    material_id=material.id,
                    material_name=material.name,
                    min_price_cents=min_p,
                    max_price_cents=max_p,
                    avg_price_cents=avg_p,
                    trend_direction=direction,
                    snapshot_count=len(rows),
                )
            )

        return summaries

    # -- internals ------------------------------------------------------------

    async def _get_project_materials(self, db: AsyncSession, project_id: uuid.UUID) -> list[Material]:
        """Return all materials for tasks in phases of a project."""
        rows = (
            (
                await db.execute(
                    select(Material)
                    .join(Task, Material.task_id == Task.id)
                    .join(Phase, Task.phase_id == Phase.id)
                    .where(Phase.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    async def _alerts_for_material(self, db: AsyncSession, material: Material) -> list[PriceAlert]:
        """Return alerts for a single material across all stores."""
        # Fetch distinct stores that have snapshots for this material.
        stores_result = await db.execute(
            select(MaterialPriceSnapshot.store).where(MaterialPriceSnapshot.material_id == material.id).distinct()
        )
        stores = [r[0] for r in stores_result.all()]

        alerts: list[PriceAlert] = []
        for store in stores:
            # Fetch the two most recent snapshots for this (material, store).
            snaps = (
                (
                    await db.execute(
                        select(MaterialPriceSnapshot)
                        .where(
                            MaterialPriceSnapshot.material_id == material.id,
                            MaterialPriceSnapshot.store == store,
                        )
                        .order_by(MaterialPriceSnapshot.snapped_at.desc())
                        .limit(2)
                    )
                )
                .scalars()
                .all()
            )

            if len(snaps) < 2:
                continue

            latest, previous = snaps[0], snaps[1]

            # Price drop alert.
            drop_alert = detect_price_drop(
                material_name=material.name,
                old_price=previous.price_cents,
                new_price=latest.price_cents,
                store=store,
                material_id=material.id,
            )
            if drop_alert:
                alerts.append(drop_alert)

            # Restock alert.
            restock_alert = detect_stock_change(
                material_name=material.name,
                was_in_stock=previous.in_stock,
                now_in_stock=latest.in_stock,
                store=store,
                material_id=material.id,
                price_cents=latest.price_cents,
            )
            if restock_alert:
                alerts.append(restock_alert)

        return alerts
