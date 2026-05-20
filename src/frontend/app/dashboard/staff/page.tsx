"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listStaff, createStaff, updateStaff, deleteStaff, formatRate } from "@/lib/staff";
import type { StaffResponse, StaffCreate, StaffUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Staff form dialog
// ---------------------------------------------------------------------------

interface StaffFormProps {
  initial?: StaffResponse | null;
  onSave: (data: StaffCreate | StaffUpdate) => Promise<void>;
  onClose: () => void;
}

function StaffFormDialog({ initial, onSave, onClose }: StaffFormProps) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [rateEuros, setRateEuros] = useState(
    initial ? String(initial.hourly_rate_cents / 100) : ""
  );
  const [weeklyHours, setWeeklyHours] = useState(
    initial?.weekly_hours_target != null ? String(initial.weekly_hours_target) : ""
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const rateCents = Math.round(parseFloat(rateEuros || "0") * 100);
    await onSave({
      full_name: fullName,
      role,
      hourly_rate_cents: rateCents,
      email: email || undefined,
      phone: phone || undefined,
      weekly_hours_target: weeklyHours ? Number(weeklyHours) : undefined,
      active,
    });
    setSaving(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card className="w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="text-base font-semibold">
            {initial ? "Personeelslid Bewerken" : "Nieuw Personeelslid"}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Sluiten">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="staff-name" className="text-sm font-medium">Naam</label>
              <Input
                id="staff-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={1}
              />
            </div>
            <div>
              <label htmlFor="staff-role" className="text-sm font-medium">Functie</label>
              <Input
                id="staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                minLength={1}
              />
            </div>
            <div>
              <label htmlFor="staff-rate" className="text-sm font-medium">Uurtarief (€)</label>
              <Input
                id="staff-rate"
                type="number"
                step="0.01"
                min="0"
                value={rateEuros}
                onChange={(e) => setRateEuros(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="staff-hours" className="text-sm font-medium">Uren/week</label>
              <Input
                id="staff-hours"
                type="number"
                min="0"
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="staff-email" className="text-sm font-medium">E-mail</label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="staff-phone" className="text-sm font-medium">Telefoon</label>
              <Input
                id="staff-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="staff-active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="staff-active" className="text-sm font-medium">Actief</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  name: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

function DeleteConfirmDialog({ name, onConfirm, onCancel }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <Card className="w-full max-w-sm mx-4">
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-base font-semibold">Personeelslid verwijderen</h2>
        </div>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Weet u het zeker dat u <strong>{name}</strong> wilt verwijderen?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Annuleren
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              disabled={deleting}
              aria-label="Bevestig verwijderen"
            >
              {deleting ? "Verwijderen…" : "Verwijder"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PER_PAGE = 20;

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<StaffResponse | null>(null);
  const [deleting, setDeleting] = useState<StaffResponse | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listStaff(p, PER_PAGE);
      setStaff(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout bij laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  async function handleCreate(data: StaffCreate | StaffUpdate) {
    await createStaff(data as StaffCreate);
    setShowCreate(false);
    await load(page);
  }

  async function handleUpdate(data: StaffCreate | StaffUpdate) {
    if (!editing) return;
    await updateStaff(editing.id, data as StaffUpdate);
    setEditing(null);
    await load(page);
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteStaff(deleting.id);
    setDeleting(null);
    await load(page);
  }

  const totalPages = Math.ceil(total / PER_PAGE);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Personeel</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nieuw
        </Button>
      </div>

      {/* Loading / error / empty */}
      {loading && <p className="text-sm text-muted-foreground">Laden…</p>}
      {!loading && error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && staff.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen personeel gevonden.</p>
      )}

      {/* Table */}
      {!loading && !error && staff.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Naam</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Functie</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Uurloon</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Uren/week</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staff.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{member.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{member.role}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatRate(member.hourly_rate_cents)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {member.weekly_hours_target ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            member.active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          )}
                        >
                          {member.active ? "Actief" : "Inactief"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(member)}
                            aria-label="Bewerk"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleting(member)}
                            aria-label="Verwijder"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
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
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)}>
                Vorige
              </Button>
            )}
            {hasNext && (
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                Volgende
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <StaffFormDialog onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}

      {/* Edit dialog */}
      {editing && (
        <StaffFormDialog initial={editing} onSave={handleUpdate} onClose={() => setEditing(null)} />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <DeleteConfirmDialog
          name={deleting.full_name}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
