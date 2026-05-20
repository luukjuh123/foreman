"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import {
  flattenAccountsToCSV,
  formatCents,
} from "@/lib/financials";
import type {
  BalanceSheetResponse,
  IncomeStatementResponse,
  CashFlowResponse,
} from "@/lib/financials";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function currentYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

type ReportType = "balance-sheet" | "income-statement" | "cash-flow";
type ReportData = BalanceSheetResponse | IncomeStatementResponse | CashFlowResponse | null;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExportPage() {
  const [reportType, setReportType] = useState<ReportType>("balance-sheet");
  const [asOf, setAsOf] = useState<string>(todayIso());
  const [startDate, setStartDate] = useState<string>(currentYearStart());
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [data, setData] = useState<ReportData>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (type: ReportType, asOfDate: string, start: string, end: string): Promise<ReportData> => {
      if (type === "balance-sheet") {
        return apiFetch<BalanceSheetResponse>(
          `/financials/reports/balance-sheet?as_of=${asOfDate}`
        );
      } else if (type === "income-statement") {
        return apiFetch<IncomeStatementResponse>(
          `/financials/reports/income-statement?start_date=${start}&end_date=${end}`
        );
      } else {
        return apiFetch<CashFlowResponse>(
          `/financials/reports/cash-flow?start_date=${start}&end_date=${end}`
        );
      }
    },
    []
  );

  const load = useCallback(
    async (type: ReportType, asOfDate: string, start: string, end: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchData(type, asOfDate, start, end);
        setData(result);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Onbekende fout");
      } finally {
        setLoading(false);
      }
    },
    [fetchData]
  );

  useEffect(() => {
    load(reportType, asOf, startDate, endDate);
  }, [reportType, asOf, startDate, endDate, load]);

  const handleReportTypeChange = (value: string) => {
    setReportType(value as ReportType);
    setData(null);
  };

  const handleCSVExport = async () => {
    setError(null);
    let freshData: ReportData;
    try {
      freshData = await fetchData(reportType, asOf, startDate, endDate);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Exportfout opgetreden");
      return;
    }

    let rows: string[][] = [];
    const header = ["Code", "Naam", "Sectie", "Bedrag"];

    if (reportType === "balance-sheet") {
      const bs = freshData as BalanceSheetResponse;
      rows = [
        ...flattenAccountsToCSV(bs.assets.accounts, "Activa"),
        ...flattenAccountsToCSV(bs.liabilities.accounts, "Passiva"),
        ...flattenAccountsToCSV(bs.equity.accounts, "Eigen vermogen"),
      ];
    } else if (reportType === "income-statement") {
      const is = freshData as IncomeStatementResponse;
      rows = [
        ...flattenAccountsToCSV(is.revenue.accounts, "Opbrengsten"),
        ...flattenAccountsToCSV(is.expenses.accounts, "Kosten"),
      ];
    } else {
      const cf = freshData as CashFlowResponse;
      const cfRows: string[][] = [];
      for (const line of cf.operating_activities.lines) {
        cfRows.push([line.code, line.name, "Operationele activiteiten", formatCents(line.change_cents)]);
      }
      for (const line of cf.investing_activities.lines) {
        cfRows.push([line.code, line.name, "Investeringsactiviteiten", formatCents(line.change_cents)]);
      }
      for (const line of cf.financing_activities.lines) {
        cfRows.push([line.code, line.name, "Financieringsactiviteiten", formatCents(line.change_cents)]);
      }
      rows = cfRows;
    }

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePDFExport = () => {
    let url: string;
    if (reportType === "balance-sheet") {
      url = `/api/financials/reports/balance-sheet/pdf?as_of=${asOf}`;
    } else if (reportType === "income-statement") {
      url = `/api/financials/reports/income-statement/pdf?start_date=${startDate}&end_date=${endDate}`;
    } else {
      url = `/api/financials/reports/cash-flow/pdf?start_date=${startDate}&end_date=${endDate}`;
    }
    window.open(url, "_blank");
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Rapporten Exporteren</h1>
        <p className="text-gray-500 text-sm mt-1">
          Exporteer financiële rapporten in verschillende formaten
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Exportopties</CardTitle>
        </CardHeader>
        <CardContent className="pt-2 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Report type selector */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Rapporttype
              </label>
              <select
                value={reportType}
                onChange={(e) => handleReportTypeChange(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="balance-sheet">Balans</option>
                <option value="income-statement">Winst- en verliesrekening</option>
                <option value="cash-flow">Kasstroom</option>
              </select>
            </div>

            {/* Date inputs */}
            {reportType === "balance-sheet" ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Peildatum
                </label>
                <input
                  type="date"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Startdatum
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border rounded px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Einddatum
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {/* Export buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCSVExport}
                className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Exporteer CSV
              </button>
              <button
                onClick={handlePDFExport}
                className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Exporteer PDF
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <p className="text-gray-500 text-sm">Laden...</p>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Preview summary */}
      {!loading && data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Voorbeeldweergave</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 pb-4">
            {reportType === "balance-sheet" && (() => {
              const bs = data as BalanceSheetResponse;
              return (
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Peildatum: {bs.as_of}</p>
                  <p>Totaal activa: {formatCents(bs.assets.total_cents)}</p>
                  <p>Balans sluit: {bs.is_balanced ? "Ja" : "Nee"}</p>
                </div>
              );
            })()}
            {reportType === "income-statement" && (() => {
              const is = data as IncomeStatementResponse;
              return (
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Periode: {is.start_date} t/m {is.end_date}</p>
                  <p>Netto resultaat: {formatCents(is.net_income_cents)}</p>
                  <p>{is.is_profit ? "Winst" : "Verlies"}</p>
                </div>
              );
            })()}
            {reportType === "cash-flow" && (() => {
              const cf = data as CashFlowResponse;
              return (
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Periode: {cf.start_date} t/m {cf.end_date}</p>
                  <p>Netto kasmutatie: {formatCents(cf.net_change_in_cash_cents)}</p>
                  <p>Eindsaldo: {formatCents(cf.ending_cash_cents)}</p>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
