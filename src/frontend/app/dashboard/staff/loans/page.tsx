"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffResponse {
  id: string;
  full_name: string;
  role: string;
  hourly_rate_cents: number;
  active: boolean;
}

interface StaffListResponse {
  data: StaffResponse[];
  total: number;
  page: number;
  per_page: number;
}

interface LoanDeductionResponse {
  id: string;
  loan_id: string;
  amount_cents: number;
  deduction_date: string;
  notes: string | null;
  created_at: string;
}

interface StaffLoanResponse {
  id: string;
  staff_id: string;
  principal_cents: number;
  issued_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deductions: LoanDeductionResponse[];
  deducted_cents: number;
  outstanding_cents: number;
}

interface StaffOutstandingBalance {
  staff_id: string;
  total_principal_cents: number;
  total_deducted_cents: number;
  outstanding_cents: number;
  loans: StaffLoanResponse[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NewLoanFormProps {
  staffId: string;
  staffList: StaffResponse[];
  onSave: () => void;
  onCancel: () => void;
}

function NewLoanForm({ staffId, onSave, onCancel }: NewLoanFormProps) {
  const [amountEuros, setAmountEuros] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const euros = parseFloat(amountEuros.replace(",", "."));
    if (isNaN(euros) || euros <= 0) {
      setError("Voer een geldig bedrag in.");
      return;
    }
    const principal_cents = Math.round(euros * 100);
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/loans/", {
        method: "POST",
        body: JSON.stringify({
          staff_id: staffId,
          principal_cents,
          issued_date: date,
          notes: notes || undefined,
        }),
      });
      onSave();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fout bij opslaan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <h3 className="font-semibold text-sm">Nieuw voorschot</h3>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Bedrag (€)
          </label>
          <Input
            type="text"
            placeholder="500,00"
            value={amountEuros}
            onChange={(e) => setAmountEuros(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Datum</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">
            Opmerkingen (optioneel)
          </label>
          <Input
            type="text"
            placeholder="Reden voor voorschot…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Opslaan…" : "Opslaan"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Annuleren
        </Button>
      </div>
    </form>
  );
}

interface AddDeductionFormProps {
  loanId: string;
  onSave: () => void;
  onCancel: () => void;
}

function AddDeductionForm({ loanId, onSave, onCancel }: AddDeductionFormProps) {
  const [amountEuros, setAmountEuros] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const euros = parseFloat(amountEuros.replace(",", "."));
    if (isNaN(euros) || euros <= 0) {
      setError("Voer een geldig bedrag in.");
      return;
    }
    const amount_cents = Math.round(euros * 100);
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/loans/${loanId}/deductions`, {
        method: "POST",
        body: JSON.stringify({
          amount_cents,
          deduction_date: date,
          notes: notes || undefined,
        }),
      });
      onSave();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fout bij opslaan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 border rounded-lg bg-muted/20 mt-2">
      <h4 className="font-medium text-xs">Inhouding toevoegen</h4>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Bedrag (€)</label>
          <Input
            type="text"
            placeholder="50,00"
            value={amountEuros}
            onChange={(e) => setAmountEuros(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Datum</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">
            Opmerkingen (optioneel)
          </label>
          <Input
            type="text"
            placeholder="Inhouding op loon…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Opslaan…" : "Opslaan"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Annuleren
        </Button>
      </div>
    </form>
  );
}

interface LoanRowProps {
  loan: StaffLoanResponse;
  onDeductionAdded: () => void;
}

function LoanRow({ loan, onDeductionAdded }: LoanRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDeductionForm, setShowDeductionForm] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 p-4 bg-card">
        <div className="min-w-0 flex-1 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground block">Datum</span>
            <span className="font-medium">{formatDate(loan.issued_date)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Verstrekt</span>
            <span className="font-medium">{formatMoney(loan.principal_cents)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Ingehouden</span>
            <span className="font-medium">{formatMoney(loan.deducted_cents)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Openstaand</span>
            <span className="font-semibold text-destructive">
              {formatMoney(loan.outstanding_cents)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowDeductionForm((v) => !v)}
          >
            Inhouding toevoegen
          </Button>
          {loan.deductions.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Verberg inhoudingen" : "Toon inhoudingen"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {loan.notes && (
        <div className="px-4 pb-2 text-sm text-muted-foreground border-t bg-muted/20">
          {loan.notes}
        </div>
      )}

      {showDeductionForm && (
        <div className="px-4 pb-4">
          <AddDeductionForm
            loanId={loan.id}
            onSave={() => {
              setShowDeductionForm(false);
              onDeductionAdded();
            }}
            onCancel={() => setShowDeductionForm(false)}
          />
        </div>
      )}

      {expanded && loan.deductions.length > 0 && (
        <div className="border-t bg-muted/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Datum</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Bedrag</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Opmerkingen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loan.deductions.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2">{formatDate(d.deduction_date)}</td>
                  <td className="px-4 py-2">{formatMoney(d.amount_cents)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{d.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoanTrackingPage() {
  const [staffList, setStaffList] = useState<StaffResponse[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [balance, setBalance] = useState<StaffOutstandingBalance | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewLoanForm, setShowNewLoanForm] = useState(false);

  // Load staff list on mount
  useEffect(() => {
    setLoadingStaff(true);
    apiFetch<StaffListResponse>("/staff/?page=1&per_page=100")
      .then((res) => setStaffList(res.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingStaff(false));
  }, []);

  // Load balance when staff selected
  useEffect(() => {
    if (!selectedStaffId) {
      setBalance(null);
      return;
    }
    setLoadingBalance(true);
    setError(null);
    apiFetch<StaffOutstandingBalance>(`/loans/staff/${selectedStaffId}/balance`)
      .then((res) => setBalance(res))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingBalance(false));
  }, [selectedStaffId]);

  function refreshBalance() {
    if (!selectedStaffId) return;
    setLoadingBalance(true);
    apiFetch<StaffOutstandingBalance>(`/loans/staff/${selectedStaffId}/balance`)
      .then((res) => setBalance(res))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingBalance(false));
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loadingStaff) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Voorschotten</h1>
        <p className="text-sm text-muted-foreground">Laden…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Voorschotten</h1>
        <Button
          size="sm"
          onClick={() => setShowNewLoanForm((v) => !v)}
          disabled={!selectedStaffId}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nieuw voorschot
        </Button>
      </div>

      {/* Staff selector */}
      <div>
        <label htmlFor="staff-select" className="text-sm font-medium text-foreground mb-1.5 block">
          Medewerker
        </label>
        <select
          id="staff-select"
          className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={selectedStaffId}
          onChange={(e) => {
            setSelectedStaffId(e.target.value);
            setShowNewLoanForm(false);
          }}
        >
          <option value="">— Selecteer medewerker —</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* New loan form */}
      {showNewLoanForm && selectedStaffId && (
        <NewLoanForm
          staffId={selectedStaffId}
          staffList={staffList}
          onSave={() => {
            setShowNewLoanForm(false);
            refreshBalance();
          }}
          onCancel={() => setShowNewLoanForm(false)}
        />
      )}

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Balance content (only when staff selected) */}
      {selectedStaffId && !loadingBalance && balance && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Totaal verstrekt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatMoney(balance.total_principal_cents)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Ingehouden
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatMoney(balance.total_deducted_cents)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Openstaand
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">
                  {formatMoney(balance.outstanding_cents)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Loan list */}
          {balance.loans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen voorschotten gevonden.</p>
          ) : (
            <div className="space-y-3">
              {balance.loans.map((loan) => (
                <LoanRow
                  key={loan.id}
                  loan={loan}
                  onDeductionAdded={refreshBalance}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selectedStaffId && loadingBalance && (
        <p className="text-sm text-muted-foreground">Laden…</p>
      )}
    </div>
  );
}
