"""Tests for the Quote (offerte) endpoints, AI estimation service, PDF, and analytics."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from unittest.mock import AsyncMock, MagicMock, patch

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


async def _auth(client: AsyncClient, email: str = "quote@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Quote Boss", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _make_customer(client: AsyncClient, headers: dict) -> dict:
    resp = await client.post(
        "/api/v1/invoices/customers",
        json={
            "name": "Bouw B.V.",
            "email": "bouw@example.com",
            "kvk_number": "12345678",
            "vat_number": "NL123456789B01",
            "address_line1": "Bouwstraat 1",
            "postal_code": "1234AB",
            "city": "Amsterdam",
            "country_code": "NL",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _minimal_line() -> dict:
    return {
        "description": "Stucwerk woonkamer",
        "quantity": 25.0,
        "unit": "m2",
        "unit_price_cents": 2500,
        "vat_rate_bp": 2100,
    }


# ---------------------------------------------------------------------------
# Unit tests: quote totals helper
# ---------------------------------------------------------------------------


def test_compute_line_totals_used_in_quotes() -> None:
    """The same totals helper used by invoices is reused for quotes."""
    from app.services.invoices.totals import compute_line_totals

    net, vat = compute_line_totals(quantity=25.0, unit_price_cents=2500, vat_rate_bp=2100)
    assert net == 62500
    assert vat == 13125


# ---------------------------------------------------------------------------
# Unit tests: AI estimation service
# ---------------------------------------------------------------------------


def test_estimate_builds_prompt_and_parses_response() -> None:
    from app.services.quotes.estimator import QuoteEstimator

    mock_client = MagicMock()
    mock_client.complete.return_value = """{
        "lines": [
            {"description": "Stucwerk", "quantity": 25.0, "unit": "m2",
             "unit_price_cents": 2500, "vat_rate_bp": 2100},
            {"description": "Materiaalkosten", "quantity": 1.0, "unit": "piece",
             "unit_price_cents": 8000, "vat_rate_bp": 2100}
        ],
        "estimated_duration_days": 3,
        "reasoning": "Based on 25m2 plastering, avg 2-3 days at €25/m2"
    }"""

    estimator = QuoteEstimator(llm_client=mock_client)
    result = estimator.estimate(
        project_type="stucwerk",
        dimensions={"area_m2": 25},
        historical_context="Avg stucwerk: 3 days for 20m2",
    )

    assert len(result.lines) == 2
    assert result.estimated_duration_days == 3
    assert "plastering" in result.reasoning.lower() or result.reasoning


def test_estimate_falls_back_on_malformed_llm_response() -> None:
    from app.services.quotes.estimator import QuoteEstimator

    mock_client = MagicMock()
    mock_client.complete.return_value = "NOT_JSON"

    estimator = QuoteEstimator(llm_client=mock_client)
    result = estimator.estimate(
        project_type="schilderwerk",
        dimensions={"area_m2": 10},
        historical_context="",
    )
    # Falls back to empty lines with empty reasoning, not a crash
    assert result.lines == []
    assert isinstance(result.reasoning, str)


# ---------------------------------------------------------------------------
# Unit tests: PDF rendering
# ---------------------------------------------------------------------------


def test_render_quote_html_contains_offerte_header() -> None:
    from app.services.quotes.pdf import render_quote_html

    from datetime import date

    html = render_quote_html(
        quote={
            "quote_number": "OFFERTE-2026-0001",
            "issue_date": date(2026, 5, 26),
            "valid_until": date(2026, 6, 26),
            "payment_terms_days": 30,
            "notes": "Inclusief opruimen",
            "subtotal_cents": 62500,
            "vat_total_cents": 13125,
            "total_cents": 75625,
            "lines": [
                {
                    "description": "Stucwerk woonkamer",
                    "quantity": 25.0,
                    "unit": "m2",
                    "unit_price_cents": 2500,
                    "vat_rate_bp": 2100,
                    "line_net_cents": 62500,
                    "line_vat_cents": 13125,
                }
            ],
        },
        customer={"name": "Bouw B.V.", "address_line1": "Bouwstraat 1",
                  "postal_code": "1234AB", "city": "Amsterdam", "country_code": "NL"},
        supplier={"name": "De Stukadoor B.V.", "kvk_number": "99999999",
                  "vat_number": "NL999999999B01", "iban": "NL02ABNA0123456789",
                  "address_line1": "Aannemerslaan 5", "postal_code": "5678CD",
                  "city": "Rotterdam", "country_code": "NL"},
    )

    assert "OFFERTE" in html
    assert "Bouw B.V." in html
    assert "Stucwerk woonkamer" in html
    assert "62500" not in html  # should be formatted as euros
    assert "625,00" in html or "625.00" in html


def test_render_quote_pdf_calls_weasyprint() -> None:
    from app.services.quotes import pdf as pdf_mod
    from datetime import date

    quote_data = {
        "quote_number": "OFFERTE-2026-0001",
        "issue_date": date(2026, 5, 26),
        "valid_until": date(2026, 6, 26),
        "payment_terms_days": 30,
        "notes": None,
        "subtotal_cents": 62500,
        "vat_total_cents": 13125,
        "total_cents": 75625,
        "lines": [],
    }
    customer = {"name": "Test", "address_line1": "", "postal_code": "", "city": "", "country_code": "NL"}
    supplier = {"name": "Test BV", "kvk_number": "", "vat_number": "", "iban": "",
                "address_line1": "", "postal_code": "", "city": "", "country_code": "NL"}

    fake_html_instance = MagicMock()
    fake_html_instance.write_pdf.return_value = b"%PDF-fake"
    FakeHTML = MagicMock(return_value=fake_html_instance)

    with patch.object(pdf_mod, "_load_weasyprint_html", return_value=FakeHTML):
        result = pdf_mod.render_quote_pdf(quote_data, customer=customer, supplier=supplier)

    assert result == b"%PDF-fake"
    FakeHTML.assert_called_once()


# ---------------------------------------------------------------------------
# Integration tests: CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_quote_draft(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)

    payload = {
        "customer_id": customer["id"],
        "project_type": "stucwerk",
        "valid_until": "2026-06-30",
        "payment_terms_days": 14,
        "notes": "Graag op te ruimen na afloop",
        "lines": [_minimal_line()],
    }
    resp = await client.post("/api/v1/quotes/", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["status"] == "draft"
    assert data["project_type"] == "stucwerk"
    assert data["subtotal_cents"] == 62500
    assert data["vat_total_cents"] == 13125
    assert data["total_cents"] == 75625
    assert len(data["lines"]) == 1
    assert "id" in data


@pytest.mark.asyncio
async def test_create_quote_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/quotes/", json={})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_quote_rejects_bad_vat(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    bad_line = {**_minimal_line(), "vat_rate_bp": 1500}
    resp = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "project_type": "test",
              "lines": [bad_line]},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_quote_rejects_unknown_customer(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/quotes/",
        json={
            "customer_id": "00000000-0000-0000-0000-000000000000",
            "project_type": "test",
            "lines": [_minimal_line()],
        },
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_and_get_quote(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    payload = {
        "customer_id": customer["id"],
        "project_type": "tegelen",
        "lines": [_minimal_line()],
    }
    created = (await client.post("/api/v1/quotes/", json=payload, headers=headers)).json()

    listing = await client.get("/api/v1/quotes/", headers=headers)
    assert listing.status_code == 200
    items = listing.json()["data"]
    assert len(items) == 1
    assert items[0]["id"] == created["id"]

    one = await client.get(f"/api/v1/quotes/{created['id']}", headers=headers)
    assert one.status_code == 200
    assert one.json()["project_type"] == "tegelen"
    assert len(one.json()["lines"]) == 1


@pytest.mark.asyncio
async def test_quotes_scoped_per_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "boss1@quote.com")
    h2 = await _auth(client, "boss2@quote.com")
    c1 = await _make_customer(client, h1)

    payload = {"customer_id": c1["id"], "project_type": "schilderwerk",
               "lines": [_minimal_line()]}
    created = (await client.post("/api/v1/quotes/", json=payload, headers=h1)).json()

    other = await client.get(f"/api/v1/quotes/{created['id']}", headers=h2)
    assert other.status_code == 404

    listing = await client.get("/api/v1/quotes/", headers=h2)
    assert listing.json()["data"] == []


@pytest.mark.asyncio
async def test_transition_quote_sent(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    created = (await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "project_type": "stucwerk",
              "lines": [_minimal_line()]},
        headers=headers,
    )).json()

    resp = await client.post(
        f"/api/v1/quotes/{created['id']}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "sent"
    assert resp.json()["sent_at"] is not None


@pytest.mark.asyncio
async def test_transition_quote_invalid_status(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    created = (await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "project_type": "stucwerk",
              "lines": [_minimal_line()]},
        headers=headers,
    )).json()

    resp = await client.post(
        f"/api/v1/quotes/{created['id']}/transition",
        json={"status": "paid"},  # not a valid quote status
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_transition_quote_accepted(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    created = (await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "project_type": "stucwerk",
              "lines": [_minimal_line()]},
        headers=headers,
    )).json()
    # sent first
    await client.post(
        f"/api/v1/quotes/{created['id']}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    resp = await client.post(
        f"/api/v1/quotes/{created['id']}/transition",
        json={"status": "accepted"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"
    assert resp.json()["accepted_at"] is not None


# ---------------------------------------------------------------------------
# Integration tests: AI estimate endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ai_estimate_endpoint(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)

    fake_estimate = {
        "lines": [
            {"description": "Stucwerk", "quantity": 25.0, "unit": "m2",
             "unit_price_cents": 2500, "vat_rate_bp": 2100},
        ],
        "estimated_duration_days": 3,
        "reasoning": "Typical plastering job",
    }

    with patch("app.services.quotes.estimator.QuoteEstimator.estimate") as mock_est:
        mock_est.return_value = MagicMock(
            lines=fake_estimate["lines"],
            estimated_duration_days=3,
            reasoning="Typical plastering job",
        )
        resp = await client.post(
            "/api/v1/quotes/estimate",
            json={
                "customer_id": customer["id"],
                "project_type": "stucwerk",
                "dimensions": {"area_m2": 25},
            },
            headers=headers,
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "lines" in data
    assert data["estimated_duration_days"] == 3


# ---------------------------------------------------------------------------
# Integration tests: PDF endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_quote_pdf(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    created = (await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "project_type": "stucwerk",
              "lines": [_minimal_line()]},
        headers=headers,
    )).json()

    from app.services.quotes import pdf as pdf_mod

    fake_html_instance = MagicMock()
    fake_html_instance.write_pdf.return_value = b"%PDF-quote"
    FakeHTML = MagicMock(return_value=fake_html_instance)

    with patch.object(pdf_mod, "_load_weasyprint_html", return_value=FakeHTML):
        resp = await client.get(
            f"/api/v1/quotes/{created['id']}/pdf",
            headers=headers,
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content == b"%PDF-quote"


# ---------------------------------------------------------------------------
# Integration tests: quote-to-invoice conversion
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_convert_accepted_quote_to_invoice(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    created = (await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "project_type": "stucwerk",
              "lines": [_minimal_line()]},
        headers=headers,
    )).json()

    # transition to accepted
    await client.post(
        f"/api/v1/quotes/{created['id']}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/quotes/{created['id']}/transition",
        json={"status": "accepted"},
        headers=headers,
    )

    resp = await client.post(
        f"/api/v1/quotes/{created['id']}/convert-to-invoice",
        json={"issue_date": "2026-05-26"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["customer_id"] == customer["id"]
    assert data["subtotal_cents"] == 62500
    assert data["status"] == "draft"
    assert len(data["lines"]) == 1


@pytest.mark.asyncio
async def test_convert_non_accepted_quote_fails(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    created = (await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "project_type": "stucwerk",
              "lines": [_minimal_line()]},
        headers=headers,
    )).json()

    # still draft — conversion should fail
    resp = await client.post(
        f"/api/v1/quotes/{created['id']}/convert-to-invoice",
        json={"issue_date": "2026-05-26"},
        headers=headers,
    )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Integration tests: analytics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_quote_analytics_acceptance_rate(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)

    async def _create_and_transition(*statuses: str) -> None:
        q = (await client.post(
            "/api/v1/quotes/",
            json={"customer_id": customer["id"], "project_type": "stucwerk",
                  "lines": [_minimal_line()]},
            headers=headers,
        )).json()
        for s in statuses:
            await client.post(
                f"/api/v1/quotes/{q['id']}/transition",
                json={"status": s},
                headers=headers,
            )

    # 2 accepted out of 3 sent (1 rejected)
    await _create_and_transition("sent", "accepted")
    await _create_and_transition("sent", "accepted")
    await _create_and_transition("sent", "rejected")
    # 1 draft (not counted)
    await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "project_type": "stucwerk",
              "lines": [_minimal_line()]},
        headers=headers,
    )

    resp = await client.get("/api/v1/quotes/analytics", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total_quotes"] == 4
    assert data["sent"] == 3
    assert data["accepted"] == 2
    assert data["rejected"] == 1
    assert data["acceptance_rate"] == pytest.approx(2 / 3)
