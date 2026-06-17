"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/customers";
import type { CustomerResponse, CustomerCreate, CustomerUpdate } from "@/lib/types";
import { Plus, Search, Pencil, Trash2, UserCircle2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Customer form (shared by create + edit dialogs)
// ---------------------------------------------------------------------------

interface CustomerFormData {
  name: string;
  email: string;
  kvk_number: string;
  vat_number: string;
  address_line1: string;
  postal_code: string;
  city: string;
}

const EMPTY_FORM: CustomerFormData = {
  name: "",
  email: "",
  kvk_number: "",
  vat_number: "",
  address_line1: "",
  postal_code: "",
  city: "",
};

function customerToForm(c: CustomerResponse): CustomerFormData {
  return {
    name: c.name,
    email: c.email ?? "",
    kvk_number: c.kvk_number ?? "",
    vat_number: c.vat_number ?? "",
    address_line1: c.address_line1 ?? "",
    postal_code: c.postal_code ?? "",
    city: c.city ?? "",
  };
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (c: CustomerResponse) => void;
}

function CreateDialog({ open, onClose, onCreated }: CreateDialogProps) {
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setForm(EMPTY_FORM);
    setError(null);
  }

  function set(field: keyof CustomerFormData) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: CustomerCreate = {
        name: form.name.trim(),
        ...(form.email && { email: form.email }),
        ...(form.kvk_number && { kvk_number: form.kvk_number }),
        ...(form.vat_number && { vat_number: form.vat_number }),
        ...(form.address_line1 && { address_line1: form.address_line1 }),
        ...(form.postal_code && { postal_code: form.postal_code }),
        ...(form.city && { city: form.city }),
        country_code: "NL",
      };
      const customer = await createCustomer(payload);
      onCreated(customer);
      reset();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Klant aanmaken</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Bedrijfsnaam *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={set("name")}
                placeholder="Bedrijfsnaam"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">E-mailadres</label>
              <input
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="info@bedrijf.nl"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">KvK-nummer</label>
              <input
                type="text"
                value={form.kvk_number}
                onChange={set("kvk_number")}
                placeholder="12345678"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">BTW-nummer</label>
              <input
                type="text"
                value={form.vat_number}
                onChange={set("vat_number")}
                placeholder="NL123456789B01"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Adres</label>
              <input
                type="text"
                value={form.address_line1}
                onChange={set("address_line1")}
                placeholder="Straat en huisnummer"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium">Postcode</label>
                <input
                  type="text"
                  value={form.postal_code}
                  onChange={set("postal_code")}
                  placeholder="1234 AB"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium">Stad</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={set("city")}
                  placeholder="Amsterdam"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              Annuleren
            </Button>
            <Button type="submit" disabled={!form.name.trim() || saving}>
              {saving ? "Aanmaken…" : "Aanmaken"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

interface EditDialogProps {
  open: boolean;
  customer: CustomerResponse | null;
  onClose: () => void;
  onUpdated: (c: CustomerResponse) => void;
}

function EditDialog({ open, customer, onClose, onUpdated }: EditDialogProps) {
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) setForm(customerToForm(customer));
  }, [customer]);

  function set(field: keyof CustomerFormData) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || !form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: CustomerUpdate = {
        name: form.name.trim(),
        email: form.email || undefined,
        kvk_number: form.kvk_number || undefined,
        vat_number: form.vat_number || undefined,
        address_line1: form.address_line1 || undefined,
        postal_code: form.postal_code || undefined,
        city: form.city || undefined,
      };
      const updated = await updateCustomer(customer.id, payload);
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Klant bewerken</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Bedrijfsnaam *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={set("name")}
                placeholder="Bedrijfsnaam"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">E-mailadres</label>
              <input type="email" value={form.email} onChange={set("email")} placeholder="info@bedrijf.nl" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">KvK-nummer</label>
              <input type="text" value={form.kvk_number} onChange={set("kvk_number")} placeholder="12345678" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuleren</Button>
            <Button type="submit" disabled={!form.name.trim() || saving}>
              {saving ? "Opslaan…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean;
  customer: CustomerResponse | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

function DeleteDialog({ open, customer, onClose, onDeleted }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!customer) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomer(customer.id);
      onDeleted(customer.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Klant verwijderen</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Weet u zeker dat u{" "}
          <span className="font-medium text-foreground">{customer?.name}</span>{" "}
          wilt verwijderen?
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Annuleren</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            {deleting ? "Verwijderen…" : "Verwijderen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ isSearch }: { isSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
        <UserCircle2 className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">
        {isSearch ? "Geen klanten gevonden" : "Nog geen klanten"}
      </h3>
      <p className="max-w-xs text-xs text-muted-foreground">
        {isSearch
          ? "Pas uw zoekopdracht aan."
          : "Voeg uw eerste klant toe via de knop rechtsboven."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KlantenPage() {
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<CustomerResponse | null>(null);
  const [deleteCustomer_, setDeleteCustomer] = useState<CustomerResponse | null>(null);

  useEffect(() => {
    listCustomers()
      .then((res) => setCustomers(res.data))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  function handleCreated(c: CustomerResponse) {
    setCustomers((prev) => [c, ...prev]);
  }

  function handleUpdated(c: CustomerResponse) {
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? c : x)));
  }

  function handleDeleted(id: string) {
    setCustomers((prev) => prev.filter((x) => x.id !== id));
  }

  const isSearch = search.trim() !== "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Klanten</h1>
          <p className="text-xs text-muted-foreground">
            {loading ? "Laden…" : `${customers.length} klant${customers.length !== 1 ? "en" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nieuwe klant
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Zoeken op naam, e-mail of stad…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2 rounded-lg border border-border/60">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none first:rounded-t-lg last:rounded-b-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState isSearch={isSearch} />
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>KvK</TableHead>
                <TableHead>Stad</TableHead>
                <TableHead className="w-24 text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {customer.kvk_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[customer.postal_code, customer.city].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditCustomer(customer)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Bewerken"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteCustomer(customer)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        title="Verwijderen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
      <EditDialog
        open={editCustomer !== null}
        customer={editCustomer}
        onClose={() => setEditCustomer(null)}
        onUpdated={handleUpdated}
      />
      <DeleteDialog
        open={deleteCustomer_ !== null}
        customer={deleteCustomer_}
        onClose={() => setDeleteCustomer(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
