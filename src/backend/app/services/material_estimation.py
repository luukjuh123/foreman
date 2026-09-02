"""Material quantity estimation algorithms (Phase 13 — Material Calculator).

All quantities are returned in SI units (m, m², m³, kg, L). Money is not
involved here — pricing is a separate concern handled by the materials/
financials services.

Coverage rates are sourced from :data:`DEFAULT_COVERAGE_RATES`, a seed
constants table that callers may later override per-material (e.g. via a
DB-backed lookup). Each algorithm also accepts an explicit override for
testability.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

# ----------------------------------------------------------------------------
# Seed coverage rates. This dict acts as the canonical "seed data table" for
# material coverage / waste / unit metadata. A future migration may move it
# into a DB table; the public API (:func:`get_coverage_rate`) is stable.
# ----------------------------------------------------------------------------
DEFAULT_COVERAGE_RATES: dict[str, dict[str, Any]] = {
    "paint": {
        "coverage_m2_per_liter": 12.0,  # typical interior wall paint, 1 coat
        "unit": "L",
    },
    "tiles": {
        "waste_pct": 10.0,  # industry-standard cutting/breakage allowance
        "unit": "m2",
    },
    "concrete": {
        "unit": "m3",
    },
    "lumber": {
        "unit": "m",
    },
}


def get_coverage_rate(material: str) -> dict[str, Any]:
    if material not in DEFAULT_COVERAGE_RATES:
        raise KeyError(f"No seed coverage rate for material {material!r}")
    return dict(DEFAULT_COVERAGE_RATES[material])


@dataclass(frozen=True)
class MaterialEstimate:
    """A material quantity estimate in SI units."""

    material: str
    quantity: float
    unit: str
    notes: str = ""


def _require_positive(name: str, value: float, *, allow_zero: bool = True) -> None:
    if value < 0 or (not allow_zero and value == 0):
        bound = ">= 0" if allow_zero else "> 0"
        msg = f"{name} must be {bound}, got {value!r}"
        raise ValueError(msg)


def estimate_paint(area_m2: float, coats: int = 2, coverage_m2_per_liter: float | None = None) -> MaterialEstimate:
    _require_positive("area_m2", area_m2)
    if coats < 1:
        raise ValueError(f"coats must be >= 1, got {coats!r}")
    coverage_m2_per_liter = coverage_m2_per_liter or float(DEFAULT_COVERAGE_RATES["paint"]["coverage_m2_per_liter"])
    _require_positive("coverage_m2_per_liter", coverage_m2_per_liter, allow_zero=False)
    raw_liters = (area_m2 * coats) / coverage_m2_per_liter
    return MaterialEstimate(material="paint", quantity=float(math.ceil(raw_liters)), unit="L",
                            notes=f"{coats} coat(s) @ {coverage_m2_per_liter} m²/L (raw={raw_liters:.3f} L, rounded up)")


def estimate_tiles(area_m2: float, waste_pct: float | None = None) -> MaterialEstimate:
    _require_positive("area_m2", area_m2)
    waste_pct = waste_pct if waste_pct is not None else float(DEFAULT_COVERAGE_RATES["tiles"]["waste_pct"])
    _require_positive("waste_pct", waste_pct)
    return MaterialEstimate(material="tiles", quantity=round(area_m2 * (1 + waste_pct / 100), 2),
                            unit="m2", notes=f"+{waste_pct}% waste")


def estimate_concrete(length_m: float, width_m: float, thickness_m: float) -> MaterialEstimate:
    for name, val in [("length_m", length_m), ("width_m", width_m), ("thickness_m", thickness_m)]:
        _require_positive(name, val, allow_zero=False)
    return MaterialEstimate(material="concrete", quantity=round(length_m * width_m * thickness_m, 3),
                            unit="m3", notes=f"slab {length_m}×{width_m}×{thickness_m} m")


def estimate_lumber(total_length_m: float, piece_length_m: float) -> MaterialEstimate:
    _require_positive("total_length_m", total_length_m)
    _require_positive("piece_length_m", piece_length_m, allow_zero=False)
    pieces = math.ceil(total_length_m / piece_length_m) if total_length_m else 0
    return MaterialEstimate(material="lumber", quantity=round(pieces * piece_length_m, 3),
                            unit="m", notes=f"{pieces} pieces @ {piece_length_m} m")
