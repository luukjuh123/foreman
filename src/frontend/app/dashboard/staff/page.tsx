"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { StaffResponse, StaffListResponse, StaffCreate, StaffUpdate } from "@/lib/staff";
import { formatHourlyRate } from "@/lib/staff";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Add/Edit Dialog
// ---------------------------------------------------------------------------

interface StaffFormData {
  full_name: string;
  role: string;
  hourly_rate_euros: string; // user enters euros, we convert to cents
  email: string;
  phone: string;
  weekly_hours_target: string;
  active: boolean;
}

const EMPTY_FORM: StaffFormData = {
  full_name: "",
  role: "",
  hourly_rate_euros: "",
  email: "",
  phone: "",
  weekly_hours_target: "",
  active: true,
};

function staffToForm(s: StaffResponse): StaffFormData {
  return {
    full_name: s.full_name,
    role: s.role,
    hourly_rate_euros: (s.hourly_rate_cents / 100).toFixed(2),
    email: s.email ?? "",
    phone: s.phone ?? "",
    weekly_hours_target: s.weekly_hours_target != null ? String(s.weekly_hours_target) : "",
    active: s.active,
  };
}

interface StaffDialogProps {
  editing: StaffResponse | null;
  onClose: () => void;
  onSaved: (staff: StaffResponse) => void;
}

function StaffDialog({ editing, onClose, onSaved }: StaffDialogProps) {
  const [form, setForm] = useState<StaffFormData>(
    editing ? staffToForm(editing) : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof StaffFormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const hourly_rate_cents = Math.round(parseFloat(form.hourly_rate_euros) * 100);
    if (isNaN(hourly_rate_cents)) {
      setError("Voer een geldig uurtarief in.");
      setSaving(false);
      return;
    }

    const payload: StaffCreate | StaffUpdate = {
      full_name: form.full_name,
      role: form.role,
      hourly_rate_cents,
      ...(form.email ? { email: form.email } : {}),
      ...(form.phone ? { phone: form.phone } : {}),
      ...(form.weekly_hours_target
        ? { weekly_hours_target: parseInt(form.weekly_hours_target, 10) }
        : {}),
      active: form.active,
    };

    try {
      let saved: StaffResponse;
      if (editing) {
        saved = await apiFetch<StaffResponse>(`/staff/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        saved = await apiFetch<StaffResponse>("/staff/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editing ? "Medewerker bewerken" : "Medewerker toevoegen"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="staff-full-name" className="mb-1 block text-sm font-medium">
              Naam <span className="text-destructive">*</span>
            </label>
            <Input
              id="staff-full-name"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              required
              placeholder="Jan de Vries"
            />
          </div>

          <div>
            <label htmlFor="staff-role" className="mb-1 block text-sm font-medium">
              Functie <span className="text-destructive">*</span>
            </label>
            <Input
              id="staff-role"
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
              required
              placeholder="Timmerman"
            />
          </div>

          <div>
            <label htmlFor="staff-hourly-rate" className="mb-1 block text-sm font-medium">
              Uurtarief (€) <span className="text-destructive">*</span>
            </label>
            <Input
              id="staff-hourly-rate"
              type="number"
              step="0.01"
              min="0"
              value={form.hourly_rate_euros}
              onChange={(e) => set("hourly_rate_euros", e.target.value)}
              required
              placeholder="45.00"
            />
          </div>

          <div>
            <label htmlFor="staff-email" className="mb-1 block text-sm font-medium">
              E-mail
            </label>
            <Input
              id="staff-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jan@bouw.nl"
            />
          </div>

          <div>
            <label htmlFor="staff-phone" className="mb-1 block text-sm font-medium">
              Telefoon
            </label>
            <Input
              id="staff-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="0612345678"
            />
          </div>

          <div>
            <label htmlFor="staff-weekly-hours" className="mb-1 block text-sm font-medium">
              Contracturen per week
            </label>
            <Input
              id="staff-weekly-hours"
              type="number"
              min="0"
              max="80"
              value={form.weekly_hours_target}
              onChange={(e) => set("weekly_hours_target", e.target.value)}
              placeholder="40"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuleren
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Opslaan…" : "Opslaan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StaffDirectoryPage() {
  const [staff, setStaff] = useState<StaffResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffResponse | null>(null);

  function fetchStaff(p: number) {
    setLoading(true);
    setError(null);
    apiFetch<StaffListResponse>(`/staff/?page=${p}&per_page=${PER_PAGE}`)
      .then((res) => {
        setStaff(res.data);
        setTotal(res.total);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchStaff(page);
  }, [page]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(s: StaffResponse) {
    setEditing(s);
    setDialogOpen(true);
  }

  function handleSaved(saved: StaffResponse) {
    setDialogOpen(false);
    if (editing) {
      setStaff((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    } else {
      fetchStaff(page);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Personeel</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Medewerker toevoegen
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen medewerkers gevonden.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Naam
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Functie
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      E-mail
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Telefoon
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Uurtarief
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staff.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => openEdit(s)}
                    >
                      <td className="px-4 py-3 font-medium">{s.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.role}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatHourlyRate(s.hourly_rate_cents)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            s.active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          )}
                        >
                          {s.active ? "Actief" : "Inactief"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page} van {totalPages}
          </p>
          <div className="flex gap-2">
            {hasPrev && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
              >
                Vorige
              </Button>
            )}
            {hasNext && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
              >
                Volgende
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit dialog */}
      {dialogOpen && (
        <StaffDialog
          editing={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
