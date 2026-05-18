"""Tests for the PDF invoice template and rendering endpoint."""

from __future__ import annotations

from datetime import date
from unittest.mock import patch

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
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


def _sample_invoice() -> dict:
    return {
        "invoice_number": "2026-0001",
        "issue_date": date(2026, 4, 1),
        "due_date": date(2026, 5, 1),
        "currency": "EUR",
        "notes": "Bedankt voor de samenwerking",
        "subtotal_cents": 50250,
        "vat_total_cents": 9113,
        "total_cents": 59363,
        "payment_terms_days": 30,
        "lines": [
            {"position": 0, "description": "Tegelen badkamer", "quantity": 8.5,
             "unit": "m2", "unit_price_cents": 4500, "vat_rate_bp": 2100,
             "line_net_cents": 38250, "line_vat_cents": 8033},
            {"position": 1, "description": "Materiaal", "quantity": 1.0,
             "unit": "piece", "unit_price_cents": 12000, "vat_rate_bp": 900,
             "line_net_cents": 12000, "line_vat_cents": 1080},
        ],
    }


def _sample_customer() -> dict:
    return {
        "name": "Bouwgroep B.V.",
        "vat_number": "NL987654321B01",
        "kvk_number": "87654321",
        "address_line1": "Bouwlaan 5",
        "postal_code": "3011BB",
        "city": "Rotterdam",
        "country_code": "NL",
        "email": "billing@bouwgroep.example",
    }


def _sample_supplier() -> dict:
    return {
        "name": "Foreman Bouw B.V.",
        "vat_number": "NL000000000B00",
        "kvk_number": "12345678",
        "address_line1": "Hoofdstraat 1",
        "postal_code": "1011AA",
        "city": "Amsterdam",
        "country_code": "NL",
        "email": "info@foreman.local",
        "iban": "NL00BANK0000000000",
    }


# ---------------------------------------------------------------------------
# HTML template
# ---------------------------------------------------------------------------


def test_render_invoice_html_contains_branding_and_totals() -> None:
    from app.services.invoices.pdf import render_invoice_html

    html = render_invoice_html(
        _sample_invoice(), customer=_sample_customer(), supplier=_sample_supplier()
    )
    # Branding
    assert "Foreman Bouw B.V." in html
    assert "KVK: 12345678" in html
    assert "BTW: NL000000000B00" in html
    assert "IBAN: NL00BANK0000000000" in html

    # Customer block
    assert "Bouwgroep B.V." in html
    assert "Rotterdam" in html
    assert "NL987654321B01" in html

    # Invoice header
    assert "2026-0001" in html
    assert "2026-04-01" in html
    assert "2026-05-01" in html

    # Line items with descriptions and quantities
    assert "Tegelen badkamer" in html
    assert "Materiaal" in html
    # Euros displayed with comma decimal separator (Dutch style)
    # Note: backend output uses '.' as decimal — frontend formats for locale.
    # We assert the cents-derived euro value renders as a dot-decimal number.
    assert "502.50" in html  # subtotal
    assert "593.63" in html  # total
    assert "91.13" in html  # vat

    # VAT breakdown rows
    assert "21%" in html
    assert "9%" in html


def test_render_invoice_html_escapes_user_content() -> None:
    from app.services.invoices.pdf import render_invoice_html

    inv = _sample_invoice()
    inv["lines"][0]["description"] = "<script>alert(1)</script>"
    inv["notes"] = "<b>boom</b>"
    html = render_invoice_html(inv, customer=_sample_customer(), supplier=_sample_supplier())
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "&lt;b&gt;boom&lt;/b&gt;" in html


# ---------------------------------------------------------------------------
# PDF rendering — WeasyPrint is mocked to avoid the native dependency in CI.
# ---------------------------------------------------------------------------


def test_render_invoice_pdf_uses_weasyprint(monkeypatch) -> None:
    from app.services.invoices import pdf as pdf_mod

    captured: dict[str, str] = {}

    class _FakeHTML:
        def __init__(self, string: str) -> None:
            captured["html"] = string

        def write_pdf(self) -> bytes:
            return b"%PDF-1.4 fake"

    monkeypatch.setattr(pdf_mod, "_load_weasyprint_html", lambda: _FakeHTML)
    out = pdf_mod.render_invoice_pdf(
        _sample_invoice(), customer=_sample_customer(), supplier=_sample_supplier()
    )
    assert out.startswith(b"%PDF")
    assert "2026-0001" in captured["html"]


def test_render_invoice_pdf_raises_when_weasyprint_unavailable(monkeypatch) -> None:
    from app.services.invoices import pdf as pdf_mod

    def _raise():
        raise ImportError("WeasyPrint not installed")

    monkeypatch.setattr(pdf_mod, "_load_weasyprint_html", _raise)
    with pytest.raises(RuntimeError, match="WeasyPrint"):
        pdf_mod.render_invoice_pdf(
            _sample_invoice(), customer=_sample_customer(), supplier=_sample_supplier()
        )


# ---------------------------------------------------------------------------
# HTTP endpoint
# ---------------------------------------------------------------------------


async def _seed_invoice(client: AsyncClient) -> tuple[str, dict]:
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": "pdf@example.com", "name": "Inv Boss", "password": "supersecret"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    customer = await client.post(
        "/api/v1/invoices/customers",
        json={
            "name": "Bouwgroep B.V.",
            "vat_number": "NL987654321B01",
            "kvk_number": "87654321",
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
                {"description": "Tegelen", "quantity": 1.0, "unit": "piece",
                 "unit_price_cents": 12345, "vat_rate_bp": 2100},
            ],
        },
        headers=headers,
    )
    return headers["Authorization"], inv.json()


@pytest.mark.asyncio
async def test_invoice_pdf_endpoint(client: AsyncClient) -> None:
    auth, invoice = await _seed_invoice(client)

    with patch(
        "app.services.invoices.pdf.render_invoice_pdf",
        return_value=b"%PDF-1.4 pretend",
    ):
        resp = await client.get(
            f"/api/v1/invoices/{invoice['id']}/pdf",
            headers={"Authorization": auth},
        )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content == b"%PDF-1.4 pretend"
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert invoice["invoice_number"] in resp.headers["content-disposition"]


@pytest.mark.asyncio
async def test_invoice_pdf_requires_auth(client: AsyncClient) -> None:
    auth, invoice = await _seed_invoice(client)
    resp = await client.get(f"/api/v1/invoices/{invoice['id']}/pdf")
    assert resp.status_code in (401, 403)
