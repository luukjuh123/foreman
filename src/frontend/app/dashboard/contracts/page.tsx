"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileSignature,
  TrendingUp,
  LayoutList,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  FolderKanban,
  ArrowRight,
  Percent,
  LayoutGrid,
  List,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type {
  ProjectResponse,
  ProjectListResponse,
  InvoiceResponse,
  InvoiceListResponse,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface QuoteResponse {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_id?: string | null;
  project_name: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  total_cents: number;
}

interface QuoteListResponse {
  data: QuoteResponse[];
  total: number;
}

type ContractFilter = "alle" | "actief" | "verlopen" | "voltooid";

// A contract row groups one customer's engagement: quote + project + invoices
interface ContractRow {
  key: string; // unique key for React
  customerName: string;
  quote: QuoteResponse | null;
  project: ProjectResponse | null;
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
  // overall health: green = all paid / on-track, amber = outstanding, red = overdue
  health: "green" | "amber" | "red";
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

function isOverdue(inv: InvoiceResponse): boolean {
  if (inv.status === "paid" || inv.status === "draft") return false;
  return new Date(inv.due_date) < new Date();
}

function deriveHealth(
  invoices: InvoiceResponse[]
): "green" | "amber" | "red" {
  const hasOverdue = invoices.some(
    (i) => i.status === "overdue" || (i.status === "sent" && isOverdue(i))
  );
  if (hasOverdue) return "red";
  const hasOutstanding = invoices.some(
    (i) => i.status === "sent" || i.status === "draft"
  );
  if (hasOutstanding) return "amber";
  return "green";
}

// Correlate quotes + projects + invoices into contract rows grouped by customer name.
// Correlation key: customer_name (case-insensitive). customer_id used when available.
function buildContractRows(
  quotes: QuoteResponse[],
  projects: ProjectResponse[],
  invoices: InvoiceResponse[]
): ContractRow[] {
  // Index invoices by customer_id
  const invByCustomerId = new Map<string, InvoiceResponse[]>();
  for (const inv of invoices) {
    if (!inv.customer_id) continue;
    const existing = invByCustomerId.get(inv.customer_id) ?? [];
    existing.push(inv);
    invByCustomerId.set(inv.customer_id, existing);
  }

  // Build a set of unique "engagement keys": (customer_name, quote_id?) tuples
  // One row per (customer_name, project) pair at minimum; quotes may link to a project.
  const rows: ContractRow[] = [];

  // Track which quotes/projects we've already paired
  const pairedQuoteIds = new Set<string>();
  const pairedProjectIds = new Set<string>();

  // First pass: pair quotes with matching projects (by customer_name or project_name)
  for (const q of quotes) {
    const matchingProject = projects.find(
      (p) =>
        !pairedProjectIds.has(p.id) &&
        (
          (p.customer_name &&
            p.customer_name.toLowerCase() === q.customer_name.toLowerCase()) ||
          (q.project_name &&
            p.name.toLowerCase() === q.project_name.toLowerCase())
        )
    );

    // Find invoices for this customer
    const custInvoices = invoices.filter(
      (i) =>
        (i.customer_id && matchingProject?.customer_id
          ? i.customer_id === matchingProject.customer_id
          : false) ||
        // Fallback: no customer_id → match nothing (safe)
        false
    );

    const invoicedCents = custInvoices.reduce((s, i) => s + i.total_cents, 0);
    const paidCents = custInvoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.total_cents, 0);
    const outstandingCents = custInvoices
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((s, i) => s + i.total_cents, 0);

    rows.push({
      key: `q-${q.id}`,
      customerName: q.customer_name,
      quote: q,
      project: matchingProject ?? null,
      invoicedCents,
      paidCents,
      outstandingCents,
      health: deriveHealth(custInvoices),
    });

    pairedQuoteIds.add(q.id);
    if (matchingProject) pairedProjectIds.add(matchingProject.id);
  }

  // Second pass: projects that didn't pair with a quote
  for (const p of projects) {
    if (pairedProjectIds.has(p.id)) continue;

    const customerName = p.customer_name ?? "Onbekende klant";
    const custId = p.customer_id;
    const custInvoices = custId ? (invByCustomerId.get(custId) ?? []) : [];

    const invoicedCents = custInvoices.reduce((s, i) => s + i.total_cents, 0);
    const paidCents = custInvoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.total_cents, 0);
    const outstandingCents = custInvoices
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((s, i) => s + i.total_cents, 0);

    rows.push({
      key: `p-${p.id}`,
      customerName,
      quote: null,
      project: p,
      invoicedCents,
      paidCents,
      outstandingCents,
      health: deriveHealth(custInvoices),
    });

    pairedProjectIds.add(p.id);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Contract filter predicate
// ---------------------------------------------------------------------------

function filterRows(rows: ContractRow[], filter: ContractFilter): ContractRow[] {
  if (filter === "alle") return rows;
  return rows.filter((r) => {
    const projectStatus = r.project?.status;
    const quoteStatus = r.quote?.status;

    if (filter === "actief") {
      return (
        projectStatus === "active" ||
        quoteStatus === "sent" ||
        quoteStatus === "draft"
      );
    }
    if (filter === "verlopen") {
      return r.health === "red" || quoteStatus === "expired";
    }
    if (filter === "voltooid") {
      return (
        projectStatus === "completed" &&
        r.outstandingCents === 0
      );
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Pipeline funnel — horizontal flow visualization
// ---------------------------------------------------------------------------

function PipelineFunnel({ rows, invoices }: { rows: ContractRow[]; invoices: InvoiceResponse[] }) {
  const quotesCents = rows.reduce((s, r) => s + (r.quote?.total_cents ?? 0), 0);
  const projectsCents = rows.filter((r) => r.project).reduce((s, r) => s + (r.project?.budget_cents ?? 0), 0);
  const invoicedCents = invoices.reduce((s, i) => s + i.total_cents, 0);
  const paidCents = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total_cents, 0);

  const stages = [
    { label: "Offertes", value: quotesCents, count: rows.filter((r) => r.quote).length, color: "bg-blue-500", textColor: "text-blue-500", gradientFrom: "from-blue-500", gradientTo: "to-blue-400", icon: FileSignature },
    { label: "Projecten", value: projectsCents, count: rows.filter((r) => r.project).length, color: "bg-primary", textColor: "text-primary", gradientFrom: "from-primary", gradientTo: "to-amber-500", icon: FolderKanban },
    { label: "Gefactureerd", value: invoicedCents, count: invoices.length, color: "bg-amber-500", textColor: "text-amber-500", gradientFrom: "from-amber-500", gradientTo: "to-amber-400", icon: Send },
    { label: "Ontvangen", value: paidCents, count: invoices.filter((i) => i.status === "paid").length, color: "bg-emerald-500", textColor: "text-emerald-500", gradientFrom: "from-emerald-500", gradientTo: "to-emerald-400", icon: CheckCircle2 },
  ];

  const maxValue = Math.max(...stages.map((s) => s.value), 1);
  // Funnel widths taper from 100% to ~40%
  const funnelWidths = [100, 82, 64, 48];

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-5 w-1 rounded-full bg-primary" />
          <h3 className="text-[13px] font-bold">Contractfunnel</h3>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            Totale doorstroom van offerte naar betaling
          </span>
        </div>

        <div className="space-y-2">
          {stages.map((stage, idx) => {
            const funnelWidth = funnelWidths[idx];
            const barWidth = Math.max((stage.value / maxValue) * 100, 8);
            const conversionPct = idx > 0 && stages[idx - 1].value > 0
              ? Math.round((stage.value / stages[idx - 1].value) * 100)
              : null;

            return (
              <div key={stage.label} className="flex items-center gap-4">
                {/* Label column */}
                <div className="flex items-center gap-2.5 w-36 shrink-0">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl shadow-sm", stage.color.replace("bg-", "bg-") + "/10")}>
                    <stage.icon className={cn("h-4 w-4", stage.textColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-foreground/80 leading-tight">{stage.label}</p>
                    <p className="text-[9px] text-muted-foreground/50">{stage.count} items</p>
                  </div>
                </div>

                {/* Funnel bar */}
                <div className="flex-1 min-w-0 flex justify-center">
                  <div className="relative" style={{ width: `${funnelWidth}%` }}>
                    <div className="h-10 w-full rounded-xl bg-muted/15 overflow-hidden relative">
                      <div
                        className={cn(
                          "h-full rounded-xl transition-all duration-700 ease-out relative overflow-hidden bg-gradient-to-r",
                          stage.gradientFrom,
                          stage.gradientTo,
                          "opacity-80"
                        )}
                        style={{ width: `${barWidth}%` }}
                      >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent" style={{ animation: "shimmer 3s ease-in-out infinite" }} />
                      </div>
                      {/* Value overlay */}
                      <div className="absolute inset-0 flex items-center px-4">
                        <span className="text-sm font-extrabold tracking-tight text-foreground drop-shadow-sm">
                          {formatMoney(stage.value)}
                        </span>
                      </div>
                    </div>
                    {/* Conversion badge */}
                    {conversionPct !== null && conversionPct > 0 && (
                      <div className="absolute -top-2.5 right-4 z-10">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[9px] font-bold shadow-sm",
                          conversionPct >= 80 ? "text-emerald-500 border-emerald-500/20" : conversionPct >= 50 ? "text-primary border-primary/20" : "text-amber-500 border-amber-500/20"
                        )}>
                          <ArrowRight className="h-2 w-2" />
                          {conversionPct}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom summary */}
        <div className="flex items-center justify-center gap-6 mt-5 pt-4 border-t border-border/30">
          <div className="text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">Totaal in pipeline</p>
            <p className="text-lg font-black tracking-tight">{formatMoney(quotesCents + projectsCents)}</p>
          </div>
          <div className="h-8 w-px bg-border/40" />
          <div className="text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">Geincasseerd</p>
            <p className="text-lg font-black tracking-tight text-emerald-600 dark:text-emerald-400">{formatMoney(paidCents)}</p>
          </div>
          {quotesCents > 0 && (
            <>
              <div className="h-8 w-px bg-border/40" />
              <div className="text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">Pipeline → Betaald</p>
                <p className="text-lg font-black tracking-tight text-primary">{Math.round((paidCents / quotesCents) * 100)}%</p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// KPI strip
// ---------------------------------------------------------------------------

function KpiStrip({ rows, invoices }: { rows: ContractRow[]; invoices: InvoiceResponse[] }) {
  const totalPipelineCents = rows.reduce(
    (s, r) => s + (r.quote?.total_cents ?? r.project?.budget_cents ?? 0),
    0
  );
  const activeContracts = rows.filter(
    (r) =>
      r.project?.status === "active" ||
      r.quote?.status === "sent" ||
      r.quote?.status === "draft"
  ).length;
  const totalOutstandingCents = rows.reduce((s, r) => s + r.outstandingCents, 0);
  const totalInvoicedCents = invoices.reduce((s, i) => s + i.total_cents, 0);
  const totalPaidCents = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.total_cents, 0);
  const collectionRate =
    totalInvoicedCents > 0
      ? Math.round((totalPaidCents / totalInvoicedCents) * 100)
      : 0;

  const kpis = [
    {
      label: "Totale pipeline waarde",
      value: formatMoney(totalPipelineCents),
      accent: "bg-primary",
      iconBg: "bg-primary/10",
      icon: TrendingUp,
      iconColor: "text-primary",
    },
    {
      label: "Actieve contracten",
      value: String(activeContracts),
      accent: "bg-blue-500",
      iconBg: "bg-blue-500/10",
      icon: LayoutList,
      iconColor: "text-blue-500",
    },
    {
      label: "Openstaande facturen",
      value: formatMoney(totalOutstandingCents),
      accent: totalOutstandingCents > 0 ? "bg-amber-500" : "bg-emerald-500",
      iconBg: totalOutstandingCents > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
      icon: Receipt,
      iconColor: totalOutstandingCents > 0 ? "text-amber-500" : "text-emerald-500",
    },
    {
      label: "Incassopercentage",
      value: `${collectionRate}%`,
      accent: collectionRate >= 80 ? "bg-emerald-500" : collectionRate >= 50 ? "bg-amber-500" : "bg-red-500",
      iconBg: collectionRate >= 80 ? "bg-emerald-500/10" : collectionRate >= 50 ? "bg-amber-500/10" : "bg-red-500/10",
      icon: Percent,
      iconColor: collectionRate >= 80 ? "text-emerald-500" : collectionRate >= 50 ? "text-amber-500" : "text-red-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger-children">
      {kpis.map((k) => (
        <Card
          key={k.label}
          className="relative overflow-hidden border-0 shadow-sm group hover:shadow-md transition-all duration-200"
        >
          <div className={`h-[2px] ${k.accent} opacity-60`} />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
                {k.label}
              </p>
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.iconBg} group-hover:scale-110 transition-transform duration-300`}
              >
                <k.icon className={`h-4 w-4 ${k.iconColor}`} />
              </div>
            </div>
            <p className="text-[26px] font-extrabold tracking-tight leading-none stat-value">
              {k.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const QUOTE_STATUS: Record<
  string,
  { label: string; dot: string; badgeBg: string; text: string }
> = {
  draft: { label: "Concept", dot: "bg-gray-400", badgeBg: "bg-gray-500/10", text: "text-gray-500 dark:text-gray-400" },
  sent: { label: "Verzonden", dot: "bg-blue-500", badgeBg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  accepted: { label: "Geaccepteerd", dot: "bg-emerald-500", badgeBg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Afgewezen", dot: "bg-red-500", badgeBg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
  expired: { label: "Verlopen", dot: "bg-amber-500", badgeBg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
};

const PROJECT_STATUS: Record<
  string,
  { label: string; dot: string; badgeBg: string; text: string }
> = {
  draft: { label: "Concept", dot: "bg-gray-400", badgeBg: "bg-gray-500/10", text: "text-gray-500 dark:text-gray-400" },
  active: { label: "Actief", dot: "bg-emerald-500", badgeBg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  completed: { label: "Afgerond", dot: "bg-blue-500", badgeBg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  archived: { label: "Gearchiveerd", dot: "bg-gray-400", badgeBg: "bg-gray-500/10", text: "text-gray-500 dark:text-gray-400" },
};

function StatusBadge({
  cfg,
  pulse = false,
}: {
  cfg: { label: string; dot: string; badgeBg: string; text: string };
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold",
        cfg.badgeBg,
        cfg.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot, pulse && "pulse-dot")} />
      {cfg.label}
    </span>
  );
}

const HEALTH_CONFIG = {
  green: { label: "Op schema", color: "bg-emerald-500", ring: "ring-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" },
  amber: { label: "Openstaand", color: "bg-amber-500", ring: "ring-amber-500/30", text: "text-amber-600 dark:text-amber-400" },
  red: { label: "Verlopen", color: "bg-red-500", ring: "ring-red-500/30", text: "text-red-600 dark:text-red-400" },
};

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: ContractFilter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "actief", label: "Actief" },
  { key: "verlopen", label: "Verlopen" },
  { key: "voltooid", label: "Voltooid" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Kanban pipeline view
// ---------------------------------------------------------------------------

type PipelineStage = "offerte" | "project" | "gefactureerd" | "betaald";

interface KanbanStageConfig {
  key: PipelineStage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  dotColor: string;
  borderColor: string;
}

const KANBAN_STAGES: KanbanStageConfig[] = [
  { key: "offerte", label: "Offertes", icon: FileSignature, color: "text-blue-500", dotColor: "bg-blue-500", borderColor: "border-t-blue-500" },
  { key: "project", label: "In Uitvoering", icon: FolderKanban, color: "text-primary", dotColor: "bg-primary", borderColor: "border-t-primary" },
  { key: "gefactureerd", label: "Gefactureerd", icon: Send, color: "text-amber-500", dotColor: "bg-amber-500", borderColor: "border-t-amber-500" },
  { key: "betaald", label: "Betaald", icon: CheckCircle2, color: "text-emerald-500", dotColor: "bg-emerald-500", borderColor: "border-t-emerald-500" },
];

function getContractStage(row: ContractRow): PipelineStage {
  if (row.paidCents > 0 && row.outstandingCents === 0 && (row.project?.status === "completed" || !row.project)) return "betaald";
  if (row.invoicedCents > 0) return "gefactureerd";
  if (row.project?.status === "active") return "project";
  return "offerte";
}

// Journey stepper: shows which stages a contract has passed through
function ContractJourney({ row }: { row: ContractRow }) {
  const currentStage = getContractStage(row);
  const stageOrder: PipelineStage[] = ["offerte", "project", "gefactureerd", "betaald"];
  const currentIdx = stageOrder.indexOf(currentStage);

  return (
    <div className="flex items-center gap-1 py-1.5">
      {stageOrder.map((stage, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        const cfg = KANBAN_STAGES.find((s) => s.key === stage)!;
        return (
          <React.Fragment key={stage}>
            <div
              className={cn(
                "journey-dot h-4 w-4 rounded-full",
                isCompleted && "completed bg-emerald-500",
                isCurrent && "active",
                isCurrent && cfg.dotColor,
                !isCompleted && !isCurrent && "bg-muted/40"
              )}
              title={cfg.label}
            >
              {isCompleted && (
                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
              )}
            </div>
            {i < stageOrder.length - 1 && (
              <div className={cn(
                "h-[2px] flex-1 rounded-full transition-all",
                i < currentIdx ? "bg-emerald-500/50" : "bg-muted/30"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function KanbanPipeline({ rows }: { rows: ContractRow[] }) {
  const stageMap = new Map<PipelineStage, ContractRow[]>();
  for (const s of KANBAN_STAGES) stageMap.set(s.key, []);
  for (const row of rows) {
    const stage = getContractStage(row);
    stageMap.get(stage)?.push(row);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {KANBAN_STAGES.map((stage) => {
        const items = stageMap.get(stage.key) ?? [];
        const totalCents = items.reduce(
          (s, r) => s + (r.quote?.total_cents ?? r.project?.budget_cents ?? 0),
          0
        );
        return (
          <div key={stage.key} className={cn("kanban-column border-t-[3px]", stage.borderColor)}>
            {/* Column header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", stage.color.replace("text-", "bg-") + "/10")}>
                  <stage.icon className={cn("h-3.5 w-3.5", stage.color)} />
                </div>
                <div>
                  <span className="text-[13px] font-bold">{stage.label}</span>
                  {totalCents > 0 && (
                    <p className="text-[10px] font-bold text-muted-foreground/50">
                      {formatMoney(totalCents)}
                    </p>
                  )}
                </div>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted/60 px-1.5 text-[10px] font-bold text-muted-foreground ml-auto">
                  {items.length}
                </span>
              </div>
            </div>
            {/* Cards */}
            <div className="space-y-2.5 flex-1">
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2", stage.color.replace("text-", "bg-") + "/10")}>
                    <stage.icon className={cn("h-4 w-4", stage.color, "opacity-40")} />
                  </span>
                  <p className="text-[11px] text-muted-foreground/40">Geen items</p>
                </div>
              )}
              {items.map((row) => {
                const healthCfg = HEALTH_CONFIG[row.health];
                const totalValue = row.quote?.total_cents ?? row.project?.budget_cents ?? 0;
                const paidPercent = totalValue > 0 ? Math.round((row.paidCents / totalValue) * 100) : 0;

                return (
                  <div key={row.key} className="kanban-card-premium group">
                    {/* Customer header with avatar */}
                    <div className="flex items-start gap-2.5 mb-2.5">
                      <div className="avatar-initials h-8 w-8 shrink-0 text-[10px]">
                        {getInitials(row.customerName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-bold text-foreground leading-tight line-clamp-1 block">
                          {row.customerName}
                        </span>
                        {/* Project/Quote link */}
                        {row.project ? (
                          <Link
                            href={`/dashboard/projects/${row.project.id}`}
                            className="text-[10px] text-muted-foreground hover:text-primary transition-colors line-clamp-1 block"
                          >
                            {row.project.name}
                          </Link>
                        ) : row.quote ? (
                          <Link
                            href={`/dashboard/quotes/${row.quote.id}`}
                            className="text-[10px] text-muted-foreground font-mono hover:text-primary transition-colors block"
                          >
                            {row.quote.quote_number}
                          </Link>
                        ) : null}
                      </div>
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0",
                        healthCfg.color.replace("bg-", "bg-").replace("500", "500/10"),
                        healthCfg.text
                      )}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", healthCfg.color, row.health !== "green" && "pulse-dot")} />
                        {healthCfg.label}
                      </span>
                    </div>

                    {/* Journey stepper */}
                    <ContractJourney row={row} />

                    {/* Financial detail */}
                    <div className="mt-2.5 pt-2.5 border-t border-border/30 space-y-2">
                      {/* Total value */}
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] font-extrabold tracking-tight">
                          {formatMoney(totalValue)}
                        </span>
                        {paidPercent > 0 && (
                          <span className="text-[10px] font-bold text-emerald-500">
                            {paidPercent}% betaald
                          </span>
                        )}
                      </div>

                      {/* Payment progress bar */}
                      {totalValue > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                          <div className="flex h-full">
                            {row.paidCents > 0 && (
                              <div
                                className="h-full bg-emerald-500 rounded-l-full"
                                style={{ width: `${Math.min((row.paidCents / totalValue) * 100, 100)}%` }}
                              />
                            )}
                            {row.invoicedCents > row.paidCents && (
                              <div
                                className="h-full bg-amber-500/60"
                                style={{ width: `${Math.min(((row.invoicedCents - row.paidCents) / totalValue) * 100, 100 - (row.paidCents / totalValue) * 100)}%` }}
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Outstanding callout */}
                      {row.outstandingCents > 0 && (
                        <div className={cn(
                          "flex items-center justify-between rounded-lg px-2.5 py-1.5",
                          row.health === "red" ? "bg-red-500/5 border border-red-500/15" : "bg-amber-500/5 border border-amber-500/15"
                        )}>
                          <span className="text-[10px] text-muted-foreground">Openstaand</span>
                          <span className={cn(
                            "text-[11px] font-bold",
                            row.health === "red" ? "text-red-500" : "text-amber-500"
                          )}>
                            {formatMoney(row.outstandingCents)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ContractsPage() {
  const [quotes, setQuotes] = useState<QuoteResponse[]>([]);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ContractFilter>("alle");
  const [view, setView] = useState<"kanban" | "table">("kanban");

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<QuoteListResponse>("/quotes/?per_page=200").catch(() => ({ data: [], total: 0 })),
      apiFetch<ProjectListResponse>("/projects?per_page=200").catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
      apiFetch<InvoiceListResponse>("/invoices/?per_page=200").catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
    ])
      .then(([qRes, pRes, iRes]) => {
        setQuotes(qRes.data ?? []);
        setProjects(pRes.data ?? []);
        setInvoices(iRes.data ?? []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const allRows = buildContractRows(quotes, projects, invoices);
  const filtered = filterRows(allRows, filter);

  const counts: Record<ContractFilter, number> = {
    alle: allRows.length,
    actief: filterRows(allRows, "actief").length,
    verlopen: filterRows(allRows, "verlopen").length,
    voltooid: filterRows(allRows, "voltooid").length,
  };

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="hero-card rounded-2xl p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[28px] md:text-[32px] font-black tracking-tight text-gradient leading-none">
              Contracten
            </h1>
            <p className="text-[13px] text-muted-foreground/60">
              Volg al uw contracten van offerte tot betaling
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/dashboard/quotes/new">
              <Button size="sm" className="gap-1.5 shadow-lg shadow-primary/25 font-semibold bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-600/90">
                <FileSignature className="h-3.5 w-3.5" />
                Nieuwe offerte
              </Button>
            </Link>
            <Link href="/dashboard/projects/new">
              <Button size="sm" variant="outline" className="gap-1.5 font-medium">
                <FolderKanban className="h-3.5 w-3.5" />
                Nieuw project
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="relative overflow-hidden">
                <CardContent className="p-5">
                  <div className="h-3 w-24 animate-pulse rounded bg-muted mb-3" />
                  <div className="h-8 w-20 animate-pulse rounded bg-muted mb-2" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Contracten konden niet worden geladen: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* KPI strip */}
          <KpiStrip rows={allRows} invoices={invoices} />

          {/* Visual pipeline funnel */}
          <PipelineFunnel rows={allRows} invoices={invoices} />

          {/* Filter tabs + view toggle */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === key
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      filter === key
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-border/50 p-0.5">
              <button
                onClick={() => setView("kanban")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  view === "kanban" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Pipeline
              </button>
              <button
                onClick={() => setView("table")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  view === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-3.5 w-3.5" />
                Tabel
              </button>
            </div>
          </div>

          {/* Content */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
                <FileSignature className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Geen contracten gevonden
              </p>
              <p className="text-sm text-muted-foreground">
                {filter !== "alle"
                  ? "Geen contracten in deze categorie"
                  : "Maak een offerte of project aan om te beginnen"}
              </p>
              {filter === "alle" && (
                <div className="flex gap-2 mt-4">
                  <Link href="/dashboard/quotes/new">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <FileSignature className="h-3.5 w-3.5" />
                      Nieuwe offerte
                    </Button>
                  </Link>
                  <Link href="/dashboard/projects/new">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <FolderKanban className="h-3.5 w-3.5" />
                      Nieuw project
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : view === "kanban" ? (
            <KanbanPipeline rows={filtered} />
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm premium-table">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                          Klant
                        </th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 hidden sm:table-cell">
                          Offerte
                        </th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 hidden md:table-cell">
                          Project
                        </th>
                        <th className="px-4 py-3.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 hidden lg:table-cell">
                          Gefactureerd
                        </th>
                        <th className="px-4 py-3.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 hidden lg:table-cell">
                          Betaald
                        </th>
                        <th className="px-4 py-3.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                          Openstaand
                        </th>
                        <th className="px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filtered.map((row) => {
                        const healthCfg = HEALTH_CONFIG[row.health];
                        const quoteCfg = row.quote
                          ? (QUOTE_STATUS[row.quote.status] ?? QUOTE_STATUS.draft)
                          : null;
                        const projectCfg = row.project
                          ? (PROJECT_STATUS[row.project.status] ?? PROJECT_STATUS.draft)
                          : null;

                        return (
                          <tr
                            key={row.key}
                            className="transition-all group status-row hover:bg-muted/20"
                          >
                            {/* Klant */}
                            <td className="px-4 py-4">
                              <span className="font-bold text-[13px] text-foreground">
                                {row.customerName}
                              </span>
                            </td>

                            {/* Offerte */}
                            <td className="px-4 py-4 hidden sm:table-cell">
                              {row.quote ? (
                                <div className="flex flex-col gap-1">
                                  <Link
                                    href={`/dashboard/quotes/${row.quote.id}`}
                                    className="font-mono text-xs font-semibold text-foreground hover:text-primary transition-colors"
                                  >
                                    {row.quote.quote_number}
                                  </Link>
                                  {quoteCfg && (
                                    <StatusBadge
                                      cfg={quoteCfg}
                                      pulse={row.quote.status === "sent"}
                                    />
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/30 text-xs">—</span>
                              )}
                            </td>

                            {/* Project */}
                            <td className="px-4 py-4 hidden md:table-cell">
                              {row.project ? (
                                <div className="flex flex-col gap-1">
                                  <Link
                                    href={`/dashboard/projects/${row.project.id}`}
                                    className="text-xs font-semibold text-foreground hover:text-primary transition-colors line-clamp-1"
                                  >
                                    {row.project.name}
                                  </Link>
                                  {projectCfg && (
                                    <StatusBadge
                                      cfg={projectCfg}
                                      pulse={row.project.status === "active"}
                                    />
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/30 text-xs">—</span>
                              )}
                            </td>

                            {/* Gefactureerd */}
                            <td className="px-4 py-4 text-right hidden lg:table-cell">
                              <span className="font-semibold text-[13px]">
                                {row.invoicedCents > 0
                                  ? formatMoney(row.invoicedCents)
                                  : <span className="text-muted-foreground/30">—</span>}
                              </span>
                            </td>

                            {/* Betaald */}
                            <td className="px-4 py-4 text-right hidden lg:table-cell">
                              <span
                                className={cn(
                                  "font-semibold text-[13px]",
                                  row.paidCents > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-muted-foreground/30"
                                )}
                              >
                                {row.paidCents > 0
                                  ? formatMoney(row.paidCents)
                                  : "—"}
                              </span>
                            </td>

                            {/* Openstaand */}
                            <td className="px-4 py-4 text-right">
                              <span
                                className={cn(
                                  "font-bold text-[13px]",
                                  row.outstandingCents > 0 && row.health === "red"
                                    ? "text-red-600 dark:text-red-400"
                                    : row.outstandingCents > 0
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground/30"
                                )}
                              >
                                {row.outstandingCents > 0
                                  ? formatMoney(row.outstandingCents)
                                  : "—"}
                              </span>
                            </td>

                            {/* Health indicator */}
                            <td className="px-4 py-4 text-center">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold",
                                  healthCfg.color
                                    .replace("bg-", "bg-")
                                    .replace("500", "500/10"),
                                  healthCfg.text
                                )}
                                title={healthCfg.label}
                              >
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    healthCfg.color,
                                    row.health !== "green" && "pulse-dot"
                                  )}
                                />
                                {healthCfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Footer totals */}
                    <tfoot>
                      <tr className="border-t-2 border-primary/10 bg-muted/20">
                        <td
                          colSpan={3}
                          className="px-4 py-3.5 text-xs font-bold text-muted-foreground/60"
                        >
                          {filtered.length}{" "}
                          {filtered.length === 1 ? "contract" : "contracten"}
                        </td>
                        <td className="px-4 py-3.5 text-right text-[13px] font-extrabold tracking-tight hidden lg:table-cell">
                          {formatMoney(filtered.reduce((s, r) => s + r.invoicedCents, 0))}
                        </td>
                        <td className="px-4 py-3.5 text-right text-[13px] font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 hidden lg:table-cell">
                          {formatMoney(filtered.reduce((s, r) => s + r.paidCents, 0))}
                        </td>
                        <td className="px-4 py-3.5 text-right text-[13px] font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
                          {formatMoney(filtered.reduce((s, r) => s + r.outstandingCents, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
