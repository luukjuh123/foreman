"use client";

import { useState } from "react";
import { downloadCSV, printToPDF } from "@/lib/export-utils";
import {
  balanceSheetToCSV,
  balanceSheetToHTML,
  incomeStatementToCSV,
  incomeStatementToHTML,
  cashFlowToCSV,
  cashFlowToHTML,
} from "@/lib/financial-export";
import {
  fetchBalanceSheet,
  fetchIncomeStatement,
  fetchCashFlow,
} from "@/lib/financials";

// ISO date helpers
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstDayOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export default function FinancialsExportPage() {
  // Balans state
  const [balansDate, setBalansDate] = useState<string>(today());
  const [balansLoadingCSV, setBalansLoadingCSV] = useState(false);
  const [balansLoadingPDF, setBalansLoadingPDF] = useState(false);
  const [balansError, setBalansError] = useState<string | null>(null);

  // Winst & Verlies state
  const [wvStart, setWvStart] = useState<string>(firstDayOfYear());
  const [wvEnd, setWvEnd] = useState<string>(today());
  const [wvLoadingCSV, setWvLoadingCSV] = useState(false);
  const [wvLoadingPDF, setWvLoadingPDF] = useState(false);
  const [wvError, setWvError] = useState<string | null>(null);

  // Kasstroom state
  const [ksStart, setKsStart] = useState<string>(firstDayOfYear());
  const [ksEnd, setKsEnd] = useState<string>(today());
  const [ksLoadingCSV, setKsLoadingCSV] = useState(false);
  const [ksLoadingPDF, setKsLoadingPDF] = useState(false);
  const [ksError, setKsError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Balans export handlers
  // ---------------------------------------------------------------------------
  async function handleBalansCSV() {
    setBalansError(null);
    setBalansLoadingCSV(true);
    try {
      const data = await fetchBalanceSheet(balansDate);
      const { headers, rows } = balanceSheetToCSV(data);
      downloadCSV(`balans-${balansDate}.csv`, headers, rows);
    } catch (err) {
      setBalansError(
        err instanceof Error
          ? `Fout bij ophalen balans: ${err.message}`
          : "Onbekende fout bij ophalen balans."
      );
    } finally {
      setBalansLoadingCSV(false);
    }
  }

  async function handleBalansPDF() {
    setBalansError(null);
    setBalansLoadingPDF(true);
    try {
      const data = await fetchBalanceSheet(balansDate);
      const html = balanceSheetToHTML(data);
      printToPDF(`Balans per ${balansDate}`, html);
    } catch (err) {
      setBalansError(
        err instanceof Error
          ? `Fout bij ophalen balans: ${err.message}`
          : "Onbekende fout bij ophalen balans."
      );
    } finally {
      setBalansLoadingPDF(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Winst & Verlies export handlers
  // ---------------------------------------------------------------------------
  async function handleWvCSV() {
    setWvError(null);
    setWvLoadingCSV(true);
    try {
      const data = await fetchIncomeStatement(wvStart, wvEnd);
      const { headers, rows } = incomeStatementToCSV(data);
      downloadCSV(`winst-verlies-${wvStart}-${wvEnd}.csv`, headers, rows);
    } catch (err) {
      setWvError(
        err instanceof Error
          ? `Fout bij ophalen winst & verlies: ${err.message}`
          : "Onbekende fout bij ophalen winst & verlies."
      );
    } finally {
      setWvLoadingCSV(false);
    }
  }

  async function handleWvPDF() {
    setWvError(null);
    setWvLoadingPDF(true);
    try {
      const data = await fetchIncomeStatement(wvStart, wvEnd);
      const html = incomeStatementToHTML(data);
      printToPDF(`Winst & Verlies ${wvStart} t/m ${wvEnd}`, html);
    } catch (err) {
      setWvError(
        err instanceof Error
          ? `Fout bij ophalen winst & verlies: ${err.message}`
          : "Onbekende fout bij ophalen winst & verlies."
      );
    } finally {
      setWvLoadingPDF(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Kasstroom export handlers
  // ---------------------------------------------------------------------------
  async function handleKsCSV() {
    setKsError(null);
    setKsLoadingCSV(true);
    try {
      const data = await fetchCashFlow(ksStart, ksEnd);
      const { headers, rows } = cashFlowToCSV(data);
      downloadCSV(`kasstroom-${ksStart}-${ksEnd}.csv`, headers, rows);
    } catch (err) {
      setKsError(
        err instanceof Error
          ? `Fout bij ophalen kasstroom: ${err.message}`
          : "Onbekende fout bij ophalen kasstroom."
      );
    } finally {
      setKsLoadingCSV(false);
    }
  }

  async function handleKsPDF() {
    setKsError(null);
    setKsLoadingPDF(true);
    try {
      const data = await fetchCashFlow(ksStart, ksEnd);
      const html = cashFlowToHTML(data);
      printToPDF(`Kasstroom ${ksStart} t/m ${ksEnd}`, html);
    } catch (err) {
      setKsError(
        err instanceof Error
          ? `Fout bij ophalen kasstroom: ${err.message}`
          : "Onbekende fout bij ophalen kasstroom."
      );
    } finally {
      setKsLoadingPDF(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Financiële Rapporten Exporteren</h1>

      {/* Balans */}
      <section className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Balans</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="balans-date" className="text-sm font-medium">
              Peildatum
            </label>
            <input
              id="balans-date"
              type="date"
              value={balansDate}
              onChange={(e) => setBalansDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleBalansCSV}
              disabled={balansLoadingCSV || balansLoadingPDF}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {balansLoadingCSV ? "Laden…" : "CSV Downloaden"}
            </button>
            <button
              onClick={handleBalansPDF}
              disabled={balansLoadingCSV || balansLoadingPDF}
              className="px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {balansLoadingPDF ? "Laden…" : "PDF Downloaden"}
            </button>
          </div>
        </div>
        {balansError && (
          <p data-testid="balans-error" className="text-red-600 text-sm">
            {balansError}
          </p>
        )}
      </section>

      {/* Winst & Verlies */}
      <section className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Winst &amp; Verlies</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="wv-start" className="text-sm font-medium">
              Startdatum
            </label>
            <input
              id="wv-start"
              type="date"
              value={wvStart}
              onChange={(e) => setWvStart(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="wv-end" className="text-sm font-medium">
              Einddatum
            </label>
            <input
              id="wv-end"
              type="date"
              value={wvEnd}
              onChange={(e) => setWvEnd(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleWvCSV}
              disabled={wvLoadingCSV || wvLoadingPDF}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {wvLoadingCSV ? "Laden…" : "CSV Downloaden"}
            </button>
            <button
              onClick={handleWvPDF}
              disabled={wvLoadingCSV || wvLoadingPDF}
              className="px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {wvLoadingPDF ? "Laden…" : "PDF Downloaden"}
            </button>
          </div>
        </div>
        {wvError && (
          <p data-testid="wv-error" className="text-red-600 text-sm">
            {wvError}
          </p>
        )}
      </section>

      {/* Kasstroom */}
      <section className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Kasstroom</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="ks-start" className="text-sm font-medium">
              Startdatum
            </label>
            <input
              id="ks-start"
              type="date"
              value={ksStart}
              onChange={(e) => setKsStart(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="ks-end" className="text-sm font-medium">
              Einddatum
            </label>
            <input
              id="ks-end"
              type="date"
              value={ksEnd}
              onChange={(e) => setKsEnd(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleKsCSV}
              disabled={ksLoadingCSV || ksLoadingPDF}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {ksLoadingCSV ? "Laden…" : "CSV Downloaden"}
            </button>
            <button
              onClick={handleKsPDF}
              disabled={ksLoadingCSV || ksLoadingPDF}
              className="px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {ksLoadingPDF ? "Laden…" : "PDF Downloaden"}
            </button>
          </div>
        </div>
        {ksError && (
          <p data-testid="ks-error" className="text-red-600 text-sm">
            {ksError}
          </p>
        )}
      </section>
    </div>
  );
}
