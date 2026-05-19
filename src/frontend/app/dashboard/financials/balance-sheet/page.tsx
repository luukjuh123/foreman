"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react";
import { fetchBalanceSheet, formatCents } from "@/lib/financials";
import type { AccountNode, BalanceSheetResponse } from "@/lib/financials";

// ---------------------------------------------------------------------------
// AccountRow — recursive expandable tree node
// ---------------------------------------------------------------------------

interface AccountRowProps {
  account: AccountNode;
  depth: number;
}

function AccountRow({ account, depth }: AccountRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = account.children && account.children.length > 0;

  return (
    <>
      <div
        className={`flex items-center justify-between py-1.5 ${hasChildren ? "cursor-pointer hover:bg-accent/30 rounded" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px`, paddingRight: "8px" }}
        onClick={() => hasChildren && setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-1 min-w-0">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <span className="text-xs text-muted-foreground font-mono mr-2">{account.code}</span>
          <span className="text-sm truncate">{account.name}</span>
        </div>
        <span className="text-sm font-medium tabular-nums ml-4 shrink-0">
          {formatCents(account.balance_cents)}
        </span>
      </div>

      {expanded &&
        hasChildren &&
        account.children.map((child) => (
          <AccountRow key={child.account_id} account={child} depth={depth + 1} />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// AccountSection — one section (activa / passiva / eigen vermogen)
// ---------------------------------------------------------------------------

interface AccountSectionProps {
  title: string;
  accounts: AccountNode[];
  totalCents: number;
  totalTestId: string;
}

function AccountSection({ title, accounts, totalCents, totalTestId }: AccountSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border/50">
          {accounts.map((account) => (
            <AccountRow key={account.account_id} account={account} depth={0} />
          ))}
        </div>
        <div className="flex items-center justify-between border-t mt-2 pt-2">
          <span className="text-sm font-semibold">Totaal {title}</span>
          <span className="text-sm font-semibold tabular-nums" data-testid={totalTestId}>
            {formatCents(totalCents)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(todayIso());
  const [data, setData] = useState<BalanceSheetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchBalanceSheet(asOf)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [asOf]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Balans</h1>
          <p className="text-muted-foreground mt-1">Balansoverzicht per datum</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="as-of-date" className="text-sm text-muted-foreground">
            Peildatum
          </label>
          <input
            id="as-of-date"
            data-testid="as-of-date-input"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div data-testid="balance-sheet-loading" className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="h-3 w-full animate-pulse rounded bg-muted" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          data-testid="balance-sheet-error"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Balans kon niet worden geladen: {error}
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Balance check indicator */}
          <div
            data-testid="balance-check"
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${
              data.is_balanced
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {data.is_balanced ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Balans klopt — Activa = Passiva + Eigen Vermogen
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 shrink-0" />
                Niet in balans — controleer de boekingen
              </>
            )}
          </div>

          {/* Activa */}
          <AccountSection
            title="Activa"
            accounts={data.assets.accounts}
            totalCents={data.assets.total_cents}
            totalTestId="activa-total"
          />

          {/* Passiva */}
          <AccountSection
            title="Passiva"
            accounts={data.liabilities.accounts}
            totalCents={data.liabilities.total_cents}
            totalTestId="passiva-total"
          />

          {/* Eigen Vermogen */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Eigen Vermogen</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y divide-border/50">
                {data.equity.accounts.map((account) => (
                  <AccountRow key={account.account_id} account={account} depth={0} />
                ))}
                {/* Ingehouden winst */}
                <div className="flex items-center justify-between py-1.5 px-2">
                  <span className="text-sm pl-4">Ingehouden Winst</span>
                  <span className="text-sm tabular-nums ml-4">
                    {formatCents(data.retained_earnings_cents)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t mt-2 pt-2">
                <span className="text-sm font-semibold">Totaal Eigen Vermogen</span>
                <span
                  className="text-sm font-semibold tabular-nums"
                  data-testid="eigen-vermogen-total"
                >
                  {formatCents(data.equity.total_cents + data.retained_earnings_cents)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Grand total */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Totaal Passiva + Eigen Vermogen</span>
                <span className="text-sm font-bold tabular-nums" data-testid="total-passiva-eigen">
                  {formatCents(data.total_liabilities_and_equity_cents)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
