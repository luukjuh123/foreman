"""Tests for the POST /api/v1/materials/estimate room-dimension endpoint.

The endpoint accepts room dimensions (L × W × H in meters) plus a list of
material specs; it derives the relevant surface area or volume for each
spec and returns SI-unit estimates from app.services.material_estimation.
"""

import pytest


@pytest.mark.asyncio
async def test_estimate_paint_for_walls_two_coats(client) -> None:
    # Room: 5 × 4 × 2.5 m. Wall area = 2*(5+4)*2.5 = 45 m².
    # Paint two coats @ 12 m²/L → ceil(90/12) = ceil(7.5) = 8 L.
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": 5.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [
                {"type": "paint", "surface": "walls", "coats": 2},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["error"] is None
    estimates = body["data"]["estimates"]
    assert len(estimates) == 1
    e = estimates[0]
    assert e["material"] == "paint"
    assert e["quantity"] == 8.0
    assert e["unit"] == "L"


@pytest.mark.asyncio
async def test_estimate_tiles_for_floor_with_default_waste(client) -> None:
    # Floor area = 5 × 4 = 20 m². +10% waste = 22 m².
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": 5.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [{"type": "tiles", "surface": "floor"}],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    e = body["data"]["estimates"][0]
    assert e["material"] == "tiles"
    assert e["quantity"] == pytest.approx(22.0)
    assert e["unit"] == "m2"


@pytest.mark.asyncio
async def test_estimate_concrete_floor_slab(client) -> None:
    # Volume = 5 × 4 × 0.1 = 2.0 m³.
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": 5.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [
                {"type": "concrete", "surface": "floor", "thickness_m": 0.1},
            ],
        },
    )
    assert resp.status_code == 200
    e = resp.json()["data"]["estimates"][0]
    assert e["material"] == "concrete"
    assert e["quantity"] == pytest.approx(2.0)
    assert e["unit"] == "m3"


@pytest.mark.asyncio
async def test_estimate_lumber_passthrough(client) -> None:
    # Lumber doesn't use room dims — it requires total_length_m + piece_length_m.
    # 30 / 2.4 = 12.5 → ceil 13 pieces × 2.4 m = 31.2 m.
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": 5.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [
                {"type": "lumber", "total_length_m": 30.0, "piece_length_m": 2.4},
            ],
        },
    )
    assert resp.status_code == 200
    e = resp.json()["data"]["estimates"][0]
    assert e["material"] == "lumber"
    assert e["quantity"] == pytest.approx(31.2)
    assert e["unit"] == "m"


@pytest.mark.asyncio
async def test_estimate_multiple_materials_in_one_call(client) -> None:
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": 5.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [
                {"type": "paint", "surface": "walls", "coats": 2},
                {"type": "paint", "surface": "ceiling", "coats": 1},
                {"type": "tiles", "surface": "floor"},
            ],
        },
    )
    assert resp.status_code == 200
    estimates = resp.json()["data"]["estimates"]
    assert [e["material"] for e in estimates] == ["paint", "paint", "tiles"]
    # Ceiling area = 5*4 = 20 m², 1 coat @ 12 m²/L → ceil(20/12)=2 L
    assert estimates[1]["quantity"] == 2.0
    assert estimates[1]["unit"] == "L"


@pytest.mark.asyncio
async def test_negative_dimension_rejected_422(client) -> None:
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": -1.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [{"type": "tiles", "surface": "floor"}],
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unknown_material_type_rejected_422(client) -> None:
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": 5.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [{"type": "unobtanium", "surface": "floor"}],
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_paint_without_surface_returns_400(client) -> None:
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": 5.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [{"type": "paint", "coats": 2}],
        },
    )
    # Missing required surface → validation error
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_empty_materials_list_returns_empty_estimates(client) -> None:
    resp = await client.post(
        "/api/v1/materials/estimate",
        json={
            "length_m": 5.0,
            "width_m": 4.0,
            "height_m": 2.5,
            "materials": [],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["error"] is None
    assert body["data"]["estimates"] == []
