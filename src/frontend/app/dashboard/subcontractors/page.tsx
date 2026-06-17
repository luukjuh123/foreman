"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, AlertTriangle, Star, TrendingDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import type {
  SubcontractorResponse,
  SubcontractorListResponse,
  SubcontractorCreate,
  SubcontractorUpdate,
  CertificationResponse,
  SubcontractorCostSummary,
} from "@/lib/subcontractors";
import { formatRate, certExpiryStatus } from "@/lib/subcontractors";

// ---------------------------------------------------------------------------
// Certification badge — shown on cards
// ---------------------------------------------------------------------------

function CertBadge({ cert }: { cert: CertificationResponse }) {
  const status = certExpiryStatus(cert.expiry_date);

  if (status === "red") {
    return (
      <span
        data-testid="cert-expiry-warning-red"
        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
      >
        <AlertTriangle className="h-3 w-3" />
        {cert.name} verlopen
      </span>
    );
  }

  if (status === "amber") {
    return (
      <span
        data-testid="cert-expiry-warning-amber"
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      >
        <AlertTriangle className="h-3 w-3" />
        {cert.name} verloopt binnenkort
      </span>
    );
  }

  // valid — show green badge
  return (
    <span
      data-testid="cert-badge-valid"
      className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
    >
      {cert.name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Star rating
// ---------------------------------------------------------------------------

function StarRating({ rating }: { rating: number }) {
  return (
    <div data-testid="sub-rating" className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-3.5 w-3.5",
            n <= rating
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted-foreground"
          )}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating}/5</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcontractor card (Gids tab)
// ---------------------------------------------------------------------------

function SubcontractorCard({
  sub,
  onClick,
}: {
  sub: SubcontractorResponse;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{sub.company_name}</CardTitle>
            {sub.kvk_number && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                KVK {sub.kvk_number}
              </p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              sub.active
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            {sub.active ? "Actief" : "Inactief"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Specialties */}
        {sub.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sub.specialties.map((sp) => (
              <span
                key={sp}
                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {sp}
              </span>
            ))}
          </div>
        )}

        {/* Rating */}
        {sub.rating != null && <StarRating rating={sub.rating} />}

        {/* Rates */}
        <div className="flex flex-wrap gap-3 text-sm">
          {sub.hourly_rate_cents != null && (
            <span className="font-medium">
              {formatRate(sub.hourly_rate_cents)}/u
            </span>
          )}
          {sub.fixed_rate_cents != null && (
            <span data-testid="sub-fixed-rate" className="text-muted-foreground">
              Vast: {formatRate(sub.fixed_rate_cents)}
            </span>
          )}
        </div>

        {/* Certifications */}
        {sub.certifications.length > 0 && (
          <div className="flex flex-wrap gap-1">
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
// Add / Edit dialog
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

    const hourly_rate_cents = form.hourly_rate_euros
      ? Math.round(parseFloat(form.hourly_rate_euros) * 100)
      : undefined;
    const fixed_rate_cents = form.fixed_rate_euros
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
            <label
              htmlFor="sub-company-name"
              className="mb-1 block text-sm font-medium"
            >
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
            <label
              htmlFor="sub-kvk"
              className="mb-1 block text-sm font-medium"
            >
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
            <label
              htmlFor="sub-specialties"
              className="mb-1 block text-sm font-medium"
            >
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
              <label
                htmlFor="sub-hourly-rate"
                className="mb-1 block text-sm font-medium"
              >
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
              <label
                htmlFor="sub-fixed-rate"
                className="mb-1 block text-sm font-medium"
              >
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
                <label
                  htmlFor="sub-cert-name"
                  className="mb-1 block text-xs text-muted-foreground"
                >
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
                <label
                  htmlFor="sub-cert-expiry"
                  className="mb-1 block text-xs text-muted-foreground"
                >
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
// Cost summary strip
// ---------------------------------------------------------------------------

interface CostSummaryStripProps {
  subs: SubcontractorResponse[];
  costs: Map<string, SubcontractorCostSummary>;
}

function CostSummaryStrip({ subs, costs }: CostSummaryStripProps) {
  const totalSpend = useMemo(
    () =>
      Array.from(costs.values()).reduce(
        (sum, c) => sum + c.total_cost_cents,
        0
      ),
    [costs]
  );

  // per-project: aggregate across all subcontractors
  const perProject = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const cost of costs.values()) {
      for (const pb of cost.project_breakdown ?? []) {
        const existing = map.get(pb.project_id);
        if (existing) {
          existing.total += pb.cost_cents;
        } else {
          map.set(pb.project_id, {
            name: pb.project_name,
            total: pb.cost_cents,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [costs]);

  if (subs.length === 0) return null;

  return (
    <div
      data-testid="cost-summary-strip"
      className="rounded-lg border bg-card p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Onderaannemer uitgaven — deze periode
        </h2>
      </div>

      <div className="flex flex-wrap gap-6">
        {/* Total */}
        <div>
          <p className="text-xs text-muted-foreground">Totaal</p>
          <p className="text-xl font-bold">{formatRate(totalSpend)}</p>
        </div>

        {/* Per-project breakdown */}
        {perProject.map((p) => (
          <div key={p.name}>
            <p className="text-xs text-muted-foreground">{p.name}</p>
            <p className="text-base font-semibold">{formatRate(p.total)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opdrachten tab panel
// ---------------------------------------------------------------------------

interface OpdrachtenPanelProps {
  subs: SubcontractorResponse[];
  costs: Map<string, SubcontractorCostSummary>;
}

function OpdrachtenPanel({ subs, costs }: OpdrachtenPanelProps) {
  if (subs.length === 0) {
    return (
      <div data-testid="opdrachten-tab-panel">
        <p className="text-sm text-muted-foreground">
          Geen opdrachten gevonden.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="opdrachten-tab-panel" className="space-y-3">
      {subs.map((sub) => {
        const costData = costs.get(sub.id);
        const projects = costData?.project_breakdown ?? [];

        return (
          <Card key={sub.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <CardTitle className="text-sm">{sub.company_name}</CardTitle>
                {sub.hourly_rate_cents != null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatRate(sub.hourly_rate_cents)}/u overeengekomen
                  </span>
                )}
              </div>
            </CardHeader>

            {projects.length > 0 && (
              <CardContent className="pt-0">
                <ul className="divide-y divide-border text-sm">
                  {projects.map((pb) => (
                    <li
                      key={pb.project_id}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-muted-foreground">{pb.project_name}</span>
                      <span className="font-medium">
                        {formatRate(pb.cost_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
                {costData && (
                  <p className="mt-2 text-right text-xs font-semibold text-foreground">
                    Totaal: {formatRate(costData.total_cost_cents)}
                  </p>
                )}
              </CardContent>
            )}

            {projects.length === 0 && (
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  Geen projectkoppelingen beschikbaar.
                </p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "gids" | "opdrachten";

const PER_PAGE = 20;

export default function ContractingHubPage() {
  const [subs, setSubs] = useState<SubcontractorResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("gids");

  const [costs, setCosts] = useState<Map<string, SubcontractorCostSummary>>(
    new Map()
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubcontractorResponse | null>(null);

  function fetchSubs(p: number) {
    setLoading(true);
    setError(null);
    apiFetch<SubcontractorListResponse>(
      `/subcontractors/?page=${p}&per_page=${PER_PAGE}`
    )
      .then(async (res) => {
        setSubs(res.data);
        setTotal(res.total);

        // load costs in background for each subcontractor
        const entries = await Promise.all(
          res.data.map(async (sub) => {
            try {
              const c = await apiFetch<SubcontractorCostSummary>(
                `/subcontractors/${sub.id}/costs`
              );
              return [sub.id, c] as [string, SubcontractorCostSummary];
            } catch {
              return null;
            }
          })
        );
        const newMap = new Map<string, SubcontractorCostSummary>();
        for (const e of entries) {
          if (e) newMap.set(e[0], e[1]);
        }
        setCosts(newMap);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchSubs(page);
  }, [page]);

  // Collect all unique specialties for filter
  const allSpecialties = useMemo(() => {
    const s = new Set<string>();
    for (const sub of subs) {
      for (const sp of sub.specialties) s.add(sp);
    }
    return Array.from(s).sort();
  }, [subs]);

  const filtered = useMemo(() => {
    let result = subs;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.company_name.toLowerCase().includes(q) ||
          s.specialties.some((sp) => sp.toLowerCase().includes(q))
      );
    }
    if (specialtyFilter) {
      result = result.filter((s) => s.specialties.includes(specialtyFilter));
    }
    return result;
  }, [subs, search, specialtyFilter]);

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

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onderaannemers"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administratie" },
          { label: "Onderaannemers" },
        ]}
        action={
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Toevoegen
          </Button>
        }
      />

      {/* Cost summary strip — loads alongside directory */}
      <CostSummaryStrip subs={subs} costs={costs} />

      {/* Tab bar */}
      <div
        role="tablist"
        className="flex gap-1 border-b"
      >
        {(["gids", "opdrachten"] as Tab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors",
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "gids" ? "Gids" : "Opdrachten"}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Gids tab                                                            */}
      {/* ------------------------------------------------------------------ */}

      {activeTab === "gids" && (
        <div className="space-y-4">
          {/* Search + specialty filter */}
          <div className="flex flex-wrap gap-3">
            <Input
              className="max-w-xs"
              placeholder="Zoek op naam of specialiteit…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              data-testid="specialty-filter"
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Alle specialiteiten</option>
              {allSpecialties.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          {loading ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen onderaannemers gevonden.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <SubcontractorCard key={s.id} sub={s} onClick={() => openEdit(s)} />
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
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Opdrachten tab                                                       */}
      {/* ------------------------------------------------------------------ */}

      {activeTab === "opdrachten" && (
        <OpdrachtenPanel subs={subs} costs={costs} />
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
