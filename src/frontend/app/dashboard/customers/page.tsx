"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, X } from "lucide-react";
import type {
  CustomerResponse,
  CustomerCreate,
  CustomerUpdate,
} from "@/lib/customers";
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  formatEuroCents,
} from "@/lib/customers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Add/Edit Dialog
// ---------------------------------------------------------------------------

interface CustomerFormData {
  name: string;
  email: string;
  phone: string;
  kvk_number: string;
  vat_number: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  notes: string;
}

const EMPTY_FORM: CustomerFormData = {
  name: "",
  email: "",
  phone: "",
  kvk_number: "",
  vat_number: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  city: "",
  notes: "",
};

function customerToForm(c: CustomerResponse): CustomerFormData {
  return {
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    kvk_number: c.kvk_number ?? "",
    vat_number: c.vat_number ?? "",
    address_line1: c.address_line1 ?? "",
    address_line2: c.address_line2 ?? "",
    postal_code: c.postal_code ?? "",
    city: c.city ?? "",
    notes: c.notes ?? "",
  };
}

interface CustomerDialogProps {
  editing: CustomerResponse | null;
  onClose: () => void;
  onSaved: (customer: CustomerResponse) => void;
}

function CustomerDialog({ editing, onClose, onSaved }: CustomerDialogProps) {
  const [form, setForm] = useState<CustomerFormData>(
    editing ? customerToForm(editing) : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof CustomerFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: CustomerCreate | CustomerUpdate = {
      name: form.name,
      ...(form.email ? { email: form.email } : {}),
      ...(form.phone ? { phone: form.phone } : {}),
      ...(form.kvk_number ? { kvk_number: form.kvk_number } : {}),
      ...(form.vat_number ? { vat_number: form.vat_number } : {}),
      ...(form.address_line1 ? { address_line1: form.address_line1 } : {}),
      ...(form.address_line2 ? { address_line2: form.address_line2 } : {}),
      ...(form.postal_code ? { postal_code: form.postal_code } : {}),
      ...(form.city ? { city: form.city } : {}),
      ...(form.notes ? { notes: form.notes } : {}),
    };

    try {
      let saved: CustomerResponse;
      if (editing) {
        saved = await updateCustomer(editing.id, payload);
      } else {
        saved = await createCustomer(payload as CustomerCreate);
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
      <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editing ? "Klant bewerken" : "Klant toevoegen"}
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
          {/* Name */}
          <div>
            <label htmlFor="customer-name" className="mb-1 block text-sm font-medium">
              Naam <span className="text-destructive">*</span>
            </label>
            <Input
              id="customer-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              placeholder="Bouwbedrijf Jansen"
            />
          </div>

          {/* Contact row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="customer-email" className="mb-1 block text-sm font-medium">
                E-mail
              </label>
              <Input
                id="customer-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="info@bedrijf.nl"
              />
            </div>
            <div>
              <label htmlFor="customer-phone" className="mb-1 block text-sm font-medium">
                Telefoon
              </label>
              <Input
                id="customer-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="0612345678"
              />
            </div>
          </div>

          {/* KVK / VAT row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="customer-kvk" className="mb-1 block text-sm font-medium">
                KVK-nummer
              </label>
              <Input
                id="customer-kvk"
                value={form.kvk_number}
                onChange={(e) => set("kvk_number", e.target.value)}
                placeholder="12345678"
              />
            </div>
            <div>
              <label htmlFor="customer-vat" className="mb-1 block text-sm font-medium">
                BTW-nummer
              </label>
              <Input
                id="customer-vat"
                value={form.vat_number}
                onChange={(e) => set("vat_number", e.target.value)}
                placeholder="NL123456789B01"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label htmlFor="customer-address1" className="mb-1 block text-sm font-medium">
              Adres
            </label>
            <Input
              id="customer-address1"
              value={form.address_line1}
              onChange={(e) => set("address_line1", e.target.value)}
              placeholder="Dorpsstraat 1"
            />
          </div>
          <div>
            <label htmlFor="customer-address2" className="mb-1 block text-sm font-medium">
              Adres (regel 2)
            </label>
            <Input
              id="customer-address2"
              value={form.address_line2}
              onChange={(e) => set("address_line2", e.target.value)}
              placeholder="Postbus 123"
            />
          </div>

          {/* Postal / City row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="customer-postal" className="mb-1 block text-sm font-medium">
                Postcode
              </label>
              <Input
                id="customer-postal"
                value={form.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
                placeholder="1234 AB"
              />
            </div>
            <div>
              <label htmlFor="customer-city" className="mb-1 block text-sm font-medium">
                Stad
              </label>
              <Input
                id="customer-city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Amsterdam"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="customer-notes" className="mb-1 block text-sm font-medium">
              Notities
            </label>
            <textarea
              id="customer-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder="Bijzonderheden..."
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

export default function KlantenPage() {
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerResponse | null>(null);

  const fetchCustomers = useCallback(
    (p: number, q: string) => {
      setLoading(true);
      setError(null);
      listCustomers(p, PER_PAGE, q || undefined)
        .then((res) => {
          setCustomers(res.data);
          setTotal(res.total);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    fetchCustomers(page, search);
  }, [page, search, fetchCustomers]);

  // Debounce search: only fire after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(c: CustomerResponse) {
    setEditing(c);
    setDialogOpen(true);
  }

  function handleSaved(saved: CustomerResponse) {
    setDialogOpen(false);
    if (editing) {
      setCustomers((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } else {
      fetchCustomers(page, search);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Klanten</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Klant toevoegen
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Zoeken op naam, stad of e-mail…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
          aria-label="Zoeken"
        />
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search ? "Geen klanten gevonden voor deze zoekopdracht." : "Nog geen klanten aangemaakt."}
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Naam</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contactpersoon</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stad</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Openstaand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/dashboard/customers/${c.id}`}
                          className="hover:underline text-foreground"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div>{c.email ?? "—"}</div>
                        {c.phone && (
                          <div className="text-xs">{c.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.city ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEdit(c)}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                          aria-label={`Klant ${c.name} bewerken`}
                        >
                          Bewerken
                        </button>
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
            Pagina {page} van {totalPages} ({total} klanten)
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
        <CustomerDialog
          editing={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
