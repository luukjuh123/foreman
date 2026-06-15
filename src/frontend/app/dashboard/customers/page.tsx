"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  Users,
  Building2,
  Mail,
  MapPin,
  FolderKanban,
  Receipt,
  ArrowRight,
  Phone,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { CustomerResponse, ProjectResponse, InvoiceResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerWithStats extends CustomerResponse {
  project_count: number;
  total_invoiced_cents: number;
  outstanding_cents: number;
}

interface CustomerListResponse {
  data: CustomerResponse[];
  total: number;
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

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "from-amber-500 to-orange-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function CustomerSummary({ customers }: { customers: CustomerWithStats[] }) {
  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((s, c) => s + c.total_invoiced_cents, 0);
  const totalOutstanding = customers.reduce((s, c) => s + c.outstanding_cents, 0);

  const cards = [
    { label: "Klanten", value: String(totalCustomers), accent: "bg-primary", icon: Users },
    { label: "Totaal gefactureerd", value: formatMoney(totalRevenue), accent: "bg-emerald-500", icon: Receipt },
    { label: "Openstaand", value: formatMoney(totalOutstanding), accent: "bg-amber-500", icon: Receipt },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="relative overflow-hidden">
          <div className={`absolute left-0 top-0 h-full w-1 ${c.accent}`} />
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.accent}/10`}>
              <c.icon className={`h-5 w-5 ${c.accent.replace("bg-", "text-")}`} />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {c.label}
              </p>
              <p className="text-xl font-bold tracking-tight mt-0.5">{c.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer card
// ---------------------------------------------------------------------------

function CustomerCard({ customer }: { customer: CustomerWithStats }) {
  const initials = getInitials(customer.name);
  const color = avatarColor(customer.name);

  return (
    <Card className="hover:shadow-lg hover:border-primary/20 transition-all duration-200 group">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white text-sm font-bold shadow-sm",
              color
            )}
          >
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                {customer.name}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {customer.email && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {customer.email}
                  </span>
                )}
                {(customer as { phone?: string }).phone && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {(customer as { phone?: string }).phone}
                  </span>
                )}
                {customer.kvk_number && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    KvK {customer.kvk_number}
                  </span>
                )}
                {customer.address && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[200px]">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {customer.address}
                  </span>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <FolderKanban className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-xs font-medium">
                  {customer.project_count} <span className="text-muted-foreground font-normal">projecten</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-xs font-medium">
                  {formatMoney(customer.total_invoiced_cents)} <span className="text-muted-foreground font-normal">gefactureerd</span>
                </span>
              </div>
              {customer.outstanding_cents > 0 && (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {formatMoney(customer.outstanding_cents)} openstaand
                </span>
              )}
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-2 mt-3">
              <Link href={`/dashboard/invoices/new?customer_id=${customer.id}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 hover:border-emerald-500/40 hover:bg-emerald-500/5">
                  <Receipt className="h-3 w-3" />
                  Factuur
                </Button>
              </Link>
              <Link href={`/dashboard/projects/new?customer_id=${customer.id}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 hover:border-blue-500/40 hover:bg-blue-500/5">
                  <FolderKanban className="h-3 w-3" />
                  Project
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<CustomerListResponse>("/customers/?per_page=200").catch(() => ({ data: [], total: 0 })),
      apiFetch<{ data: ProjectResponse[] }>("/projects?per_page=200").catch(() => ({ data: [] })),
      apiFetch<{ data: InvoiceResponse[] }>("/invoices?per_page=500").catch(() => ({ data: [] })),
    ]).then(([custRes, projRes, invRes]) => {
      const projects = projRes.data ?? [];
      const invoices = invRes.data ?? [];

      const enriched: CustomerWithStats[] = (custRes.data ?? []).map((c) => {
        const custProjects = projects.filter(
          (p) => (p as { customer_id?: string }).customer_id === c.id
        );
        const custInvoices = invoices.filter((i) => i.customer_id === c.id);
        const total_invoiced_cents = custInvoices.reduce((s, i) => s + i.total_cents, 0);
        const outstanding_cents = custInvoices
          .filter((i) => i.status === "sent" || i.status === "overdue")
          .reduce((s, i) => s + i.total_cents, 0);

        return {
          ...c,
          project_count: custProjects.length,
          total_invoiced_cents,
          outstanding_cents,
        };
      });

      setCustomers(enriched);
      setLoading(false);
    });
  }, []);

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.kvk_number ?? "").toLowerCase().includes(q) ||
      (c.address ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Klanten</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {customers.length} klanten in uw bestand
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shadow-sm shadow-primary/20">
          <Plus className="h-4 w-4" />
          Nieuwe klant
        </Button>
      </div>

      {/* Summary */}
      {!loading && customers.length > 0 && <CustomerSummary customers={customers} />}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op naam, email, KvK..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-56 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <Users className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Geen klanten gevonden</p>
          <p className="text-sm text-muted-foreground">
            {search ? "Pas uw zoekopdracht aan" : "Voeg uw eerste klant toe om te beginnen"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            const grouped: Record<string, CustomerWithStats[]> = {};
            for (const c of [...filtered].sort((a, b) => a.name.localeCompare(b.name, "nl"))) {
              const letter = c.name[0]?.toUpperCase() ?? "#";
              if (!grouped[letter]) grouped[letter] = [];
              grouped[letter].push(c);
            }
            return Object.entries(grouped).map(([letter, group]) => (
              <div key={letter}>
                <div className="sticky top-14 z-10 flex items-center gap-3 py-2 mb-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {letter}
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-[11px] text-muted-foreground">{group.length} klant{group.length !== 1 ? "en" : ""}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {group.map((customer) => (
                    <CustomerCard key={customer.id} customer={customer} />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
