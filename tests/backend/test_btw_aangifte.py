"""Tests for BTW-aangifte (VAT filing) export — Dutch OB-aangifte format.

VAT filing aggregates from journal entries by Dutch VAT rate:
  - Rubriek 1a: leveringen/diensten belast 21%
  - Rubriek 1b: leveringen/diensten belast 9%
  - Rubriek 1c: leveringen/diensten belast 0% / vrijgesteld
  - Rubriek 5b: voorbelasting (inkoop BTW, deductible)

All amounts in integer euro cents.
"""

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


async def _seed(client: AsyncClient, headers: dict) -> dict[str, str]:
    """Seed RGS-light chart of accounts, return {code: id}."""
    resp = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    return {a["code"]: a["id"] for a in resp.json()}


async def _post_vat_entry(
    client: AsyncClient,
    headers: dict,
    codes: dict[str, str],
    entry_date: str,
    net_cents: int,
    vat_cents: int,
    vat_account: str = "1610",  # Te betalen BTW (sales VAT)
) -> dict:
    """Post a journal entry: AR debit, Revenue credit, VAT credit."""
    total = net_cents + vat_cents
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": entry_date,
            "description": f"Verkoopfactuur {net_cents}ct netto",
            "lines": [
                {"account_id": codes["1300"], "debit_cents": total},  # AR
                {"account_id": codes["8100"], "credit_cents": net_cents},  # Revenue
                {"account_id": codes[vat_account], "credit_cents": vat_cents},  # VAT
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _post_purchase_vat_entry(
    client: AsyncClient,
    headers: dict,
    codes: dict[str, str],
    entry_date: str,
    net_cents: int,
    vat_cents: int,
) -> dict:
    """Post a purchase journal entry: expense debit, VAT debit (1620), AP credit."""
    total = net_cents + vat_cents
    resp = await client.post(
        "/api/v1/financials/journal-entries",
        json={
            "entry_date": entry_date,
            "description": f"Inkoopfactuur {net_cents}ct netto",
            "lines": [
                {"account_id": codes["4700"], "debit_cents": net_cents},  # Expense
                {"account_id": codes["1620"], "debit_cents": vat_cents},  # Deductible VAT
                {"account_id": codes["1400"], "credit_cents": total},  # AP
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Model + migration: VATFiling exists
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vat_filing_model_importable() -> None:
    """VATFiling model must exist and be importable."""
    from app.models.vat_filing import VATFiling  # noqa: F401

    assert VATFiling.__tablename__ == "vat_filings"


# ---------------------------------------------------------------------------
# Generate filing — basic
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_filing_for_quarter(client: AsyncClient) -> None:
    """Generate a BTW-aangifte for Q1 2025 with one 21% sale."""
    headers = await _auth(client)
    codes = await _seed(client, headers)

    # Sale: €1000 net + €210 VAT (21%)
    await _post_vat_entry(client, headers, codes, "2025-01-15", 100_000, 21_000)

    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["period_start"] == "2025-01-01"
    assert body["period_end"] == "2025-03-31"
    assert body["status"] == "draft"
    assert body["filing_data"]["rubric_1a_turnover_cents"] == 100_000
    assert body["filing_data"]["rubric_1a_vat_cents"] == 21_000
    assert body["total_vat_due_cents"] == 21_000


@pytest.mark.asyncio
async def test_generate_filing_empty_quarter(client: AsyncClient) -> None:
    """Generate filing for a quarter with no entries — all zeros."""
    headers = await _auth(client)
    await _seed(client, headers)

    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 2},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_vat_due_cents"] == 0
    assert body["total_vat_deductible_cents"] == 0
    assert body["net_amount_cents"] == 0


@pytest.mark.asyncio
async def test_generate_filing_with_9pct_vat(client: AsyncClient) -> None:
    """Rubric 1b captures 9% VAT rate sales."""
    headers = await _auth(client)
    codes = await _seed(client, headers)

    # Seed 9% VAT account
    r = await client.post(
        "/api/v1/financials/accounts",
        json={
            "code": "1611",
            "name": "Te betalen BTW 9%",
            "account_type": "liability",
            "normal_balance": "credit",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    codes["1611"] = r.json()["id"]

    # Sale: €500 net + €45 VAT (9%)
    await _post_vat_entry(client, headers, codes, "2025-01-20", 50_000, 4_500, "1611")

    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    filing = body["filing_data"]
    assert filing["rubric_1b_vat_cents"] == 4_500
    assert body["total_vat_due_cents"] == 4_500


@pytest.mark.asyncio
async def test_generate_filing_with_deductible_vat(client: AsyncClient) -> None:
    """Rubric 5b captures deductible purchase VAT (voorbelasting)."""
    headers = await _auth(client)
    codes = await _seed(client, headers)

    # Sale: €1000 net + €210 VAT (21%)
    await _post_vat_entry(client, headers, codes, "2025-01-15", 100_000, 21_000)
    # Purchase: €500 net + €105 deductible VAT
    await _post_purchase_vat_entry(client, headers, codes, "2025-01-20", 50_000, 10_500)

    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_vat_due_cents"] == 21_000
    assert body["total_vat_deductible_cents"] == 10_500
    assert body["net_amount_cents"] == 21_000 - 10_500  # 10_500
    assert body["filing_data"]["rubric_5b_vat_cents"] == 10_500


@pytest.mark.asyncio
async def test_generate_filing_only_posted_entries(client: AsyncClient) -> None:
    """Filing must only aggregate posted journal entries."""
    headers = await _auth(client)
    codes = await _seed(client, headers)

    # One valid posted entry
    await _post_vat_entry(client, headers, codes, "2025-01-15", 100_000, 21_000)

    # Entry in different quarter — must not be included
    await _post_vat_entry(client, headers, codes, "2025-04-15", 200_000, 42_000)

    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_vat_due_cents"] == 21_000  # only Q1 entry


@pytest.mark.asyncio
async def test_generate_filing_tenant_isolation(client: AsyncClient) -> None:
    """Filing must only aggregate entries for the authenticated user."""
    h1 = await _auth(client, "u1@btw.com")
    h2 = await _auth(client, "u2@btw.com")
    codes1 = await _seed(client, h1)
    await _seed(client, h2)

    # User 1 has a sale
    await _post_vat_entry(client, h1, codes1, "2025-01-15", 100_000, 21_000)

    # User 2 generates — must see 0
    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=h2,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["total_vat_due_cents"] == 0


# ---------------------------------------------------------------------------
# Invalid quarter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_quarter_rejected(client: AsyncClient) -> None:
    """Quarter must be 1-4."""
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 5},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_quarter_zero_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 0},
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# List filings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_vat_filings(client: AsyncClient) -> None:
    """List returns all filings for authenticated user, scoped."""
    h1 = await _auth(client, "list1@btw.com")
    h2 = await _auth(client, "list2@btw.com")

    await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=h1,
    )
    await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 2},
        headers=h1,
    )

    resp1 = await client.get("/api/v1/vat-filings/", headers=h1)
    resp2 = await client.get("/api/v1/vat-filings/", headers=h2)

    assert resp1.status_code == 200
    assert len(resp1.json()) == 2
    assert resp2.status_code == 200
    assert resp2.json() == []


# ---------------------------------------------------------------------------
# Get single filing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_vat_filing_by_id(client: AsyncClient) -> None:
    headers = await _auth(client, "get1@btw.com")
    create_resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    filing_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/vat-filings/{filing_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == filing_id


@pytest.mark.asyncio
async def test_get_vat_filing_other_user_returns_404(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@btw.com")
    h2 = await _auth(client, "other@btw.com")
    create_resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=h1,
    )
    filing_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/vat-filings/{filing_id}", headers=h2)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Export — JSON and CSV
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_filing_json(client: AsyncClient) -> None:
    """Export endpoint returns structured JSON with all rubrics."""
    headers = await _auth(client, "export1@btw.com")
    codes = await _seed(client, headers)
    await _post_vat_entry(client, headers, codes, "2025-01-15", 100_000, 21_000)

    create_resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    filing_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/vat-filings/{filing_id}/export",
        params={"format": "json"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "rubric_1a_turnover_cents" in data
    assert "rubric_1a_vat_cents" in data
    assert "rubric_1b_vat_cents" in data
    assert "rubric_5b_vat_cents" in data
    assert "total_vat_due_cents" in data
    assert "total_vat_deductible_cents" in data
    assert "net_amount_cents" in data


@pytest.mark.asyncio
async def test_export_filing_csv(client: AsyncClient) -> None:
    """Export endpoint returns CSV text when format=csv."""
    headers = await _auth(client, "export2@btw.com")
    codes = await _seed(client, headers)
    await _post_vat_entry(client, headers, codes, "2025-01-15", 100_000, 21_000)

    create_resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    filing_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/vat-filings/{filing_id}/export",
        params={"format": "csv"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    text = resp.text
    assert "rubric_1a_vat_cents" in text
    assert "21000" in text


# ---------------------------------------------------------------------------
# ICP declaration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_icp_declaration_empty(client: AsyncClient) -> None:
    """ICP declaration with no intra-community supplies returns empty list."""
    headers = await _auth(client, "icp1@btw.com")
    create_resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    filing_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/vat-filings/{filing_id}/icp", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["period_start"] == "2025-01-01"
    assert body["period_end"] == "2025-03-31"
    assert body["supplies"] == []


@pytest.mark.asyncio
async def test_icp_declaration_with_supplies(client: AsyncClient) -> None:
    """ICP endpoint accepts posted ICP supplies and returns them aggregated by VAT ID."""
    headers = await _auth(client, "icp2@btw.com")
    create_resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
        headers=headers,
    )
    filing_id = create_resp.json()["id"]

    # Post two ICP supplies for the same VAT ID
    await client.post(
        f"/api/v1/vat-filings/{filing_id}/icp/supplies",
        json={
            "counterparty_vat_id": "DE123456789",
            "counterparty_name": "German Firm GmbH",
            "amount_cents": 50_000,
            "supply_date": "2025-01-10",
        },
        headers=headers,
    )
    await client.post(
        f"/api/v1/vat-filings/{filing_id}/icp/supplies",
        json={
            "counterparty_vat_id": "DE123456789",
            "counterparty_name": "German Firm GmbH",
            "amount_cents": 30_000,
            "supply_date": "2025-02-15",
        },
        headers=headers,
    )

    resp = await client.get(f"/api/v1/vat-filings/{filing_id}/icp", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["supplies"]) == 1  # aggregated by VAT ID
    supply = body["supplies"][0]
    assert supply["counterparty_vat_id"] == "DE123456789"
    assert supply["total_amount_cents"] == 80_000


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_filing_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/vat-filings/generate",
        json={"year": 2025, "quarter": 1},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_filings_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/vat-filings/")
    assert resp.status_code in (401, 403)
