"""Dutch RGS-light seed data — chart of accounts (rekeningschema MKB)."""

from typing import NamedTuple


class SeedAccount(NamedTuple):
    code: str
    name: str
    account_type: str
    normal_balance: str
    cashflow_category: str | None
    parent_code: str | None


DUTCH_RGS_LIGHT: list[SeedAccount] = [
    SeedAccount("0500", "Eigen vermogen", "equity", "credit", "financing", None),
    SeedAccount("0510", "Gestort kapitaal", "equity", "credit", "financing", "0500"),
    SeedAccount("0520", "Onverdeelde winst", "equity", "credit", "financing", "0500"),
    SeedAccount("0100", "Materiële vaste activa", "asset", "debit", "investing", None),
    SeedAccount("0110", "Bedrijfsgebouwen", "asset", "debit", "investing", "0100"),
    SeedAccount("0120", "Machines en installaties", "asset", "debit", "investing", "0100"),
    SeedAccount("0130", "Inventaris", "asset", "debit", "investing", "0100"),
    SeedAccount("0150", "Vervoermiddelen", "asset", "debit", "investing", "0100"),
    SeedAccount("1000", "Liquide middelen", "asset", "debit", "cash", None),
    SeedAccount("1010", "Kas", "asset", "debit", "cash", "1000"),
    SeedAccount("1020", "Bank zakelijk", "asset", "debit", "cash", "1000"),
    SeedAccount("1300", "Debiteuren", "asset", "debit", "operating", None),
    SeedAccount("1400", "Crediteuren", "liability", "credit", "operating", None),
    SeedAccount("1500", "Te betalen lonen", "liability", "credit", "operating", None),
    SeedAccount("1600", "BTW", "liability", "credit", "operating", None),
    SeedAccount("1610", "Te betalen BTW", "liability", "credit", "operating", "1600"),
    SeedAccount("1620", "Te vorderen BTW", "asset", "debit", "operating", "1600"),
    SeedAccount("1700", "Langlopende schulden", "liability", "credit", "financing", None),
    SeedAccount("1710", "Hypotheek", "liability", "credit", "financing", "1700"),
    SeedAccount("1720", "Banklening", "liability", "credit", "financing", "1700"),
    SeedAccount("4000", "Bedrijfskosten", "expense", "debit", "operating", None),
    SeedAccount("4100", "Loonkosten", "expense", "debit", "operating", "4000"),
    SeedAccount("4200", "Huisvestingskosten", "expense", "debit", "operating", "4000"),
    SeedAccount("4300", "Afschrijvingen", "expense", "debit", "operating", "4000"),
    SeedAccount("4400", "Vervoerskosten", "expense", "debit", "operating", "4000"),
    SeedAccount("4500", "Verkoopkosten", "expense", "debit", "operating", "4000"),
    SeedAccount("4600", "Kantoorkosten", "expense", "debit", "operating", "4000"),
    SeedAccount("4700", "Algemene kosten", "expense", "debit", "operating", "4000"),
    SeedAccount("7000", "Inkoopwaarde van de omzet", "expense", "debit", "operating", None),
    SeedAccount("8000", "Netto omzet", "revenue", "credit", "operating", None),
    SeedAccount("8100", "Omzet diensten", "revenue", "credit", "operating", "8000"),
    SeedAccount("8200", "Omzet materialen", "revenue", "credit", "operating", "8000"),
]
