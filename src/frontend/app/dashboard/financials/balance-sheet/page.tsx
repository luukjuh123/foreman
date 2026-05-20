"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchBalanceSheet, formatCents } from "@/lib/financials";
import type { AccountNode, BalanceSheetResponse } from "@/lib/financials";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// AccountRow — recursive account tree row (collapsed by default)
// ---------------------------------------------------------------------------

interface AccountRowProps {
  account: AccountNode;
  depth?: number;
}

function AccountRow({ account, depth = 0 }: AccountRowProps) {
  const [expanded, setExpanded] = useState(false);
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
              <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>{" "}
              <span>{account.name}</span>
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
// AccountSection — assets, liabilities, or equity
// ---------------------------------------------------------------------------

interface AccountSectionProps {
  title: string;
  accounts: AccountNode[];
  total_cents: number;
  totalLabel: string;
  totalTestId?: string;
}

function AccountSection({ title, accounts, total_cents, totalLabel, totalTestId }: AccountSectionProps) {
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
              <td
                className="py-2 pr-4 text-right text-sm font-semibold tabular-nums"
                data-testid={totalTestId}
              >
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

export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState<string>(todayIso());
  const [data, setData] = useState<BalanceSheetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBalanceSheet(date);
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(asOfDate);
  }, [asOfDate, load]);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Balans</h1>
        <p className="text-gray-500 text-sm mt-1">
          Overzicht van activa, passiva en eigen vermogen per datum
        </p>
      </div>

      {/* Date selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Peildatum
              </label>
              <input
                type="text"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                placeholder="JJJJ-MM-DD"
                data-testid="as-of-date-input"
                className="border rounded px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <p data-testid="balance-sheet-loading" className="text-gray-500 text-sm">
          Laden...
        </p>
      )}

      {/* Error */}
      {!loading && error && (
        <Card className="border-red-200 bg-red-50" data-testid="balance-sheet-error">
          <CardContent className="pt-4 pb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Data */}
      {!loading && data && (
        <>
          {/* Balance check indicator */}
          <div
            data-testid="balance-check"
            className={cn(
              "text-sm font-medium px-3 py-1.5 rounded inline-block",
              data.is_balanced
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            )}
          >
            {data.is_balanced ? "balans klopt" : "niet in balans"}
          </div>

          {/* Activa */}
          <AccountSection
            title="Activa"
            accounts={data.assets.accounts}
            total_cents={data.assets.total_cents}
            totalLabel="Totaal activa"
            totalTestId="activa-total"
          />

          {/* Passiva */}
          <AccountSection
            title="Passiva"
            accounts={data.liabilities.accounts}
            total_cents={data.liabilities.total_cents}
            totalLabel="Totaal passiva"
          />

          {/* Eigen Vermogen */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Eigen Vermogen</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <tbody>
                  {data.equity.accounts.map((acc) => (
                    <AccountRow key={acc.account_id} account={acc} />
                  ))}
                  {/* Retained earnings row */}
                  <tr className="border-b last:border-0">
                    <td className="py-2 pr-4 text-sm" style={{ paddingLeft: "1rem" }}>
                      <span className="font-medium">Ingehouden Winst</span>
                    </td>
                    <td className="py-2 text-right text-sm tabular-nums">
                      {formatCents(data.retained_earnings_cents)}
                    </td>
                  </tr>
                  <tr className="border-t bg-gray-50">
                    <td className="py-2 pl-4 text-sm font-semibold">Totaal eigen vermogen</td>
                    <td className="py-2 pr-4 text-right text-sm font-semibold tabular-nums">
                      {formatCents(data.equity.total_cents + data.retained_earnings_cents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
