"""Material quantity estimation algorithms.

All quantities are returned in SI units (m, m², m³, kg, L).
"""

from dataclasses import dataclass


@dataclass
class MaterialEstimate:
    """A material quantity estimate."""

    material: str
    quantity: float
    unit: str
    notes: str = ""


def estimate_paint(area_m2: float, coats: int = 2, coverage_m2_per_liter: float = 10.0) -> MaterialEstimate:
    """Estimate paint needed for a surface area.

    Args:
        area_m2: Surface area in square meters.
        coats: Number of paint coats.
        coverage_m2_per_liter: Coverage per liter (default 10 m²/L).

    Returns:
        MaterialEstimate with quantity in liters.
    """
    if area_m2 < 0 or coats < 1 or coverage_m2_per_liter <= 0:
        msg = "Invalid input: area_m2 must be >= 0, coats >= 1, coverage > 0"
        raise ValueError(msg)
    liters = (area_m2 * coats) / coverage_m2_per_liter
    return MaterialEstimate(material="paint", quantity=liters, unit="L", notes=f"{coats} coats")


def estimate_tiles(area_m2: float, waste_pct: float = 10.0) -> MaterialEstimate:
    """Estimate tiles needed for a floor or wall area with waste factor.

    Args:
        area_m2: Area to tile in square meters.
        waste_pct: Waste percentage (default 10%).

    Returns:
        MaterialEstimate with quantity in m².
    """
    if area_m2 < 0 or waste_pct < 0:
        msg = "Invalid input: area_m2 and waste_pct must be >= 0"
        raise ValueError(msg)
    total = area_m2 * (1 + waste_pct / 100)
    return MaterialEstimate(
        material="tiles",
        quantity=round(total, 2),
        unit="m2",
        notes=f"+{waste_pct}% waste",
    )


def estimate_concrete(volume_m3: float) -> MaterialEstimate:
    """Estimate concrete volume needed.

    Args:
        volume_m3: Volume in cubic meters.

    Returns:
        MaterialEstimate with quantity in m³.
    """
    if volume_m3 < 0:
        msg = "Invalid input: volume_m3 must be >= 0"
        raise ValueError(msg)
    return MaterialEstimate(material="concrete", quantity=volume_m3, unit="m3")


def estimate_lumber(length_m: float, count: int = 1) -> MaterialEstimate:
    """Estimate lumber needed in linear meters.

    Args:
        length_m: Length per piece in meters.
        count: Number of pieces.

    Returns:
        MaterialEstimate with quantity in linear meters.
    """
    if length_m < 0 or count < 0:
        msg = "Invalid input: length_m and count must be >= 0"
        raise ValueError(msg)
    return MaterialEstimate(
        material="lumber",
        quantity=length_m * count,
        unit="m",
        notes=f"{count} pieces × {length_m}m",
    )
