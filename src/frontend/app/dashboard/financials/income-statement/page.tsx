"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchIncomeStatement, formatCents } from "@/lib/financials";
import type { AccountNode, IncomeStatementResponse } from "@/lib/financials";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function currentYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

// ---------------------------------------------------------------------------
// AccountRow — recursive account tree row
// ---------------------------------------------------------------------------

interface AccountRowProps {
  account: AccountNode;
  depth?: number;
}

function AccountRow({ account, depth = 0 }: AccountRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = account.children.length > 0;

  return (
    <>
      <tr className="border-b last:border-0">
        <td
          className="py-2 pr-4 text-sm"
          style={{ paddingLeft: `${(depth + 1) * 1}rem` }}
        >
          <span className="text-gray-500 mr-2">{account.code}</span>
          {hasChildren ? (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="font-medium hover:underline focus:outline-none"
            >
              {expanded ? "▾" : "▸"} {account.name}
            </button>
          ) : (
            <span className="font-medium">{account.name}</span>
          )}
        </td>
        <td className="py-2 text-right text-sm tabular-nums">
          {formatCents(account.balance_cents)}
        </td>
      </tr>
      {hasChildren && expanded &&
        account.children.map((child) => (
          <AccountRow key={child.account_id} account={child} depth={depth + 1} />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// AccountSection — revenue or expenses
// ---------------------------------------------------------------------------

interface AccountSectionProps {
  title: string;
  accounts: AccountNode[];
  total_cents: number;
  totalLabel: string;
}

function AccountSection({ title, accounts, total_cents, totalLabel }: AccountSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full">
          <tbody>
            {accounts.map((acc) => (
              <AccountRow key={acc.account_id} account={acc} />
            ))}
            <tr className="border-t bg-gray-50">
              <td className="py-2 pl-4 text-sm font-semibold">{totalLabel}</td>
              <td className="py-2 pr-4 text-right text-sm font-semibold tabular-nums">
                {formatCents(total_cents)}
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IncomeStatementPage() {
  const [startDate, setStartDate] = useState<string>(currentYearStart());
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [data, setData] = useState<IncomeStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (start: string, end: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchIncomeStatement(start, end);
        setData(result);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Onbekende fout");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load(startDate, endDate);
  }, [startDate, endDate, load]);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Winst- en Verliesrekening</h1>
        <p className="text-gray-500 text-sm mt-1">
          Overzicht van opbrengsten en kosten per periode
        </p>
      </div>

      {/* Period selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Startdatum
              </label>
              <input
                type="text"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="JJJJ-MM-DD"
                className="border rounded px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Einddatum
              </label>
              <input
                type="text"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="JJJJ-MM-DD"
                className="border rounded px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <p className="text-gray-500 text-sm">Laden...</p>
      )}

      {/* Error */}
      {!loading && error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Data */}
      {!loading && data && (
        <>
          {/* Revenue */}
          <AccountSection
            title="Opbrengsten"
            accounts={data.revenue.accounts}
            total_cents={data.revenue.total_cents}
            totalLabel="Totaal opbrengsten"
          />

          {/* Expenses */}
          <AccountSection
            title="Kosten"
            accounts={data.expenses.accounts}
            total_cents={data.expenses.total_cents}
            totalLabel="Totaal kosten"
          />

          {/* Net result */}
          <Card className={cn(
            "border-2",
            data.is_profit ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          )}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Netto Resultaat</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {data.start_date} t/m {data.end_date}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      data.is_profit ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {formatCents(data.net_income_cents)}
                  </p>
                  <p
                    className={cn(
                      "text-xs font-medium mt-0.5",
                      data.is_profit ? "text-green-700" : "text-red-700"
                    )}
                  >
                    {data.is_profit ? "Winst" : "Verlies"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
