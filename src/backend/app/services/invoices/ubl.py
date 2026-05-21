"""UBL 2.1 invoice XML generation (Peppol BIS Billing 3.0).

Implements the subset of UBL Invoice required for Dutch e-invoicing /
Peppol BIS Billing 3.0. Amounts are emitted as euros with 2 decimal places
(scaled from internal integer cents).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from decimal import Decimal
from typing import Any
from xml.etree import ElementTree as ET

UBL_INVOICE_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
UBL_CAC_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
UBL_CBC_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"

CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0"
PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"

# UN/ECE Rec 20 unit codes
_UNIT_CODE_MAP = {
    "piece": "C62",
    "stuk": "C62",
    "m": "MTR",
    "m2": "MTK",
    "m²": "MTK",
    "m3": "MTQ",
    "m³": "MTQ",
    "kg": "KGM",
    "L": "LTR",
    "l": "LTR",
    "uur": "HUR",
    "hour": "HUR",
}


def _euro(cents: int) -> str:
    return f"{Decimal(cents) / 100:.2f}"


def _qty(value: float) -> str:
    # Strip trailing zeros but keep at least one decimal place.
    s = f"{value:.4f}".rstrip("0").rstrip(".")
    if "." not in s:
        s += ".0"
    return s


def _percent(bp: int) -> str:
    return f"{Decimal(bp) / 100:.2f}"


def _vat_category(bp: int) -> str:
    # UBL/EN16931 tax category codes: S = standard, AA = reduced (we use S/AA), Z = zero
    if bp == 0:
        return "Z"
    if bp < 2100:
        return "AA"
    return "S"


def _unit_code(unit: str) -> str:
    return _UNIT_CODE_MAP.get(unit, "C62")


def _SubElement(parent: ET.Element, tag: str, text: str | None = None, **attrib: str) -> ET.Element:
    elem = ET.SubElement(parent, tag, attrib=attrib)
    if text is not None:
        elem.text = text
    return elem


def _add_party(parent: ET.Element, party: Mapping[str, Any], *, ns_prefix_cac: str) -> None:
    party_elem = ET.SubElement(parent, f"{{{UBL_CAC_NS}}}Party")
    name_block = ET.SubElement(party_elem, f"{{{UBL_CAC_NS}}}PartyName")
    _SubElement(name_block, f"{{{UBL_CBC_NS}}}Name", party.get("name", ""))

    addr = ET.SubElement(party_elem, f"{{{UBL_CAC_NS}}}PostalAddress")
    if party.get("address_line1"):
        _SubElement(addr, f"{{{UBL_CBC_NS}}}StreetName", party["address_line1"])
    if party.get("city"):
        _SubElement(addr, f"{{{UBL_CBC_NS}}}CityName", party["city"])
    if party.get("postal_code"):
        _SubElement(addr, f"{{{UBL_CBC_NS}}}PostalZone", party["postal_code"])
    country = ET.SubElement(addr, f"{{{UBL_CAC_NS}}}Country")
    _SubElement(country, f"{{{UBL_CBC_NS}}}IdentificationCode", party.get("country_code", "NL"))

    if party.get("vat_number"):
        tax_scheme = ET.SubElement(party_elem, f"{{{UBL_CAC_NS}}}PartyTaxScheme")
        _SubElement(tax_scheme, f"{{{UBL_CBC_NS}}}CompanyID", party["vat_number"])
        scheme = ET.SubElement(tax_scheme, f"{{{UBL_CAC_NS}}}TaxScheme")
        _SubElement(scheme, f"{{{UBL_CBC_NS}}}ID", "VAT")

    legal_entity = ET.SubElement(party_elem, f"{{{UBL_CAC_NS}}}PartyLegalEntity")
    _SubElement(legal_entity, f"{{{UBL_CBC_NS}}}RegistrationName", party.get("name", ""))
    if party.get("kvk_number"):
        _SubElement(
            legal_entity,
            f"{{{UBL_CBC_NS}}}CompanyID",
            party["kvk_number"],
            schemeID="0106",  # Dutch KvK identifier scheme
        )

    if party.get("email"):
        contact = ET.SubElement(party_elem, f"{{{UBL_CAC_NS}}}Contact")
        _SubElement(contact, f"{{{UBL_CBC_NS}}}ElectronicMail", party["email"])


def _group_lines_by_vat(lines: Sequence[Mapping[str, Any]]) -> dict[int, dict[str, int]]:
    groups: dict[int, dict[str, int]] = {}
    for line in lines:
        rate = int(line["vat_rate_bp"])
        g = groups.setdefault(rate, {"net": 0, "vat": 0})
        g["net"] += int(line["line_net_cents"])
        g["vat"] += int(line["line_vat_cents"])
    return groups


def build_invoice_ubl_xml(
    invoice: Mapping[str, Any],
    *,
    customer: Mapping[str, Any],
    supplier: Mapping[str, Any],
) -> bytes:
    """Render a UBL 2.1 / Peppol BIS Billing 3.0 invoice as XML bytes."""

    ET.register_namespace("", UBL_INVOICE_NS)
    ET.register_namespace("cac", UBL_CAC_NS)
    ET.register_namespace("cbc", UBL_CBC_NS)

    root = ET.Element(f"{{{UBL_INVOICE_NS}}}Invoice")
    _SubElement(root, f"{{{UBL_CBC_NS}}}CustomizationID", CUSTOMIZATION_ID)
    _SubElement(root, f"{{{UBL_CBC_NS}}}ProfileID", PROFILE_ID)
    _SubElement(root, f"{{{UBL_CBC_NS}}}ID", str(invoice["invoice_number"]))

    issue: date = invoice["issue_date"]
    due: date = invoice["due_date"]
    _SubElement(root, f"{{{UBL_CBC_NS}}}IssueDate", issue.isoformat())
    _SubElement(root, f"{{{UBL_CBC_NS}}}DueDate", due.isoformat())
    _SubElement(root, f"{{{UBL_CBC_NS}}}InvoiceTypeCode", "380")
    if invoice.get("notes"):
        _SubElement(root, f"{{{UBL_CBC_NS}}}Note", str(invoice["notes"]))
    currency = invoice.get("currency", "EUR")
    _SubElement(root, f"{{{UBL_CBC_NS}}}DocumentCurrencyCode", currency)

    supplier_block = ET.SubElement(root, f"{{{UBL_CAC_NS}}}AccountingSupplierParty")
    _add_party(supplier_block, supplier, ns_prefix_cac="cac")
    customer_block = ET.SubElement(root, f"{{{UBL_CAC_NS}}}AccountingCustomerParty")
    _add_party(customer_block, customer, ns_prefix_cac="cac")

    # Payment means: IBAN credit transfer (Peppol code 30)
    if supplier.get("iban"):
        pm = ET.SubElement(root, f"{{{UBL_CAC_NS}}}PaymentMeans")
        _SubElement(pm, f"{{{UBL_CBC_NS}}}PaymentMeansCode", "30")
        _SubElement(pm, f"{{{UBL_CBC_NS}}}PaymentDueDate", due.isoformat())
        payee = ET.SubElement(pm, f"{{{UBL_CAC_NS}}}PayeeFinancialAccount")
        _SubElement(payee, f"{{{UBL_CBC_NS}}}ID", supplier["iban"])

    # Tax totals
    tax_total = ET.SubElement(root, f"{{{UBL_CAC_NS}}}TaxTotal")
    _SubElement(
        tax_total,
        f"{{{UBL_CBC_NS}}}TaxAmount",
        _euro(int(invoice["vat_total_cents"])),
        currencyID=currency,
    )
    for rate_bp, totals in sorted(_group_lines_by_vat(invoice["lines"]).items()):
        sub = ET.SubElement(tax_total, f"{{{UBL_CAC_NS}}}TaxSubtotal")
        _SubElement(
            sub,
            f"{{{UBL_CBC_NS}}}TaxableAmount",
            _euro(totals["net"]),
            currencyID=currency,
        )
        _SubElement(
            sub,
            f"{{{UBL_CBC_NS}}}TaxAmount",
            _euro(totals["vat"]),
            currencyID=currency,
        )
        cat = ET.SubElement(sub, f"{{{UBL_CAC_NS}}}TaxCategory")
        _SubElement(cat, f"{{{UBL_CBC_NS}}}ID", _vat_category(rate_bp))
        _SubElement(cat, f"{{{UBL_CBC_NS}}}Percent", _percent(rate_bp))
        scheme = ET.SubElement(cat, f"{{{UBL_CAC_NS}}}TaxScheme")
        _SubElement(scheme, f"{{{UBL_CBC_NS}}}ID", "VAT")

    # Legal monetary totals
    lmt = ET.SubElement(root, f"{{{UBL_CAC_NS}}}LegalMonetaryTotal")
    subtotal = int(invoice["subtotal_cents"])
    vat_total = int(invoice["vat_total_cents"])
    total = int(invoice["total_cents"])
    _SubElement(lmt, f"{{{UBL_CBC_NS}}}LineExtensionAmount", _euro(subtotal), currencyID=currency)
    _SubElement(lmt, f"{{{UBL_CBC_NS}}}TaxExclusiveAmount", _euro(subtotal), currencyID=currency)
    _SubElement(lmt, f"{{{UBL_CBC_NS}}}TaxInclusiveAmount", _euro(subtotal + vat_total), currencyID=currency)
    _SubElement(lmt, f"{{{UBL_CBC_NS}}}PayableAmount", _euro(total), currencyID=currency)

    # Invoice lines
    for idx, line in enumerate(invoice["lines"], start=1):
        line_elem = ET.SubElement(root, f"{{{UBL_CAC_NS}}}InvoiceLine")
        _SubElement(line_elem, f"{{{UBL_CBC_NS}}}ID", str(idx))
        _SubElement(
            line_elem,
            f"{{{UBL_CBC_NS}}}InvoicedQuantity",
            _qty(float(line["quantity"])),
            unitCode=_unit_code(str(line.get("unit", "piece"))),
        )
        _SubElement(
            line_elem,
            f"{{{UBL_CBC_NS}}}LineExtensionAmount",
            _euro(int(line["line_net_cents"])),
            currencyID=currency,
        )
        item = ET.SubElement(line_elem, f"{{{UBL_CAC_NS}}}Item")
        _SubElement(item, f"{{{UBL_CBC_NS}}}Name", str(line["description"]))
        cat = ET.SubElement(item, f"{{{UBL_CAC_NS}}}ClassifiedTaxCategory")
        _SubElement(cat, f"{{{UBL_CBC_NS}}}ID", _vat_category(int(line["vat_rate_bp"])))
        _SubElement(cat, f"{{{UBL_CBC_NS}}}Percent", _percent(int(line["vat_rate_bp"])))
        scheme = ET.SubElement(cat, f"{{{UBL_CAC_NS}}}TaxScheme")
        _SubElement(scheme, f"{{{UBL_CBC_NS}}}ID", "VAT")

        price = ET.SubElement(line_elem, f"{{{UBL_CAC_NS}}}Price")
        _SubElement(
            price,
            f"{{{UBL_CBC_NS}}}PriceAmount",
            _euro(int(line["unit_price_cents"])),
            currencyID=currency,
        )

    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="utf-8")


# Required top-level elements for a minimal Peppol BIS Billing 3.0 invoice.
_REQUIRED_ELEMENTS = (
    "CustomizationID",
    "ProfileID",
    "ID",
    "IssueDate",
    "InvoiceTypeCode",
    "DocumentCurrencyCode",
    "AccountingSupplierParty",
    "AccountingCustomerParty",
    "TaxTotal",
    "LegalMonetaryTotal",
    "InvoiceLine",
)


def validate_ubl(xml_bytes: bytes) -> list[str]:
    """Stub schematron-style validator returning a list of error messages.

    Checks the document has the required top-level Peppol BIS Billing 3.0
    elements. A real implementation would run the official schematron via
    a library like ``xmlschema``; we keep things dependency-free here.
    """

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        return [f"XML is not well-formed: {exc}"]

    errors: list[str] = []
    if not root.tag.endswith("}Invoice") and root.tag != "Invoice":
        errors.append("Root element must be Invoice")

    ns = {"cbc": UBL_CBC_NS, "cac": UBL_CAC_NS}
    for name in _REQUIRED_ELEMENTS:
        prefix = (
            "cac"
            if name
            in {
                "AccountingSupplierParty",
                "AccountingCustomerParty",
                "TaxTotal",
                "LegalMonetaryTotal",
                "InvoiceLine",
            }
            else "cbc"
        )
        found = root.find(f"{prefix}:{name}", ns)
        if found is None:
            errors.append(f"Missing required element: {name}")

    return errors
