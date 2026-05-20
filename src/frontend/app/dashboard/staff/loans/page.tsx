"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Wallet, Plus, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { formatCents } from "@/lib/staff";
import type {
  StaffResponse,
  StaffListResponse,
  StaffOutstandingBalance,
  StaffLoanResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Loan form (issue new loan or record deduction)
// ---------------------------------------------------------------------------

interface LoanFormProps {
  title: string;
  onSave: (amountCents: number, date: string, notes: string) => Promise<void>;
  onClose: () => void;
}

function LoanForm({ title, onSave, onClose }: LoanFormProps) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const cents = Math.round(parseFloat(amount || "0") * 100);
    await onSave(cents, date, notes);
    setSaving(false);
  }

  return (
    <Card className="mt-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Sluiten">
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="loan-amount" className="text-sm font-medium">Bedrag (€)</label>
            <Input
              id="loan-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="loan-date" className="text-sm font-medium">Datum</label>
            <Input
              id="loan-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="loan-notes" className="text-sm font-medium">Opmerkingen</label>
            <Input
              id="loan-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Annuleren
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Opslaan…" : "Opslaan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loan detail per staff member
// ---------------------------------------------------------------------------

function LoanDetail({
  balance,
  staffId,
  onRefresh,
}: {
  balance: StaffOutstandingBalance;
  staffId: string;
  onRefresh: () => void;
}) {
  const [showNewLoan, setShowNewLoan] = useState(false);
  const [deductingLoanId, setDeductingLoanId] = useState<string | null>(null);

  async function handleIssueLoan(amountCents: number, date: string, notes: string) {
    await apiFetch("/loans/", {
      method: "POST",
      body: JSON.stringify({
        staff_id: staffId,
        principal_cents: amountCents,
        issued_date: date,
        notes: notes || undefined,
      }),
    });
    setShowNewLoan(false);
    onRefresh();
  }

  async function handleDeduction(loanId: string, amountCents: number, date: string, notes: string) {
    await apiFetch(`/loans/${loanId}/deductions`, {
      method: "POST",
      body: JSON.stringify({
        amount_cents: amountCents,
        deduction_date: date,
        notes: notes || undefined,
      }),
    });
    setDeductingLoanId(null);
    onRefresh();
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Hoofdsom</p>
            <p className="font-medium">{formatCents(balance.total_principal_cents)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ingehouden</p>
            <p className="font-medium">{formatCents(balance.total_deducted_cents)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Openstaand</p>
            <p className="font-medium text-destructive">{formatCents(balance.outstanding_cents)}</p>
          </div>
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={() => setShowNewLoan(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Nieuw Voorschot
      </Button>

      {showNewLoan && (
        <LoanForm
          title="Nieuw Voorschot"
          onSave={handleIssueLoan}
          onClose={() => setShowNewLoan(false)}
        />
      )}

      {balance.loans.map((loan: StaffLoanResponse) => (
        <Card key={loan.id} className="bg-muted/30">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start justify-between text-sm">
              <div>
                <p className="font-medium">{formatCents(loan.principal_cents)}</p>
                <p className="text-xs text-muted-foreground">{loan.issued_date}</p>
                {loan.notes && <p className="text-xs text-muted-foreground">{loan.notes}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  Ingehouden: {formatCents(loan.deducted_cents)}
                </p>
                <p className="text-xs font-medium">
                  Openstaand: {formatCents(loan.outstanding_cents)}
                </p>
              </div>
            </div>

            {loan.outstanding_cents > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeductingLoanId(loan.id)}
              >
                Inhouding Toevoegen
              </Button>
            )}

            {deductingLoanId === loan.id && (
              <LoanForm
                title="Inhouding Toevoegen"
                onSave={(cents, date, notes) => handleDeduction(loan.id, cents, date, notes)}
                onClose={() => setDeductingLoanId(null)}
              />
            )}

            {loan.deductions.length > 0 && (
              <div className="text-xs space-y-1 pl-2 border-l-2 border-muted">
                {loan.deductions.map((d) => (
                  <p key={d.id} className="text-muted-foreground">
                    {d.deduction_date}: {formatCents(d.amount_cents)}
                    {d.notes && ` — ${d.notes}`}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface StaffWithBalance {
  staff: StaffResponse;
  balance: StaffOutstandingBalance | null;
}

export default function LoansPage() {
  const [items, setItems] = useState<StaffWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const staffRes = await apiFetch<StaffListResponse>("/staff/?page=1&per_page=100");
      const staffList = staffRes.data;

      const balances = await Promise.all(
        staffList.map((s) =>
          apiFetch<StaffOutstandingBalance>(`/loans/staff/${s.id}/balance`).catch(() => null)
        )
      );

      setItems(
        staffList.map((s, i) => ({ staff: s, balance: balances[i] }))
      );
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Voorschotten</h1>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Laden…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen medewerkers gevonden.</p>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map(({ staff, balance }) => {
            const outstanding = balance?.outstanding_cents ?? 0;
            const isExpanded = expandedId === staff.id;

            return (
              <Card key={staff.id}>
                <CardContent className="p-4">
                  <button
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => toggleExpand(staff.id)}
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {staff.full_name}
                      </p>
                      <p className="text-sm text-muted-foreground">{staff.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          outstanding > 0 ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {formatCents(outstanding)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && balance && (
                    <LoanDetail
                      balance={balance}
                      staffId={staff.id}
                      onRefresh={load}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
