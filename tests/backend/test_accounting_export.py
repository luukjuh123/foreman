"""Tests for Dutch accounting export — MT940 and CSV (Exact Online compatible).

POST /api/v1/exports/{format}   — trigger an export (mt940 | csv_journal | csv_invoices)
GET  /api/v1/exports/history    — list past export records for the authenticated user
"""

from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite://"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
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
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/api/v1/auth/register",
        json={"name": "Export Tester", "email": "exporttest@example.com", "password": "Exp0rtT3st!"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "exporttest@example.com", "password": "Exp0rtT3st!"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def journal_entry_id(client: AsyncClient, auth_headers: dict) -> str:
    """Create a chart of accounts + journal entry for export tests."""
    # Seed Dutch RGS accounts
    await client.post("/api/v1/financials/accounts/seed", headers=auth_headers)

    # Fetch accounts to get two valid IDs
    accs_resp = await client.get("/api/v1/financials/accounts", headers=auth_headers)
    accounts = accs_resp.json()
    acc1_id = accounts[0]["id"]
    acc2_id = accounts[1]["id"]

    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": "2024-01-15",
            "description": "Testboeking verkoop",
            "reference": "REF-001",
            "lines": [
                {"account_id": acc1_id, "debit_cents": 12100, "credit_cents": 0},
                {"account_id": acc2_id, "debit_cents": 0, "credit_cents": 12100},
            ],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest_asyncio.fixture
async def invoice_id(client: AsyncClient, auth_headers: dict) -> str:
    """Create a customer + invoice for export tests."""
    cust_resp = await client.post(
        "/api/v1/customers/",
        json={"name": "Test Klant BV", "email": "klant@test.nl"},
        headers=auth_headers,
    )
    assert cust_resp.status_code == 201, cust_resp.text
    cust_id = cust_resp.json()["id"]

    inv_resp = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": cust_id,
            "invoice_number": "2024-001",
            "issue_date": "2024-01-15",
            "due_date": "2024-02-15",
            "lines": [
                {
                    "description": "Schilderwerk",
                    "quantity": 1.0,
                    "unit": "stuk",
                    "unit_price_cents": 100000,
                    "vat_rate_bp": 2100,
                }
            ],
        },
        headers=auth_headers,
    )
    assert inv_resp.status_code == 201, inv_resp.text
    return inv_resp.json()["id"]


# ---------------------------------------------------------------------------
# Unit tests: MT940 formatter (pure logic, no DB)
# ---------------------------------------------------------------------------


class TestMT940Formatter:
    def test_format_single_transaction(self) -> None:
        from app.services.exports.mt940 import MT940Formatter

        fmt = MT940Formatter(account_number="NL91ABNA0417164300", bank_id="ABNANL2A")
        result = fmt.format(
            transactions=[
                {
                    "date": date(2024, 1, 15),
                    "amount_cents": 12100,
                    "is_credit": True,
                    "description": "Testboeking verkoop",
                    "reference": "REF-001",
                }
            ],
            start_balance_cents=0,
            end_balance_cents=12100,
            statement_date=date(2024, 1, 31),
        )
        assert ":20:" in result
        assert ":25:" in result
        assert "NL91ABNA0417164300" in result
        assert ":28C:" in result
        assert ":60F:" in result
        assert ":62F:" in result

    def test_format_debit_transaction(self) -> None:
        from app.services.exports.mt940 import MT940Formatter

        fmt = MT940Formatter(account_number="NL91ABNA0417164300", bank_id="ABNANL2A")
        result = fmt.format(
            transactions=[
                {
                    "date": date(2024, 1, 15),
                    "amount_cents": 5000,
                    "is_credit": False,
                    "description": "Materiaalkosten",
                    "reference": "REF-002",
                }
            ],
            start_balance_cents=10000,
            end_balance_cents=5000,
            statement_date=date(2024, 1, 31),
        )
        assert ":61:" in result
        # Debit transaction → D in :61: field
        assert "D" in result

    def test_format_amount_uses_comma_decimal(self) -> None:
        """MT940 amounts use comma as decimal separator (European standard)."""
        from app.services.exports.mt940 import MT940Formatter

        fmt = MT940Formatter(account_number="NL91ABNA0417164300", bank_id="ABNANL2A")
        result = fmt.format(
            transactions=[
                {
                    "date": date(2024, 1, 15),
                    "amount_cents": 12150,
                    "is_credit": True,
                    "description": "Test",
                    "reference": "X",
                }
            ],
            start_balance_cents=0,
            end_balance_cents=12150,
            statement_date=date(2024, 1, 31),
        )
        # Amount 121,50 should appear with comma decimal
        assert "121,50" in result

    def test_empty_transactions_still_valid(self) -> None:
        from app.services.exports.mt940 import MT940Formatter

        fmt = MT940Formatter(account_number="NL91ABNA0417164300", bank_id="ABNANL2A")
        result = fmt.format(
            transactions=[],
            start_balance_cents=5000,
            end_balance_cents=5000,
            statement_date=date(2024, 1, 31),
        )
        assert ":60F:" in result
        assert ":62F:" in result


# ---------------------------------------------------------------------------
# Unit tests: CSV journal formatter (pure logic)
# ---------------------------------------------------------------------------


class TestCSVJournalFormatter:
    def test_csv_has_exact_online_headers(self) -> None:
        from app.services.exports.csv_export import CSVJournalFormatter

        fmt = CSVJournalFormatter()
        result = fmt.format([])
        reader = csv.DictReader(io.StringIO(result))
        headers = reader.fieldnames or []
        # Exact Online expects these column names
        assert "Datum" in headers
        assert "Grootboekrekening" in headers
        assert "Omschrijving" in headers
        assert "Debet" in headers
        assert "Credit" in headers

    def test_csv_formats_amounts_as_euros(self) -> None:
        from app.services.exports.csv_export import CSVJournalFormatter

        fmt = CSVJournalFormatter()
        result = fmt.format(
            [
                {
                    "entry_date": date(2024, 1, 15),
                    "account_code": "4000",
                    "account_name": "Verkoopopbrengsten",
                    "description": "Testboeking",
                    "reference": "REF-001",
                    "debit_cents": 0,
                    "credit_cents": 12100,
                }
            ]
        )
        reader = csv.DictReader(io.StringIO(result))
        rows = list(reader)
        assert len(rows) == 1
        # 12100 cents = 121.00 euros
        assert rows[0]["Credit"] == "121.00"
        assert rows[0]["Debet"] == "0.00"

    def test_csv_date_format_is_dutch(self) -> None:
        """Date format dd-MM-yyyy per Dutch locale convention."""
        from app.services.exports.csv_export import CSVJournalFormatter

        fmt = CSVJournalFormatter()
        result = fmt.format(
            [
                {
                    "entry_date": date(2024, 3, 5),
                    "account_code": "1000",
                    "account_name": "Kas",
                    "description": "Test",
                    "reference": None,
                    "debit_cents": 1000,
                    "credit_cents": 0,
                }
            ]
        )
        reader = csv.DictReader(io.StringIO(result))
        rows = list(reader)
        assert rows[0]["Datum"] == "05-03-2024"


# ---------------------------------------------------------------------------
# Unit tests: CSV invoice formatter (pure logic)
# ---------------------------------------------------------------------------


class TestCSVInvoiceFormatter:
    def test_invoice_csv_has_required_headers(self) -> None:
        from app.services.exports.csv_export import CSVInvoiceFormatter

        fmt = CSVInvoiceFormatter()
        result = fmt.format([])
        reader = csv.DictReader(io.StringIO(result))
        headers = reader.fieldnames or []
        assert "Factuurnummer" in headers
        assert "Klant" in headers
        assert "Factuurdatum" in headers
        assert "Vervaldatum" in headers
        assert "Subtotaal" in headers
        assert "BTW" in headers
        assert "Totaal" in headers
        assert "Status" in headers

    def test_invoice_csv_amounts_in_euros(self) -> None:
        from app.services.exports.csv_export import CSVInvoiceFormatter

        fmt = CSVInvoiceFormatter()
        result = fmt.format(
            [
                {
                    "invoice_number": "2024-001",
                    "customer_name": "Test BV",
                    "issue_date": date(2024, 1, 15),
                    "due_date": date(2024, 2, 15),
                    "subtotal_cents": 100000,
                    "vat_total_cents": 21000,
                    "total_cents": 121000,
                    "status": "paid",
                }
            ]
        )
        reader = csv.DictReader(io.StringIO(result))
        rows = list(reader)
        assert rows[0]["Subtotaal"] == "1000.00"
        assert rows[0]["BTW"] == "210.00"
        assert rows[0]["Totaal"] == "1210.00"


# ---------------------------------------------------------------------------
# Integration tests: POST /api/v1/exports/{format}
# ---------------------------------------------------------------------------


class TestExportEndpoints:
    @pytest.mark.asyncio
    async def test_export_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.post("/api/v1/exports/mt940", json={})
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_export_unknown_format_returns_error(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        # Unknown format routes do not exist → 404
        resp = await client.post("/api/v1/exports/unknown_format", json={}, headers=auth_headers)
        assert resp.status_code in (404, 422)

    @pytest.mark.asyncio
    async def test_export_mt940_returns_plain_text(
        self, client: AsyncClient, auth_headers: dict, journal_entry_id: str
    ) -> None:
        resp = await client.post(
            "/api/v1/exports/mt940",
            json={
                "date_from": "2024-01-01",
                "date_to": "2024-01-31",
                "account_number": "NL91ABNA0417164300",
                "bank_id": "ABNANL2A",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]
        assert ":20:" in resp.text

    @pytest.mark.asyncio
    async def test_export_mt940_content_disposition(
        self, client: AsyncClient, auth_headers: dict, journal_entry_id: str
    ) -> None:
        resp = await client.post(
            "/api/v1/exports/mt940",
            json={
                "date_from": "2024-01-01",
                "date_to": "2024-01-31",
                "account_number": "NL91ABNA0417164300",
                "bank_id": "ABNANL2A",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".sta" in cd or ".mt940" in cd or ".txt" in cd

    @pytest.mark.asyncio
    async def test_export_csv_journal_returns_csv(
        self, client: AsyncClient, auth_headers: dict, journal_entry_id: str
    ) -> None:
        resp = await client.post(
            "/api/v1/exports/csv_journal",
            json={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        # Must have Exact Online headers
        assert "Datum" in resp.text
        assert "Grootboekrekening" in resp.text

    @pytest.mark.asyncio
    async def test_export_csv_journal_content_disposition(
        self, client: AsyncClient, auth_headers: dict, journal_entry_id: str
    ) -> None:
        resp = await client.post(
            "/api/v1/exports/csv_journal",
            json={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".csv" in cd

    @pytest.mark.asyncio
    async def test_export_csv_invoices_returns_csv(
        self, client: AsyncClient, auth_headers: dict, invoice_id: str
    ) -> None:
        resp = await client.post(
            "/api/v1/exports/csv_invoices",
            json={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        assert "Factuurnummer" in resp.text

    @pytest.mark.asyncio
    async def test_export_csv_invoices_content_disposition(
        self, client: AsyncClient, auth_headers: dict, invoice_id: str
    ) -> None:
        resp = await client.post(
            "/api/v1/exports/csv_invoices",
            json={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".csv" in cd

    @pytest.mark.asyncio
    async def test_export_empty_date_range_returns_empty_content(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        resp = await client.post(
            "/api/v1/exports/csv_journal",
            json={"date_from": "2020-01-01", "date_to": "2020-01-31"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        # Only header row, no data rows
        lines = [l for l in resp.text.splitlines() if l.strip()]
        assert len(lines) == 1  # header only

    @pytest.mark.asyncio
    async def test_export_invalid_date_range_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        resp = await client.post(
            "/api/v1/exports/csv_journal",
            json={"date_from": "2024-02-01", "date_to": "2024-01-01"},
            headers=auth_headers,
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Integration tests: GET /api/v1/exports/history
# ---------------------------------------------------------------------------


class TestExportHistory:
    @pytest.mark.asyncio
    async def test_history_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/exports/history")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_history_starts_empty(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        resp = await client.get("/api/v1/exports/history", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_export_creates_history_record(
        self, client: AsyncClient, auth_headers: dict, journal_entry_id: str
    ) -> None:
        await client.post(
            "/api/v1/exports/csv_journal",
            json={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            headers=auth_headers,
        )
        resp = await client.get("/api/v1/exports/history", headers=auth_headers)
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) == 1
        record = history[0]
        assert record["format"] == "csv_journal"
        assert record["date_from"] == "2024-01-01"
        assert record["date_to"] == "2024-01-31"
        assert "exported_at" in record
        assert "row_count" in record
        assert "id" in record

    @pytest.mark.asyncio
    async def test_multiple_exports_all_recorded(
        self, client: AsyncClient, auth_headers: dict, journal_entry_id: str
    ) -> None:
        await client.post(
            "/api/v1/exports/csv_journal",
            json={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            headers=auth_headers,
        )
        await client.post(
            "/api/v1/exports/mt940",
            json={
                "date_from": "2024-02-01",
                "date_to": "2024-02-29",
                "account_number": "NL91ABNA0417164300",
                "bank_id": "ABNANL2A",
            },
            headers=auth_headers,
        )
        resp = await client.get("/api/v1/exports/history", headers=auth_headers)
        history = resp.json()
        assert len(history) == 2
        formats = {r["format"] for r in history}
        assert formats == {"mt940", "csv_journal"}

    @pytest.mark.asyncio
    async def test_history_isolated_per_user(
        self, client: AsyncClient, auth_headers: dict, journal_entry_id: str
    ) -> None:
        """Export history must be scoped to the authenticated user."""
        # Second user
        await client.post(
            "/api/v1/auth/register",
            json={"name": "Other User", "email": "other@export.com", "password": "0th3rP@ss!"},
        )
        other_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "other@export.com", "password": "0th3rP@ss!"},
        )
        other_headers = {"Authorization": f"Bearer {other_login.json()['access_token']}"}

        # First user exports
        await client.post(
            "/api/v1/exports/csv_journal",
            json={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            headers=auth_headers,
        )

        # Second user's history should be empty
        resp = await client.get("/api/v1/exports/history", headers=other_headers)
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_history_record_has_row_count(
        self, client: AsyncClient, auth_headers: dict, journal_entry_id: str
    ) -> None:
        await client.post(
            "/api/v1/exports/csv_journal",
            json={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            headers=auth_headers,
        )
        resp = await client.get("/api/v1/exports/history", headers=auth_headers)
        record = resp.json()[0]
        # We created one journal entry with 2 lines → row_count should be > 0
        assert record["row_count"] >= 1
