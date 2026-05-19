import {
  AccountNode,
  BalanceSheetResponse,
  IncomeStatementResponse,
  CashFlowResponse,
  formatCents,
} from "./financials";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenAccounts(
  accounts: AccountNode[],
  indent = 0
): Array<{ code: string; name: string; balance_cents: number; indent: number }> {
  const result: Array<{ code: string; name: string; balance_cents: number; indent: number }> = [];
  for (const account of accounts) {
    result.push({ code: account.code, name: account.name, balance_cents: account.balance_cents, indent });
    if (account.children.length > 0) {
      result.push(...flattenAccounts(account.children, indent + 1));
    }
  }
  return result;
}

function indentName(name: string, _indent: number): string {
  // No visual indent in CSV — hierarchy is shown by account code structure
  return name;
}

// ---------------------------------------------------------------------------
// Balance sheet
// ---------------------------------------------------------------------------

export function balanceSheetToCSV(data: BalanceSheetResponse): {
  headers: string[];
  rows: string[][];
} {
  const headers = ["Code", "Naam", "Saldo (€)"];
  const rows: string[][] = [];

  const addSection = (label: string, accounts: AccountNode[], total: number) => {
    rows.push(["", label, ""]);
    for (const acc of flattenAccounts(accounts)) {
      rows.push([acc.code, indentName(acc.name, acc.indent), formatCents(acc.balance_cents)]);
    }
    rows.push(["", `Totaal ${label}`, formatCents(total)]);
  };

  addSection("Activa", data.assets.accounts, data.assets.total_cents);
  addSection("Passiva", data.liabilities.accounts, data.liabilities.total_cents);
  addSection("Eigen Vermogen", data.equity.accounts, data.equity.total_cents);
  rows.push(["", "Totaal Passiva + Eigen Vermogen", formatCents(data.total_liabilities_and_equity_cents)]);

  return { headers, rows };
}

export function balanceSheetToHTML(data: BalanceSheetResponse): string {
  const renderAccountRows = (accounts: AccountNode[], indent = 0): string => {
    return accounts
      .map(
        (acc) =>
          `<tr>
            <td>${acc.code}</td>
            <td style="padding-left:${indent * 16}px">${acc.name}</td>
            <td class="amount">${formatCents(acc.balance_cents)}</td>
          </tr>` + renderAccountRows(acc.children, indent + 1)
      )
      .join("");
  };

  const renderSection = (label: string, accounts: AccountNode[], total: number) => `
    <tr class="section-header"><td colspan="3">${label}</td></tr>
    ${renderAccountRows(accounts)}
    <tr class="total-row">
      <td></td>
      <td>Totaal ${label}</td>
      <td class="amount">${formatCents(total)}</td>
    </tr>`;

  return `
    <table>
      <thead><tr><th>Code</th><th>Naam</th><th>Saldo</th></tr></thead>
      <tbody>
        ${renderSection("Activa", data.assets.accounts, data.assets.total_cents)}
        ${renderSection("Passiva", data.liabilities.accounts, data.liabilities.total_cents)}
        ${renderSection("Eigen Vermogen", data.equity.accounts, data.equity.total_cents)}
        <tr class="total-row">
          <td></td>
          <td>Totaal Passiva + Eigen Vermogen</td>
          <td class="amount">${formatCents(data.total_liabilities_and_equity_cents)}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin-top:8px;color:#555;font-size:11px;">
      Peildatum: ${data.as_of} — Balans ${data.is_balanced ? "klopt" : "KLOPT NIET"}
    </p>`;
}

// ---------------------------------------------------------------------------
// Income statement
// ---------------------------------------------------------------------------

export function incomeStatementToCSV(data: IncomeStatementResponse): {
  headers: string[];
  rows: string[][];
} {
  const headers = ["Code", "Naam", "Bedrag (€)"];
  const rows: string[][] = [];

  const addSection = (label: string, accounts: AccountNode[], total: number) => {
    rows.push(["", label, ""]);
    for (const acc of flattenAccounts(accounts)) {
      rows.push([acc.code, indentName(acc.name, acc.indent), formatCents(acc.balance_cents)]);
    }
    rows.push(["", `Totaal ${label}`, formatCents(total)]);
  };

  addSection("Omzet", data.revenue.accounts, data.revenue.total_cents);
  addSection("Kosten", data.expenses.accounts, data.expenses.total_cents);
  rows.push([
    "",
    data.is_profit ? "Nettowinst" : "Nettoverlies",
    formatCents(data.net_income_cents),
  ]);

  return { headers, rows };
}

export function incomeStatementToHTML(data: IncomeStatementResponse): string {
  const renderAccountRows = (accounts: AccountNode[], indent = 0): string => {
    return accounts
      .map(
        (acc) =>
          `<tr>
            <td>${acc.code}</td>
            <td style="padding-left:${indent * 16}px">${acc.name}</td>
            <td class="amount">${formatCents(acc.balance_cents)}</td>
          </tr>` + renderAccountRows(acc.children, indent + 1)
      )
      .join("");
  };

  const renderSection = (label: string, accounts: AccountNode[], total: number) => `
    <tr class="section-header"><td colspan="3">${label}</td></tr>
    ${renderAccountRows(accounts)}
    <tr class="total-row">
      <td></td>
      <td>Totaal ${label}</td>
      <td class="amount">${formatCents(total)}</td>
    </tr>`;

  return `
    <table>
      <thead><tr><th>Code</th><th>Naam</th><th>Bedrag</th></tr></thead>
      <tbody>
        ${renderSection("Omzet", data.revenue.accounts, data.revenue.total_cents)}
        ${renderSection("Kosten", data.expenses.accounts, data.expenses.total_cents)}
        <tr class="total-row">
          <td></td>
          <td>${data.is_profit ? "Nettowinst" : "Nettoverlies"}</td>
          <td class="amount">${formatCents(data.net_income_cents)}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin-top:8px;color:#555;font-size:11px;">
      Periode: ${data.start_date} t/m ${data.end_date}
    </p>`;
}

// ---------------------------------------------------------------------------
// Cash flow
// ---------------------------------------------------------------------------

export function cashFlowToCSV(data: CashFlowResponse): {
  headers: string[];
  rows: string[][];
} {
  const headers = ["Code", "Naam", "Mutatie (€)"];
  const rows: string[][] = [];

  const addActivitySection = (
    label: string,
    lines: CashFlowResponse["operating_activities"]["lines"],
    total: number
  ) => {
    rows.push(["", label, ""]);
    for (const line of lines) {
      rows.push([line.code, line.name, formatCents(line.change_cents)]);
    }
    rows.push(["", `Totaal ${label}`, formatCents(total)]);
  };

  rows.push(["", "Netto Inkomen", formatCents(data.net_income_cents)]);
  addActivitySection("Operationele Activiteiten", data.operating_activities.lines, data.operating_activities.total_cents);
  addActivitySection("Investeringsactiviteiten", data.investing_activities.lines, data.investing_activities.total_cents);
  addActivitySection("Financieringsactiviteiten", data.financing_activities.lines, data.financing_activities.total_cents);
  rows.push(["", "Openingssaldo Kas", formatCents(data.opening_cash_cents)]);
  rows.push(["", "Eindsaldo Kas", formatCents(data.ending_cash_cents)]);

  return { headers, rows };
}

export function cashFlowToHTML(data: CashFlowResponse): string {
  const renderLines = (
    lines: CashFlowResponse["operating_activities"]["lines"]
  ) =>
    lines
      .map(
        (line) =>
          `<tr>
            <td>${line.code}</td>
            <td>${line.name}</td>
            <td class="amount">${formatCents(line.change_cents)}</td>
          </tr>`
      )
      .join("");

  const renderActivity = (
    label: string,
    lines: CashFlowResponse["operating_activities"]["lines"],
    total: number
  ) => `
    <tr class="section-header"><td colspan="3">${label}</td></tr>
    ${renderLines(lines)}
    <tr class="total-row">
      <td></td>
      <td>Totaal ${label}</td>
      <td class="amount">${formatCents(total)}</td>
    </tr>`;

  return `
    <table>
      <thead><tr><th>Code</th><th>Naam</th><th>Mutatie</th></tr></thead>
      <tbody>
        <tr><td></td><td>Netto Inkomen</td><td class="amount">${formatCents(data.net_income_cents)}</td></tr>
        ${renderActivity("Operationele Activiteiten", data.operating_activities.lines, data.operating_activities.total_cents)}
        ${renderActivity("Investeringsactiviteiten", data.investing_activities.lines, data.investing_activities.total_cents)}
        ${renderActivity("Financieringsactiviteiten", data.financing_activities.lines, data.financing_activities.total_cents)}
        <tr class="total-row"><td></td><td>Openingssaldo Kas</td><td class="amount">${formatCents(data.opening_cash_cents)}</td></tr>
        <tr class="total-row"><td></td><td>Eindsaldo Kas</td><td class="amount">${formatCents(data.ending_cash_cents)}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:8px;color:#555;font-size:11px;">
      Periode: ${data.start_date} t/m ${data.end_date} — Aansluiting ${data.reconciles ? "klopt" : "KLOPT NIET"}
    </p>`;
}
