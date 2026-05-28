"""Tests for POST /api/v1/materials/import-csv (Phase 19)."""

from __future__ import annotations

import io

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _csv_file(content: str, filename: str = "materials.csv") -> tuple[str, tuple]:
    """Return (field_name, (filename, bytes_io, content_type)) for httpx upload."""
    return ("file", (filename, io.BytesIO(content.encode()), "text/csv"))


# ---------------------------------------------------------------------------
# Valid CSV parsing
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_valid_csv_three_rows_parsed(client):
    """A well-formed CSV with three rows returns three parsed rows and no errors."""
    csv_content = "name,quantity,unit\nHout 18mm,10,m2\nSchroeven M6,200,stuks\nMuurverf wit,5,L"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == []
    rows = body["rows"]
    assert len(rows) == 3
    assert rows[0] == {"name": "Hout 18mm", "quantity": 10.0, "unit": "m2"}
    assert rows[1] == {"name": "Schroeven M6", "quantity": 200.0, "unit": "stuks"}
    assert rows[2] == {"name": "Muurverf wit", "quantity": 5.0, "unit": "L"}


@pytest.mark.asyncio
async def test_valid_csv_with_optional_description_column(client):
    """CSV with an optional description column is accepted; extra columns are ignored."""
    csv_content = "name,quantity,unit,description\nKit silicone,3,stuks,voor badkamer"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == []
    assert len(body["rows"]) == 1
    assert body["rows"][0]["name"] == "Kit silicone"


@pytest.mark.asyncio
async def test_valid_csv_with_optional_store_preference_column(client):
    """store_preference column is accepted and ignored gracefully."""
    csv_content = "name,quantity,unit,store_preference\nBeton,20,kg,hornbach"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == []
    assert body["rows"][0]["name"] == "Beton"


@pytest.mark.asyncio
async def test_single_row_csv_parsed(client):
    """A CSV with a header and exactly one data row returns one row."""
    csv_content = "name,quantity,unit\nDakpan,50,stuks"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["rows"]) == 1
    assert body["rows"][0]["quantity"] == 50.0


# ---------------------------------------------------------------------------
# Malformed / invalid CSV
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_missing_name_column_returns_error(client):
    """CSV without a 'name' column returns a 422 error with a clear message."""
    csv_content = "quantity,unit\n10,m2"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 422
    body = response.json()
    assert "name" in body["detail"].lower()


@pytest.mark.asyncio
async def test_missing_quantity_column_returns_error(client):
    """CSV without a 'quantity' column returns a 422 error."""
    csv_content = "name,unit\nHout,m2"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 422
    body = response.json()
    assert "quantity" in body["detail"].lower()


@pytest.mark.asyncio
async def test_missing_unit_column_returns_error(client):
    """CSV without a 'unit' column returns a 422 error."""
    csv_content = "name,quantity\nHout,10"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 422
    body = response.json()
    assert "unit" in body["detail"].lower()


@pytest.mark.asyncio
async def test_empty_file_returns_error(client):
    """An empty file returns 422 with an appropriate message."""
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file("")],
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_header_only_no_data_rows_returns_empty_rows(client):
    """A CSV with header but no data rows returns zero rows and no errors."""
    csv_content = "name,quantity,unit"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["rows"] == []
    assert body["errors"] == []


@pytest.mark.asyncio
async def test_non_numeric_quantity_captured_in_errors(client):
    """Rows with non-numeric quantity are skipped and reported in errors list."""
    csv_content = "name,quantity,unit\nHout,abc,m2\nVerf,5,L"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 200
    body = response.json()
    # Valid row still parsed
    assert len(body["rows"]) == 1
    assert body["rows"][0]["name"] == "Verf"
    # Error reported for row 1 (0-indexed data row)
    assert len(body["errors"]) == 1
    assert "1" in body["errors"][0] or "hout" in body["errors"][0].lower()


@pytest.mark.asyncio
async def test_response_schema_always_has_rows_and_errors(client):
    """Response always contains 'rows' list and 'errors' list, regardless of input."""
    csv_content = "name,quantity,unit\nSpijkers,100,stuks"
    response = await client.post(
        "/api/v1/materials/import-csv",
        files=[_csv_file(csv_content)],
    )
    assert response.status_code == 200
    body = response.json()
    assert "rows" in body
    assert "errors" in body
    assert isinstance(body["rows"], list)
    assert isinstance(body["errors"], list)
