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
    return "Z" if bp == 0 else ("AA" if bp < 2100 else "S")


def _unit_code(unit: str) -> str:
    return _UNIT_CODE_MAP.get(unit, "C62")


def _SubElement(parent: ET.Element, tag: str, text: str | None = None, **attrib: str) -> ET.Element:
    elem = ET.SubElement(parent, tag, attrib=attrib)
    if text is not None:
        elem.text = text
    return elem


def _add_party(parent: ET.Element, party: Mapping[str, Any], *, ns_prefix_cac: str) -> None:
    cac, cbc = f"{{{UBL_CAC_NS}}}", f"{{{UBL_CBC_NS}}}"
    party_elem = ET.SubElement(parent, f"{cac}Party")
    _SubElement(ET.SubElement(party_elem, f"{cac}PartyName"), f"{cbc}Name", party.get("name", ""))

    addr = ET.SubElement(party_elem, f"{cac}PostalAddress")
    addr_fields = [("address_line1", "StreetName"), ("city", "CityName"), ("postal_code", "PostalZone")]
    for key, tag in addr_fields:
        if party.get(key):
            _SubElement(addr, f"{cbc}{tag}", party[key])
    _SubElement(ET.SubElement(addr, f"{cac}Country"), f"{cbc}IdentificationCode", party.get("country_code", "NL"))

    if party.get("vat_number"):
        tax_scheme = ET.SubElement(party_elem, f"{cac}PartyTaxScheme")
        _SubElement(tax_scheme, f"{cbc}CompanyID", party["vat_number"])
        _SubElement(ET.SubElement(tax_scheme, f"{cac}TaxScheme"), f"{cbc}ID", "VAT")

    legal = ET.SubElement(party_elem, f"{cac}PartyLegalEntity")
    _SubElement(legal, f"{cbc}RegistrationName", party.get("name", ""))
    if party.get("kvk_number"):
        _SubElement(legal, f"{cbc}CompanyID", party["kvk_number"], schemeID="0106")

    if party.get("email"):
        _SubElement(ET.SubElement(party_elem, f"{cac}Contact"), f"{cbc}ElectronicMail", party["email"])


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

    for prefix, ns in [("", UBL_INVOICE_NS), ("cac", UBL_CAC_NS), ("cbc", UBL_CBC_NS)]:
        ET.register_namespace(prefix, ns)

    cac, cbc = f"{{{UBL_CAC_NS}}}", f"{{{UBL_CBC_NS}}}"
    root = ET.Element(f"{{{UBL_INVOICE_NS}}}Invoice")
    issue, due = invoice["issue_date"], invoice["due_date"]
    currency = invoice.get("currency", "EUR")

    for tag, text in [("CustomizationID", CUSTOMIZATION_ID), ("ProfileID", PROFILE_ID),
                      ("ID", str(invoice["invoice_number"])), ("IssueDate", issue.isoformat()),
                      ("DueDate", due.isoformat()), ("InvoiceTypeCode", "380")]:
        _SubElement(root, f"{cbc}{tag}", text)
    if invoice.get("notes"):
        _SubElement(root, f"{cbc}Note", str(invoice["notes"]))
    _SubElement(root, f"{cbc}DocumentCurrencyCode", currency)

    for tag, party in [("AccountingSupplierParty", supplier), ("AccountingCustomerParty", customer)]:
        _add_party(ET.SubElement(root, f"{cac}{tag}"), party, ns_prefix_cac="cac")

    if supplier.get("iban"):
        pm = ET.SubElement(root, f"{cac}PaymentMeans")
        _SubElement(pm, f"{cbc}PaymentMeansCode", "30")
        _SubElement(pm, f"{cbc}PaymentDueDate", due.isoformat())
        _SubElement(ET.SubElement(pm, f"{cac}PayeeFinancialAccount"), f"{cbc}ID", supplier["iban"])

    tax_total = ET.SubElement(root, f"{cac}TaxTotal")
    _SubElement(tax_total, f"{cbc}TaxAmount", _euro(int(invoice["vat_total_cents"])), currencyID=currency)
    for rate_bp, totals in sorted(_group_lines_by_vat(invoice["lines"]).items()):
        sub = ET.SubElement(tax_total, f"{cac}TaxSubtotal")
        _SubElement(sub, f"{cbc}TaxableAmount", _euro(totals["net"]), currencyID=currency)
        _SubElement(sub, f"{cbc}TaxAmount", _euro(totals["vat"]), currencyID=currency)
        cat = ET.SubElement(sub, f"{cac}TaxCategory")
        _SubElement(cat, f"{cbc}ID", _vat_category(rate_bp))
        _SubElement(cat, f"{cbc}Percent", _percent(rate_bp))
        _SubElement(ET.SubElement(cat, f"{cac}TaxScheme"), f"{cbc}ID", "VAT")

    lmt = ET.SubElement(root, f"{cac}LegalMonetaryTotal")
    subtotal, vat_total, total = int(invoice["subtotal_cents"]), int(invoice["vat_total_cents"]), int(invoice["total_cents"])
    for tag, amt in [("LineExtensionAmount", subtotal), ("TaxExclusiveAmount", subtotal),
                     ("TaxInclusiveAmount", subtotal + vat_total), ("PayableAmount", total)]:
        _SubElement(lmt, f"{cbc}{tag}", _euro(amt), currencyID=currency)

    for idx, line in enumerate(invoice["lines"], start=1):
        le = ET.SubElement(root, f"{cac}InvoiceLine")
        _SubElement(le, f"{cbc}ID", str(idx))
        _SubElement(le, f"{cbc}InvoicedQuantity", _qty(float(line["quantity"])),
                    unitCode=_unit_code(str(line.get("unit", "piece"))))
        _SubElement(le, f"{cbc}LineExtensionAmount", _euro(int(line["line_net_cents"])), currencyID=currency)
        item = ET.SubElement(le, f"{cac}Item")
        _SubElement(item, f"{cbc}Name", str(line["description"]))
        cat = ET.SubElement(item, f"{cac}ClassifiedTaxCategory")
        _SubElement(cat, f"{cbc}ID", _vat_category(int(line["vat_rate_bp"])))
        _SubElement(cat, f"{cbc}Percent", _percent(int(line["vat_rate_bp"])))
        _SubElement(ET.SubElement(cat, f"{cac}TaxScheme"), f"{cbc}ID", "VAT")
        _SubElement(ET.SubElement(le, f"{cac}Price"), f"{cbc}PriceAmount",
                    _euro(int(line["unit_price_cents"])), currencyID=currency)

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
    _CAC_ELEMENTS = {"AccountingSupplierParty", "AccountingCustomerParty", "TaxTotal", "LegalMonetaryTotal", "InvoiceLine"}
    errors.extend(
        f"Missing required element: {name}"
        for name in _REQUIRED_ELEMENTS
        if root.find(f"{'cac' if name in _CAC_ELEMENTS else 'cbc'}:{name}", ns) is None
    )
    return errors
