"""Tests for UBL 2.1 / Peppol BIS Billing 3.0 invoice XML generation."""

from __future__ import annotations

from datetime import date
from xml.etree import ElementTree as ET

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app

UBL_NS = {
    "inv": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
}


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
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _seed_invoice(client: AsyncClient) -> tuple[str, dict]:
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": "ubl@example.com", "name": "Inv Boss", "password": "supersecret"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    customer = await client.post(
        "/api/v1/invoices/customers",
        json={
            "name": "Bouwgroep B.V.",
            "email": "billing@bouwgroep.example",
            "kvk_number": "87654321",
            "vat_number": "NL987654321B01",
            "address_line1": "Bouwlaan 5",
            "postal_code": "3011BB",
            "city": "Rotterdam",
            "country_code": "NL",
        },
        headers=headers,
    )
    inv = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": customer.json()["id"],
            "issue_date": "2026-04-01",
            "payment_terms_days": 30,
            "lines": [
                {"description": "Tegelen badkamer", "quantity": 8.5, "unit": "m2",
                 "unit_price_cents": 4500, "vat_rate_bp": 2100},
                {"description": "Materiaal", "quantity": 1.0, "unit": "piece",
                 "unit_price_cents": 12000, "vat_rate_bp": 900},
            ],
        },
        headers=headers,
    )
    return headers["Authorization"], inv.json()


# ---------------------------------------------------------------------------
# Builder unit tests (no HTTP)
# ---------------------------------------------------------------------------


def _build_sample_xml() -> bytes:
    from app.services.invoices.ubl import build_invoice_ubl_xml

    invoice = {
        "invoice_number": "2026-0001",
        "issue_date": date(2026, 4, 1),
        "due_date": date(2026, 5, 1),
        "currency": "EUR",
        "notes": "Bedankt",
        "subtotal_cents": 50250,
        "vat_total_cents": 9113,
        "total_cents": 59363,
        "lines": [
            {
                "position": 0,
                "description": "Tegelen badkamer",
                "quantity": 8.5,
                "unit": "m2",
                "unit_price_cents": 4500,
                "vat_rate_bp": 2100,
                "line_net_cents": 38250,
                "line_vat_cents": 8033,
            },
            {
                "position": 1,
                "description": "Materiaal",
                "quantity": 1.0,
                "unit": "piece",
                "unit_price_cents": 12000,
                "vat_rate_bp": 900,
                "line_net_cents": 12000,
                "line_vat_cents": 1080,
            },
        ],
    }
    customer = {
        "name": "Bouwgroep B.V.",
        "vat_number": "NL987654321B01",
        "kvk_number": "87654321",
        "address_line1": "Bouwlaan 5",
        "postal_code": "3011BB",
        "city": "Rotterdam",
        "country_code": "NL",
    }
    supplier = {
        "name": "Foreman Bouw B.V.",
        "vat_number": "NL000000000B00",
        "kvk_number": "00000000",
        "address_line1": "Hoofdstraat 1",
        "postal_code": "1011AA",
        "city": "Amsterdam",
        "country_code": "NL",
        "email": "info@foreman.local",
        "iban": "NL00BANK0000000000",
    }
    return build_invoice_ubl_xml(invoice, customer=customer, supplier=supplier)


def test_ubl_xml_has_invoice_root_with_namespaces() -> None:
    xml_bytes = _build_sample_xml()
    root = ET.fromstring(xml_bytes)
    assert root.tag == "{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}Invoice"


def test_ubl_xml_has_peppol_customization_id() -> None:
    root = ET.fromstring(_build_sample_xml())
    cust = root.find("cbc:CustomizationID", UBL_NS)
    assert cust is not None
    assert "peppol.eu" in (cust.text or "")
    assert "en16931" in (cust.text or "")

    profile = root.find("cbc:ProfileID", UBL_NS)
    assert profile is not None
    assert "billing" in (profile.text or "").lower()


def test_ubl_xml_has_invoice_header_fields() -> None:
    root = ET.fromstring(_build_sample_xml())
    assert root.findtext("cbc:ID", namespaces=UBL_NS) == "2026-0001"
    assert root.findtext("cbc:IssueDate", namespaces=UBL_NS) == "2026-04-01"
    assert root.findtext("cbc:DueDate", namespaces=UBL_NS) == "2026-05-01"
    assert root.findtext("cbc:InvoiceTypeCode", namespaces=UBL_NS) == "380"
    assert root.findtext("cbc:DocumentCurrencyCode", namespaces=UBL_NS) == "EUR"


def test_ubl_xml_has_supplier_and_customer_parties() -> None:
    root = ET.fromstring(_build_sample_xml())
    supplier_name = root.find(
        "cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name", UBL_NS
    )
    assert supplier_name is not None
    assert supplier_name.text == "Foreman Bouw B.V."

    customer_name = root.find(
        "cac:AccountingCustomerParty/cac:Party/cac:PartyName/cbc:Name", UBL_NS
    )
    assert customer_name is not None
    assert customer_name.text == "Bouwgroep B.V."

    # Both parties should expose a VAT identifier under PartyTaxScheme
    supplier_vat = root.find(
        "cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID", UBL_NS
    )
    customer_vat = root.find(
        "cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID", UBL_NS
    )
    assert supplier_vat is not None and "NL" in (supplier_vat.text or "")
    assert customer_vat is not None and "NL" in (customer_vat.text or "")


def test_ubl_xml_has_legal_monetary_total_in_euros() -> None:
    root = ET.fromstring(_build_sample_xml())
    lmt = root.find("cac:LegalMonetaryTotal", UBL_NS)
    assert lmt is not None
    # Amounts in UBL are written as euros with 2 decimals.
    assert lmt.findtext("cbc:LineExtensionAmount", namespaces=UBL_NS) == "502.50"
    assert lmt.findtext("cbc:TaxExclusiveAmount", namespaces=UBL_NS) == "502.50"
    assert lmt.findtext("cbc:TaxInclusiveAmount", namespaces=UBL_NS) == "593.63"
    assert lmt.findtext("cbc:PayableAmount", namespaces=UBL_NS) == "593.63"

    # Currency attribute must be EUR on amount elements.
    line_ext = lmt.find("cbc:LineExtensionAmount", UBL_NS)
    assert line_ext.attrib["currencyID"] == "EUR"


def test_ubl_xml_has_tax_total_and_subtotals() -> None:
    root = ET.fromstring(_build_sample_xml())
    tax_total = root.find("cac:TaxTotal", UBL_NS)
    assert tax_total is not None
    assert tax_total.findtext("cbc:TaxAmount", namespaces=UBL_NS) == "91.13"

    subtotals = tax_total.findall("cac:TaxSubtotal", UBL_NS)
    # One per distinct VAT rate (21% and 9%)
    assert len(subtotals) == 2
    rates = {
        st.find("cac:TaxCategory/cbc:Percent", UBL_NS).text for st in subtotals
    }
    assert rates == {"21.00", "9.00"}


def test_ubl_xml_has_invoice_lines() -> None:
    root = ET.fromstring(_build_sample_xml())
    lines = root.findall("cac:InvoiceLine", UBL_NS)
    assert len(lines) == 2
    line0 = lines[0]
    assert line0.findtext("cbc:ID", namespaces=UBL_NS) == "1"
    qty = line0.find("cbc:InvoicedQuantity", UBL_NS)
    assert qty is not None
    assert qty.text == "8.5"
    assert qty.attrib["unitCode"] == "MTK"  # m² in UN/ECE Rec 20
    assert line0.findtext("cbc:LineExtensionAmount", namespaces=UBL_NS) == "382.50"

    item_name = line0.find("cac:Item/cbc:Name", UBL_NS)
    assert item_name is not None
    assert item_name.text == "Tegelen badkamer"
    price = line0.find("cac:Price/cbc:PriceAmount", UBL_NS)
    assert price is not None
    assert price.text == "45.00"


def test_validate_ubl_passes_on_valid_doc() -> None:
    from app.services.invoices.ubl import validate_ubl

    errors = validate_ubl(_build_sample_xml())
    assert errors == []


def test_validate_ubl_reports_missing_required_elements() -> None:
    from app.services.invoices.ubl import validate_ubl

    bad = (
        b'<?xml version="1.0" encoding="UTF-8"?>'
        b'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>'
    )
    errors = validate_ubl(bad)
    assert errors
    assert any("CustomizationID" in e for e in errors)


# ---------------------------------------------------------------------------
# HTTP endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_invoice_ubl_returns_xml(client: AsyncClient) -> None:
    auth, invoice = await _seed_invoice(client)
    resp = await client.get(
        f"/api/v1/invoices/{invoice['id']}/ubl",
        headers={"Authorization": auth},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/xml")
    root = ET.fromstring(resp.content)
    assert root.findtext("cbc:ID", namespaces=UBL_NS) == invoice["invoice_number"]


@pytest.mark.asyncio
async def test_get_invoice_ubl_requires_auth(client: AsyncClient) -> None:
    auth, invoice = await _seed_invoice(client)
    resp = await client.get(f"/api/v1/invoices/{invoice['id']}/ubl")
    assert resp.status_code in (401, 403)
