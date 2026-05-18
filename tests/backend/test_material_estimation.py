"""Tests for material_estimation algorithms.

Verifies known math examples for paint, tiles, concrete, lumber and that
the seed coverage rates are consulted when no explicit override is given.
"""

import math

import pytest

from app.services.material_estimation import (
    DEFAULT_COVERAGE_RATES,
    MaterialEstimate,
    estimate_concrete,
    estimate_lumber,
    estimate_paint,
    estimate_tiles,
    get_coverage_rate,
)


class TestSeedCoverageRates:
    def test_paint_default_coverage_is_12_m2_per_liter(self) -> None:
        # Seed value: paint covers 12 m² per liter (one coat).
        assert DEFAULT_COVERAGE_RATES["paint"]["coverage_m2_per_liter"] == 12.0

    def test_tiles_default_waste_is_10_pct(self) -> None:
        assert DEFAULT_COVERAGE_RATES["tiles"]["waste_pct"] == 10.0

    def test_get_coverage_rate_returns_dict(self) -> None:
        rate = get_coverage_rate("paint")
        assert rate["coverage_m2_per_liter"] == 12.0
        assert rate["unit"] == "L"

    def test_get_coverage_rate_unknown_raises(self) -> None:
        with pytest.raises(KeyError):
            get_coverage_rate("unobtanium")


class TestEstimatePaint:
    def test_known_example_10m2_one_coat_12_coverage_ceils_to_1L(self) -> None:
        # 10 m² / 12 (m²/L) = 0.833... → ceil → 1 L
        result = estimate_paint(area_m2=10.0, coats=1)
        assert isinstance(result, MaterialEstimate)
        assert result.material == "paint"
        assert result.quantity == 1.0
        assert result.unit == "L"

    def test_known_example_20m2_two_coats_12_coverage_ceils_to_4L(self) -> None:
        # (20 * 2) / 12 = 3.333... → ceil → 4 L
        result = estimate_paint(area_m2=20.0, coats=2)
        assert result.quantity == 4.0

    def test_uses_explicit_coverage_override(self) -> None:
        # 30 m² / 10 (m²/L) = 3 L exact → ceil → 3 L
        result = estimate_paint(area_m2=30.0, coats=1, coverage_m2_per_liter=10.0)
        assert result.quantity == 3.0

    def test_zero_area_returns_zero(self) -> None:
        result = estimate_paint(area_m2=0.0, coats=2)
        assert result.quantity == 0.0

    def test_negative_area_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_paint(area_m2=-1.0)

    def test_zero_coats_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_paint(area_m2=10.0, coats=0)

    def test_zero_coverage_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_paint(area_m2=10.0, coverage_m2_per_liter=0.0)

    def test_quantity_is_always_integer_liters(self) -> None:
        # ceil enforces whole-liter purchases.
        result = estimate_paint(area_m2=7.0, coats=2)  # 14/12 = 1.166
        assert result.quantity == 2.0
        assert result.quantity == math.ceil(result.quantity)


class TestEstimateTiles:
    def test_known_example_25m2_with_default_10pct_waste(self) -> None:
        # 25 * 1.10 = 27.5 m²
        result = estimate_tiles(area_m2=25.0)
        assert result.material == "tiles"
        assert result.quantity == pytest.approx(27.5)
        assert result.unit == "m2"

    def test_zero_waste_pct(self) -> None:
        result = estimate_tiles(area_m2=10.0, waste_pct=0.0)
        assert result.quantity == pytest.approx(10.0)

    def test_explicit_waste_override(self) -> None:
        # 10 m² * 1.15 = 11.5 m²
        result = estimate_tiles(area_m2=10.0, waste_pct=15.0)
        assert result.quantity == pytest.approx(11.5)

    def test_negative_area_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_tiles(area_m2=-5.0)

    def test_negative_waste_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_tiles(area_m2=10.0, waste_pct=-1.0)


class TestEstimateConcrete:
    def test_known_example_slab_5x4x015(self) -> None:
        # 5m × 4m × 0.15m = 3.0 m³
        result = estimate_concrete(length_m=5.0, width_m=4.0, thickness_m=0.15)
        assert result.material == "concrete"
        assert result.quantity == pytest.approx(3.0)
        assert result.unit == "m3"

    def test_thin_slab_rounds_to_three_decimals(self) -> None:
        # 1 × 1 × 0.1234 = 0.1234 → 0.123 m³
        result = estimate_concrete(length_m=1.0, width_m=1.0, thickness_m=0.1234)
        assert result.quantity == pytest.approx(0.123)

    def test_negative_dimension_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_concrete(length_m=-1.0, width_m=2.0, thickness_m=0.1)
        with pytest.raises(ValueError):
            estimate_concrete(length_m=1.0, width_m=2.0, thickness_m=0.0)


class TestEstimateLumber:
    def test_known_example_30m_total_24m_pieces_ceils_to_13_pieces(self) -> None:
        # 30 / 2.4 = 12.5 → ceil → 13 pieces, total = 13 * 2.4 = 31.2 m
        result = estimate_lumber(total_length_m=30.0, piece_length_m=2.4)
        assert result.material == "lumber"
        assert result.quantity == pytest.approx(31.2)
        assert result.unit == "m"
        assert "13 pieces" in result.notes

    def test_exact_division(self) -> None:
        # 12 / 2 = 6 pieces exact, total = 12 m
        result = estimate_lumber(total_length_m=12.0, piece_length_m=2.0)
        assert result.quantity == pytest.approx(12.0)
        assert "6 pieces" in result.notes

    def test_zero_total_length(self) -> None:
        result = estimate_lumber(total_length_m=0.0, piece_length_m=2.4)
        assert result.quantity == 0.0

    def test_negative_total_length_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_lumber(total_length_m=-1.0, piece_length_m=2.4)

    def test_zero_piece_length_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_lumber(total_length_m=10.0, piece_length_m=0.0)
