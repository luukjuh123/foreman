"""Tests for BTW (VAT) return preparation.

Dutch BTW aangifte boxes:
  1a — leveringen/diensten 21% (net)
  1b — leveringen/diensten 9% (net)
  1c — leveringen/diensten 0% (net)
  1d — leveringen/diensten vrijgesteld (net)
  5a — total BTW verschuldigd (output VAT)
  5b — total voorbelasting (input VAT)
  5d — payable (+) / refundable (-)
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth(client: AsyncClient, email: str = "btw@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "BTW User", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_customer(client: AsyncClient, headers: dict) -> str:
    """Create a customer and return its id."""
    resp = await client.post(
        "/api/v1/invoices/customers",
        headers=headers,
        json={
            "name": "Test Klant B.V.",
            "email": "klant@test.nl",
            "kvk_number": "12345678",
            "vat_number": "NL123456789B01",
            "address_line1": "Teststraat 1",
            "postal_code": "1234AB",
            "city": "Amsterdam",
            "country_code": "NL",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _make_invoice(
    client: AsyncClient,
    headers: dict,
    customer_id: str,
    issue_date: str,
    *,
    net_cents: int = 100_00,
    vat_rate_bp: int = 2100,
) -> dict:
    """Create a sent invoice with one line item."""
    vat_cents = net_cents * vat_rate_bp // 10000
    resp = await client.post(
        "/api/v1/invoices/",
        headers=headers,
        json={
            "customer_id": customer_id,
            "issue_date": issue_date,
            "due_date": issue_date,
            "lines": [
                {
                    "description": "Bouwwerk",
                    "quantity": 1,
                    "unit": "stuks",
                    "unit_price_cents": net_cents,
                    "vat_rate_bp": vat_rate_bp,
                }
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestBtwGenerateEndpoint:
    """POST /api/v1/btw/generate — generate draft aangifte for a quarter."""

    @pytest.mark.asyncio
    async def test_generate_returns_201(self, client: AsyncClient):
        headers = await _auth(client)
        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 1},
        )
        assert resp.status_code == 201, resp.text

    @pytest.mark.asyncio
    async def test_generate_response_has_required_fields(self, client: AsyncClient):
        headers = await _auth(client)
        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 2},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["year"] == 2024
        assert data["quarter"] == 2
        assert data["status"] == "draft"
        # Box fields must be present
        for field in [
            "box_1a_net_cents",
            "box_1b_net_cents",
            "box_1c_net_cents",
            "box_5a_vat_due_cents",
            "box_5b_voorbelasting_cents",
            "box_5d_payable_cents",
        ]:
            assert field in data, f"Missing field: {field}"

    @pytest.mark.asyncio
    async def test_generate_calculates_21pct_vat_from_invoices(self, client: AsyncClient):
        headers = await _auth(client, "btw21@example.com")
        cid = await _make_customer(client, headers)
        # Two invoices Q1 2024 with 21% VAT, net 100.00 each
        await _make_invoice(client, headers, cid, "2024-01-15", net_cents=100_00, vat_rate_bp=2100)
        await _make_invoice(client, headers, cid, "2024-02-20", net_cents=200_00, vat_rate_bp=2100)

        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 1},
        )
        assert resp.status_code == 201
        data = resp.json()
        # net: 300_00, vat: 63_00 (300 * 0.21)
        assert data["box_1a_net_cents"] == 300_00
        assert data["box_5a_vat_due_cents"] == 63_00

    @pytest.mark.asyncio
    async def test_generate_calculates_9pct_vat_from_invoices(self, client: AsyncClient):
        headers = await _auth(client, "btw9@example.com")
        cid = await _make_customer(client, headers)
        await _make_invoice(client, headers, cid, "2024-04-10", net_cents=200_00, vat_rate_bp=900)

        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 2},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["box_1b_net_cents"] == 200_00
        # 200_00 * 9% = 18_00
        assert data["box_5a_vat_due_cents"] == 18_00

    @pytest.mark.asyncio
    async def test_generate_calculates_0pct_exempt_from_invoices(self, client: AsyncClient):
        headers = await _auth(client, "btw0@example.com")
        cid = await _make_customer(client, headers)
        await _make_invoice(client, headers, cid, "2024-07-01", net_cents=500_00, vat_rate_bp=0)

        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 3},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["box_1c_net_cents"] == 500_00
        assert data["box_5a_vat_due_cents"] == 0

    @pytest.mark.asyncio
    async def test_generate_excludes_invoices_from_other_quarters(self, client: AsyncClient):
        headers = await _auth(client, "btw_quarters@example.com")
        cid = await _make_customer(client, headers)
        # Q1 invoice
        await _make_invoice(client, headers, cid, "2024-03-31", net_cents=100_00, vat_rate_bp=2100)
        # Q2 invoice (should not appear in Q1 aangifte)
        await _make_invoice(client, headers, cid, "2024-04-01", net_cents=999_00, vat_rate_bp=2100)

        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 1},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["box_1a_net_cents"] == 100_00

    @pytest.mark.asyncio
    async def test_generate_invalid_quarter_returns_422(self, client: AsyncClient):
        headers = await _auth(client)
        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 5},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_generate_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/btw/generate",
            json={"year": 2024, "quarter": 1},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_generate_5d_payable_equals_5a_minus_5b(self, client: AsyncClient):
        headers = await _auth(client, "btw5d@example.com")
        cid = await _make_customer(client, headers)
        await _make_invoice(client, headers, cid, "2024-01-05", net_cents=1000_00, vat_rate_bp=2100)

        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 1},
        )
        assert resp.status_code == 201
        data = resp.json()
        # box_5d = box_5a - box_5b (5b = 0 since no input VAT from journal entries here)
        assert data["box_5d_payable_cents"] == data["box_5a_vat_due_cents"] - data["box_5b_voorbelasting_cents"]


class TestBtwGetEndpoint:
    """GET /api/v1/btw/{id} — retrieve specific aangifte."""

    @pytest.mark.asyncio
    async def test_get_aangifte_returns_200(self, client: AsyncClient):
        headers = await _auth(client, "btw_get@example.com")
        gen_resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 1},
        )
        aangifte_id = gen_resp.json()["id"]
        resp = await client.get(f"/api/v1/btw/{aangifte_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == aangifte_id

    @pytest.mark.asyncio
    async def test_get_other_users_aangifte_returns_404(self, client: AsyncClient):
        h1 = await _auth(client, "btwu1@example.com")
        h2 = await _auth(client, "btwu2@example.com")
        gen_resp = await client.post(
            "/api/v1/btw/generate", headers=h1, json={"year": 2024, "quarter": 1}
        )
        aangifte_id = gen_resp.json()["id"]
        resp = await client.get(f"/api/v1/btw/{aangifte_id}", headers=h2)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_nonexistent_returns_404(self, client: AsyncClient):
        headers = await _auth(client, "btwmissing@example.com")
        resp = await client.get(
            "/api/v1/btw/00000000-0000-0000-0000-000000000000", headers=headers
        )
        assert resp.status_code == 404


class TestBtwListEndpoint:
    """GET /api/v1/btw — list all aangiftes for current user."""

    @pytest.mark.asyncio
    async def test_list_returns_200(self, client: AsyncClient):
        headers = await _auth(client, "btwlist@example.com")
        resp = await client.get("/api/v1/btw/", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_list_returns_own_aangiftes(self, client: AsyncClient):
        headers = await _auth(client, "btwlist2@example.com")
        # Generate two aangiftes
        await client.post(
            "/api/v1/btw/generate", headers=headers, json={"year": 2024, "quarter": 1}
        )
        await client.post(
            "/api/v1/btw/generate", headers=headers, json={"year": 2024, "quarter": 2}
        )
        resp = await client.get("/api/v1/btw/", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        quarters = {item["quarter"] for item in data}
        assert quarters == {1, 2}


class TestBtwPatchEndpoint:
    """PATCH /api/v1/btw/{id} — update overrides."""

    @pytest.mark.asyncio
    async def test_patch_notes_updates_aangifte(self, client: AsyncClient):
        headers = await _auth(client, "btwpatch@example.com")
        gen = await client.post(
            "/api/v1/btw/generate", headers=headers, json={"year": 2024, "quarter": 1}
        )
        aangifte_id = gen.json()["id"]
        resp = await client.patch(
            f"/api/v1/btw/{aangifte_id}",
            headers=headers,
            json={"notes": "Gecorrigeerd door accountant"},
        )
        assert resp.status_code == 200
        assert resp.json()["notes"] == "Gecorrigeerd door accountant"

    @pytest.mark.asyncio
    async def test_patch_status_to_submitted(self, client: AsyncClient):
        headers = await _auth(client, "btwsubmit@example.com")
        gen = await client.post(
            "/api/v1/btw/generate", headers=headers, json={"year": 2024, "quarter": 1}
        )
        aangifte_id = gen.json()["id"]
        resp = await client.patch(
            f"/api/v1/btw/{aangifte_id}",
            headers=headers,
            json={"status": "submitted"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "submitted"

    @pytest.mark.asyncio
    async def test_patch_other_users_aangifte_returns_404(self, client: AsyncClient):
        h1 = await _auth(client, "btwp1@example.com")
        h2 = await _auth(client, "btwp2@example.com")
        gen = await client.post(
            "/api/v1/btw/generate", headers=h1, json={"year": 2024, "quarter": 1}
        )
        aangifte_id = gen.json()["id"]
        resp = await client.patch(
            f"/api/v1/btw/{aangifte_id}",
            headers=h2,
            json={"notes": "Niet toegestaan"},
        )
        assert resp.status_code == 404


class TestBtwCsvExport:
    """GET /api/v1/btw/{id}/export/csv — CSV export."""

    @pytest.mark.asyncio
    async def test_csv_export_returns_200_with_csv_content_type(self, client: AsyncClient):
        headers = await _auth(client, "btwcsv@example.com")
        gen = await client.post(
            "/api/v1/btw/generate", headers=headers, json={"year": 2024, "quarter": 1}
        )
        aangifte_id = gen.json()["id"]
        resp = await client.get(
            f"/api/v1/btw/{aangifte_id}/export/csv", headers=headers
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    @pytest.mark.asyncio
    async def test_csv_export_contains_box_headers(self, client: AsyncClient):
        headers = await _auth(client, "btwcsv2@example.com")
        gen = await client.post(
            "/api/v1/btw/generate", headers=headers, json={"year": 2024, "quarter": 1}
        )
        aangifte_id = gen.json()["id"]
        resp = await client.get(
            f"/api/v1/btw/{aangifte_id}/export/csv", headers=headers
        )
        csv_text = resp.text
        assert "box_1a" in csv_text.lower() or "1a" in csv_text
        assert "btw" in csv_text.lower() or "vat" in csv_text.lower() or "2024" in csv_text

    @pytest.mark.asyncio
    async def test_csv_export_other_user_returns_404(self, client: AsyncClient):
        h1 = await _auth(client, "btwe1@example.com")
        h2 = await _auth(client, "btwe2@example.com")
        gen = await client.post(
            "/api/v1/btw/generate", headers=h1, json={"year": 2024, "quarter": 1}
        )
        aangifte_id = gen.json()["id"]
        resp = await client.get(
            f"/api/v1/btw/{aangifte_id}/export/csv", headers=h2
        )
        assert resp.status_code == 404


class TestBtwCalculationService:
    """Unit tests for BTW calculation service (via API roundtrip)."""

    @pytest.mark.asyncio
    async def test_mixed_vat_rates_calculated_separately(self, client: AsyncClient):
        headers = await _auth(client, "btwmixed@example.com")
        cid = await _make_customer(client, headers)
        # 100.00 at 21%, 200.00 at 9%, 50.00 at 0%
        await _make_invoice(client, headers, cid, "2024-01-10", net_cents=100_00, vat_rate_bp=2100)
        await _make_invoice(client, headers, cid, "2024-01-11", net_cents=200_00, vat_rate_bp=900)
        await _make_invoice(client, headers, cid, "2024-01-12", net_cents=50_00, vat_rate_bp=0)

        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 1},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["box_1a_net_cents"] == 100_00
        assert data["box_1b_net_cents"] == 200_00
        assert data["box_1c_net_cents"] == 50_00
        # 21_00 + 18_00 = 39_00
        assert data["box_5a_vat_due_cents"] == 39_00

    @pytest.mark.asyncio
    async def test_cancelled_invoices_excluded(self, client: AsyncClient):
        """Cancelled invoices (deleted_at set) should not count toward BTW."""
        headers = await _auth(client, "btwcancelled@example.com")
        cid = await _make_customer(client, headers)
        inv = await _make_invoice(
            client, headers, cid, "2024-01-15", net_cents=1000_00, vat_rate_bp=2100
        )
        # Cancel the invoice via transition endpoint
        cancel_resp = await client.post(
            f"/api/v1/invoices/{inv['id']}/transition",
            headers=headers,
            json={"status": "cancelled"},
        )
        assert cancel_resp.status_code == 200, cancel_resp.text

        resp = await client.post(
            "/api/v1/btw/generate",
            headers=headers,
            json={"year": 2024, "quarter": 1},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["box_1a_net_cents"] == 0
        assert data["box_5a_vat_due_cents"] == 0
