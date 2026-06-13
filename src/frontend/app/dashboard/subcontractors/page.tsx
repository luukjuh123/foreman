"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Plus, X, AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type {
  SubcontractorResponse,
  SubcontractorListResponse,
  SubcontractorCreate,
  SubcontractorUpdate,
  CertificationResponse,
} from "@/lib/subcontractors";
import { formatRate, certExpiryStatus } from "@/lib/subcontractors";

// ---------------------------------------------------------------------------
// Certification expiry badge
// ---------------------------------------------------------------------------

function CertBadge({ cert }: { cert: CertificationResponse }) {
  const status = certExpiryStatus(cert.expiry_date);
  if (!status) return null;

  if (status === "red") {
    return (
      <span
        data-testid="cert-expiry-warning-red"
        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
      >
        <AlertTriangle className="h-3 w-3" />
        {cert.name} verlopen
      </span>
    );
  }

  return (
    <span
      data-testid="cert-expiry-warning-amber"
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
    >
      <AlertTriangle className="h-3 w-3" />
      {cert.name} verloopt binnenkort
    </span>
  );
}

// ---------------------------------------------------------------------------
// Subcontractor card
// ---------------------------------------------------------------------------

function SubcontractorCard({
  sub,
  onEdit,
}: {
  sub: SubcontractorResponse;
  onEdit: (s: SubcontractorResponse) => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30"
      onClick={() => onEdit(sub)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{sub.company_name}</CardTitle>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              sub.active
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            )}
          >
            {sub.active ? "Actief" : "Inactief"}
          </span>
        </div>

        {/* Specialties */}
        {sub.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {sub.specialties.map((sp) => (
              <span
                key={sp}
                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 font-medium"
              >
                {sp}
              </span>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {/* KVK */}
        {sub.kvk_number && (
          <p className="text-xs">KVK: {sub.kvk_number}</p>
        )}

        {/* Hourly rate */}
        {sub.hourly_rate_cents != null && (
          <p className="font-medium text-foreground text-sm">
            {formatRate(sub.hourly_rate_cents)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">/uur</span>
          </p>
        )}

        {/* Certification expiry warnings */}
        {sub.certifications.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {sub.certifications.map((cert, i) => (
              <CertBadge key={i} cert={cert} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skeleton grid
// ---------------------------------------------------------------------------

function SubcontractorSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="flex gap-1 mt-1">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add/Edit Dialog
// ---------------------------------------------------------------------------

interface SubFormData {
  company_name: string;
  kvk_number: string;
  specialties: string;
  hourly_rate_euros: string;
  fixed_rate_euros: string;
  active: boolean;
  cert_name: string;
  cert_expiry: string;
}

const EMPTY_FORM: SubFormData = {
  company_name: "",
  kvk_number: "",
  specialties: "",
  hourly_rate_euros: "",
  fixed_rate_euros: "",
  active: true,
  cert_name: "",
  cert_expiry: "",
};

function subToForm(s: SubcontractorResponse): SubFormData {
  const firstCert = s.certifications[0] ?? null;
  return {
    company_name: s.company_name,
    kvk_number: s.kvk_number ?? "",
    specialties: s.specialties.join(", "),
    hourly_rate_euros:
      s.hourly_rate_cents != null ? (s.hourly_rate_cents / 100).toFixed(2) : "",
    fixed_rate_euros:
      s.fixed_rate_cents != null ? (s.fixed_rate_cents / 100).toFixed(2) : "",
    active: s.active,
    cert_name: firstCert?.name ?? "",
    cert_expiry: firstCert?.expiry_date ?? "",
  };
}

interface SubDialogProps {
  editing: SubcontractorResponse | null;
  onClose: () => void;
  onSaved: (sub: SubcontractorResponse) => void;
}

function SubcontractorDialog({ editing, onClose, onSaved }: SubDialogProps) {
  const [form, setForm] = useState<SubFormData>(
    editing ? subToForm(editing) : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof SubFormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const specialties = form.specialties
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const hourly_rate_cents =
      form.hourly_rate_euros
        ? Math.round(parseFloat(form.hourly_rate_euros) * 100)
        : undefined;
    const fixed_rate_cents =
      form.fixed_rate_euros
        ? Math.round(parseFloat(form.fixed_rate_euros) * 100)
        : undefined;

    const certifications: CertificationResponse[] = [];
    if (form.cert_name) {
      certifications.push({
        name: form.cert_name,
        expiry_date: form.cert_expiry || null,
      });
    }

    const payload: SubcontractorCreate | SubcontractorUpdate = {
      company_name: form.company_name,
      ...(form.kvk_number ? { kvk_number: form.kvk_number } : {}),
      specialties,
      ...(hourly_rate_cents != null ? { hourly_rate_cents } : {}),
      ...(fixed_rate_cents != null ? { fixed_rate_cents } : {}),
      certifications,
      active: form.active,
    };

    try {
      let saved: SubcontractorResponse;
      if (editing) {
        saved = await apiFetch<SubcontractorResponse>(
          `/subcontractors/${editing.id}`,
          { method: "PUT", body: JSON.stringify(payload) }
        );
      } else {
        saved = await apiFetch<SubcontractorResponse>("/subcontractors/", {
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
      <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editing ? "Onderaannemer bewerken" : "Onderaannemer toevoegen"}
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
            <label htmlFor="sub-company-name" className="mb-1 block text-sm font-medium">
              Bedrijfsnaam <span className="text-destructive">*</span>
            </label>
            <Input
              id="sub-company-name"
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              required
              placeholder="Loodgieters BV"
            />
          </div>

          <div>
            <label htmlFor="sub-kvk" className="mb-1 block text-sm font-medium">
              KVK-nummer
            </label>
            <Input
              id="sub-kvk"
              value={form.kvk_number}
              onChange={(e) => set("kvk_number", e.target.value)}
              placeholder="12345678"
            />
          </div>

          <div>
            <label htmlFor="sub-specialties" className="mb-1 block text-sm font-medium">
              Specialiteiten (kommagescheiden)
            </label>
            <Input
              id="sub-specialties"
              value={form.specialties}
              onChange={(e) => set("specialties", e.target.value)}
              placeholder="loodgieter, elektricien"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="sub-hourly-rate" className="mb-1 block text-sm font-medium">
                Uurtarief (€)
              </label>
              <Input
                id="sub-hourly-rate"
                type="number"
                step="0.01"
                min="0"
                value={form.hourly_rate_euros}
                onChange={(e) => set("hourly_rate_euros", e.target.value)}
                placeholder="75.00"
              />
            </div>
            <div>
              <label htmlFor="sub-fixed-rate" className="mb-1 block text-sm font-medium">
                Vast tarief (€)
              </label>
              <Input
                id="sub-fixed-rate"
                type="number"
                step="0.01"
                min="0"
                value={form.fixed_rate_euros}
                onChange={(e) => set("fixed_rate_euros", e.target.value)}
                placeholder="1000.00"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Certificering</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="sub-cert-name" className="mb-1 block text-xs text-muted-foreground">
                  Naam
                </label>
                <Input
                  id="sub-cert-name"
                  value={form.cert_name}
                  onChange={(e) => set("cert_name", e.target.value)}
                  placeholder="VCA"
                />
              </div>
              <div>
                <label htmlFor="sub-cert-expiry" className="mb-1 block text-xs text-muted-foreground">
                  Vervaldatum
                </label>
                <Input
                  id="sub-cert-expiry"
                  type="date"
                  value={form.cert_expiry}
                  onChange={(e) => set("cert_expiry", e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

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

const PER_PAGE = 50;

export default function SubcontractorDirectoryPage() {
  const [subs, setSubs] = useState<SubcontractorResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubcontractorResponse | null>(null);

  function fetchSubs(p: number) {
    setLoading(true);
    setError(null);
    apiFetch<SubcontractorListResponse>(
      `/subcontractors/?page=${p}&per_page=${PER_PAGE}`
    )
      .then((res) => {
        setSubs(res.data);
        setTotal(res.total);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchSubs(page);
  }, [page]);

  const filtered = useMemo(() => {
    if (!search.trim()) return subs;
    const q = search.toLowerCase();
    return subs.filter(
      (s) =>
        s.company_name.toLowerCase().includes(q) ||
        s.specialties.some((sp) => sp.toLowerCase().includes(q))
    );
  }, [subs, search]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(s: SubcontractorResponse) {
    setEditing(s);
    setDialogOpen(true);
  }

  function handleSaved(saved: SubcontractorResponse) {
    setDialogOpen(false);
    if (editing) {
      setSubs((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    } else {
      fetchSubs(page);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="Onderaannemers"
        description="Beheer uw onderaannemers en hun specialiteiten"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Toevoegen
          </Button>
        }
      />

      {/* Search */}
      <div className="max-w-sm">
        <Input
          placeholder="Zoek op naam of specialiteit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      {loading ? (
        <SubcontractorSkeletonGrid />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Geen onderaannemers gevonden"
          description={
            search
              ? `Geen resultaten voor "${search}".`
              : "Voeg een onderaannemer toe om te beginnen."
          }
          icon={<Users className="h-6 w-6" />}
        >
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Toevoegen
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <SubcontractorCard key={s.id} sub={s} onEdit={openEdit} />
          ))}
        </div>
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

      {/* Add/Edit dialog */}
      {dialogOpen && (
        <SubcontractorDialog
          editing={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
