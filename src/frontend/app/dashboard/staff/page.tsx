"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Users, Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">
            {initial ? "Personeelslid Bewerken" : "Nieuw Personeelslid"}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Sluiten">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
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
              <label htmlFor="staff-role" className="text-sm font-medium">Rol</label>
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
// Main page
// ---------------------------------------------------------------------------

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<StaffResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listStaff(1, 100);
      setStaff(res.data);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(data: StaffCreate | StaffUpdate) {
    await createStaff(data as StaffCreate);
    setShowCreate(false);
    await load();
  }

  async function handleUpdate(data: StaffCreate | StaffUpdate) {
    if (!editing) return;
    await updateStaff(editing.id, data as StaffUpdate);
    setEditing(null);
    await load();
  }

  async function handleDelete(id: string) {
    await deleteStaff(id);
    await load();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Personeel</h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nieuw Personeelslid
        </Button>
      </div>

      {/* Loading */}
      {loading && <p className="text-sm text-muted-foreground">Laden…</p>}

      {/* Empty */}
      {!loading && staff.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen personeel gevonden.</p>
      )}

      {/* Staff list */}
      {!loading && staff.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((member) => (
            <Card key={member.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{member.full_name}</p>
                    <p className="text-sm text-muted-foreground">{member.role}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      member.active
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    )}
                  >
                    {member.active ? "Actief" : "Inactief"}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground">
                  {formatRate(member.hourly_rate_cents)}/uur
                </p>

                {member.email && (
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                )}
                {member.phone && (
                  <p className="text-xs text-muted-foreground">{member.phone}</p>
                )}

                <div className="flex gap-1 pt-1">
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
                    onClick={() => handleDelete(member.id)}
                    aria-label="Verwijder"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
    </div>
  );
}
