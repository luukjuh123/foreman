"""Tests for material estimation algorithms."""

import pytest

from app.services.materials.estimator import (
    estimate_concrete,
    estimate_lumber,
    estimate_paint,
    estimate_tiles,
)


class TestEstimatePaint:
    def test_basic_two_coats(self) -> None:
        result = estimate_paint(area_m2=20.0, coats=2, coverage_m2_per_liter=10.0)
        assert result.quantity == pytest.approx(4.0)
        assert result.unit == "L"

    def test_single_coat(self) -> None:
        result = estimate_paint(area_m2=10.0, coats=1, coverage_m2_per_liter=10.0)
        assert result.quantity == pytest.approx(1.0)

    def test_zero_area_returns_zero(self) -> None:
        result = estimate_paint(area_m2=0.0)
        assert result.quantity == pytest.approx(0.0)

    def test_negative_area_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_paint(area_m2=-1.0)

    def test_zero_coverage_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_paint(area_m2=10.0, coverage_m2_per_liter=0.0)


class TestEstimateTiles:
    def test_with_default_waste(self) -> None:
        result = estimate_tiles(area_m2=10.0)
        assert result.quantity == pytest.approx(11.0)
        assert result.unit == "m2"

    def test_zero_waste(self) -> None:
        result = estimate_tiles(area_m2=10.0, waste_pct=0.0)
        assert result.quantity == pytest.approx(10.0)

    def test_negative_area_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_tiles(area_m2=-5.0)


class TestEstimateConcrete:
    def test_basic(self) -> None:
        result = estimate_concrete(volume_m3=5.0)
        assert result.quantity == pytest.approx(5.0)
        assert result.unit == "m3"

    def test_negative_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_concrete(volume_m3=-1.0)


class TestEstimateLumber:
    def test_multiple_pieces(self) -> None:
        result = estimate_lumber(length_m=3.0, count=10)
        assert result.quantity == pytest.approx(30.0)
        assert result.unit == "m"

    def test_zero_count(self) -> None:
        result = estimate_lumber(length_m=3.0, count=0)
        assert result.quantity == pytest.approx(0.0)

    def test_negative_length_raises(self) -> None:
        with pytest.raises(ValueError):
            estimate_lumber(length_m=-1.0)
