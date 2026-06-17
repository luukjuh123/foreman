"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  UserPlus,
  X,
  Receipt,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  FileText,
  Users,
  Wallet,
  TrendingUp,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getProject,
  calcPhaseProgress,
  calcTaskSummary,
  formatBudget,
  formatDate,
} from "@/lib/projects";
import type {
  ProjectResponse,
  PhaseResponse,
  TaskResponse,
} from "@/lib/types";
import { apiFetch } from "@/lib/api";
import type {
  SubcontractorResponse,
  SubcontractorListResponse,
} from "@/lib/subcontractors";
import type { InvoiceResponse } from "@/lib/types";
import TimeTracker from "@/components/time-tracking/TimeTracker";
import PunchListTab from "@/components/punch-list/PunchListTab";

// ---------------------------------------------------------------------------
// Financial overview
// ---------------------------------------------------------------------------

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function FinancialOverview({
  projectId,
  budgetCents,
}: {
  projectId: string;
  budgetCents: number | null;
}) {
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch<{ data: InvoiceResponse[] }>(
      `/invoices/?project_id=${projectId}&per_page=200`
    )
      .then((res) => setInvoices(res.data ?? []))
      .catch(() => setInvoices([]))
      .finally(() => setLoaded(true));
  }, [projectId]);

  if (!loaded) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-muted/50"
          />
        ))}
      </div>
    );
  }

  const budget = budgetCents ?? 0;
  const invoicedCents = invoices.reduce((s, i) => s + i.total_cents, 0);
  const paidCents = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.total_cents, 0);
  const outstandingCents = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + i.total_cents, 0);
  const invoicedPct = budget > 0 ? Math.min(Math.round((invoicedCents / budget) * 100), 100) : 0;
  const paidPct = budget > 0 ? Math.min(Math.round((paidCents / budget) * 100), 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Financieel overzicht</h2>
        <Link
          href={`/dashboard/invoices/new?project_id=${projectId}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          + Factuur aanmaken
        </Link>
      </div>

      {/* Budget progress bar */}
      {budget > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">Budget voortgang</span>
              <span className="text-muted-foreground">
                {formatMoney(invoicedCents)} / {formatMoney(budget)}
              </span>
            </div>
            <div className="relative h-3 w-full rounded-full bg-muted/40 overflow-hidden">
              {/* Paid portion */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${paidPct}%` }}
              />
              {/* Invoiced but unpaid portion */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-blue-500/40 transition-all duration-700"
                style={{ width: `${invoicedPct}%` }}
              />
              {/* Paid overlay (on top so it's visible) */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Betaald ({paidPct}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500/40" />
                Gefactureerd ({invoicedPct}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted" />
                Resterend
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial metric cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger-children">
        <Card className="border-0 shadow-sm card-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground/70">
                  Ontvangen
                </p>
                <p className="text-lg font-extrabold tracking-tight leading-tight">
                  {formatMoney(paidCents)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm card-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                <Receipt className="h-4 w-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground/70">
                  Gefactureerd
                </p>
                <p className="text-lg font-extrabold tracking-tight leading-tight">
                  {formatMoney(invoicedCents)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm card-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  outstandingCents > 0 ? "bg-amber-500/10" : "bg-muted/50"
                )}
              >
                <Clock
                  className={cn(
                    "h-4 w-4",
                    outstandingCents > 0
                      ? "text-amber-500"
                      : "text-muted-foreground"
                  )}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground/70">
                  Openstaand
                </p>
                <p
                  className={cn(
                    "text-lg font-extrabold tracking-tight leading-tight",
                    outstandingCents > 0 &&
                      "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {formatMoney(outstandingCents)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm card-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground/70">
                  Nog te factureren
                </p>
                <p className="text-lg font-extrabold tracking-tight leading-tight">
                  {formatMoney(Math.max(0, budget - invoicedCents))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent invoices for this project */}
      {invoices.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">
              Facturen ({invoices.length})
            </CardTitle>
            <Link href={`/dashboard/invoices?project_id=${projectId}`}>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground"
              >
                Alle bekijken
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {invoices.slice(0, 5).map((inv) => {
                const statusColors: Record<string, string> = {
                  draft: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
                  sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
                };
                const statusLabels: Record<string, string> = {
                  draft: "Concept",
                  sent: "Verzonden",
                  paid: "Betaald",
                  overdue: "Verlopen",
                };
                return (
                  <Link
                    key={inv.id}
                    href={`/dashboard/invoices/${inv.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground">
                        {inv.invoice_number}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          statusColors[inv.status] ?? statusColors.draft
                        )}
                      >
                        {statusLabels[inv.status] ?? inv.status}
                      </span>
                    </div>
                    <span className="text-sm font-bold shrink-0 ml-3">
                      {formatMoney(inv.total_cents)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  active: "Actief",
  completed: "Voltooid",
  archived: "Gearchiveerd",
};

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string; border: string }
> = {
  draft: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
    dot: "bg-gray-400",
    border: "border-gray-300 dark:border-gray-600",
  },
  active: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    border: "border-emerald-300 dark:border-emerald-700",
  },
  completed: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
    border: "border-blue-300 dark:border-blue-700",
  },
  archived: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    border: "border-amber-300 dark:border-amber-700",
  },
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Te doen",
  in_progress: "Bezig",
  done: "Klaar",
  blocked: "Geblokkeerd",
};

const TASK_STATUS_CLASS: Record<string, string> = {
  todo: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  in_progress: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  done: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  blocked: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
};

// ---------------------------------------------------------------------------
// Contract lifecycle stepper
// ---------------------------------------------------------------------------

interface ContractLifecycleProps {
  projectId: string;
  projectStatus: string;
}

function ContractLifecycleStepper({ projectId, projectStatus }: ContractLifecycleProps) {
  const [data, setData] = useState<{
    hasQuote: boolean;
    quoteStatus: string;
    quoteValue: number;
    invoicedCents: number;
    paidCents: number;
    outstandingCents: number;
    invoiceCount: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ data: Array<{ status: string; total_cents: number }> }>(
        `/quotes/?project_id=${projectId}&per_page=10`
      ).catch(() => ({ data: [] })),
      apiFetch<{ data: Array<{ status: string; total_cents: number }> }>(
        `/invoices/?project_id=${projectId}&per_page=200`
      ).catch(() => ({ data: [] })),
    ]).then(([quoteRes, invRes]) => {
      const quotes = quoteRes.data ?? [];
      const invoices = invRes.data ?? [];
      const accepted = quotes.find((q) => q.status === "accepted");
      setData({
        hasQuote: quotes.length > 0,
        quoteStatus: accepted ? "accepted" : quotes[0]?.status ?? "",
        quoteValue: quotes.reduce((s, q) => s + q.total_cents, 0),
        invoicedCents: invoices.reduce((s, i) => s + i.total_cents, 0),
        paidCents: invoices
          .filter((i) => i.status === "paid")
          .reduce((s, i) => s + i.total_cents, 0),
        outstandingCents: invoices
          .filter((i) => i.status === "sent" || i.status === "overdue")
          .reduce((s, i) => s + i.total_cents, 0),
        invoiceCount: invoices.length,
      });
    });
  }, [projectId]);

  if (!data) return null;

  const steps = [
    {
      label: "Offerte",
      active: data.hasQuote,
      completed: data.quoteStatus === "accepted",
      icon: ClipboardList,
      color: "blue",
      sublabel: data.hasQuote
        ? data.quoteStatus === "accepted"
          ? "Geaccepteerd"
          : "Openstaand"
        : "Geen offerte",
    },
    {
      label: "Project",
      active: true,
      completed: projectStatus === "completed",
      icon: LayoutGrid,
      color: "primary",
      sublabel:
        projectStatus === "completed"
          ? "Voltooid"
          : projectStatus === "active"
            ? "In uitvoering"
            : "Concept",
    },
    {
      label: "Gefactureerd",
      active: data.invoiceCount > 0,
      completed: data.invoicedCents > 0 && data.outstandingCents === 0 && data.paidCents > 0,
      icon: Receipt,
      color: "amber",
      sublabel:
        data.invoiceCount > 0
          ? `${data.invoiceCount} facturen`
          : "Nog niet gefactureerd",
    },
    {
      label: "Betaald",
      active: data.paidCents > 0,
      completed: data.invoicedCents > 0 && data.outstandingCents === 0 && data.paidCents > 0,
      icon: CheckCircle2,
      color: "emerald",
      sublabel:
        data.paidCents > 0
          ? data.outstandingCents === 0
            ? "Volledig betaald"
            : formatMoney(data.paidCents) + " ontvangen"
          : "Wacht op betaling",
    },
  ];

  const colorMap: Record<string, { activeBg: string; activeText: string; completedBg: string; completedText: string; line: string }> = {
    blue: { activeBg: "bg-blue-500/10", activeText: "text-blue-500", completedBg: "bg-blue-500", completedText: "text-white", line: "bg-blue-500" },
    primary: { activeBg: "bg-primary/10", activeText: "text-primary", completedBg: "bg-primary", completedText: "text-primary-foreground", line: "bg-primary" },
    amber: { activeBg: "bg-amber-500/10", activeText: "text-amber-500", completedBg: "bg-amber-500", completedText: "text-white", line: "bg-amber-500" },
    emerald: { activeBg: "bg-emerald-500/10", activeText: "text-emerald-500", completedBg: "bg-emerald-500", completedText: "text-white", line: "bg-emerald-500" },
  };

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
            Contractcyclus
          </p>
          {data.paidCents > 0 && data.outstandingCents === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Volledig afgerond
            </span>
          )}
        </div>
        <div className="flex items-start">
          {steps.map((step, idx) => {
            const colors = colorMap[step.color] ?? colorMap.primary;
            const StepIcon = step.icon;
            return (
              <React.Fragment key={step.label}>
                <div className="flex flex-col items-center text-center flex-1 min-w-0">
                  <div
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-500",
                      step.completed
                        ? `${colors.completedBg} ${colors.completedText} shadow-md shadow-${step.color === "emerald" ? "emerald" : step.color === "blue" ? "blue" : step.color === "amber" ? "amber" : "primary"}-500/20`
                        : step.active
                          ? `${colors.activeBg} ${colors.activeText} ring-2 ring-${step.color === "primary" ? "primary" : step.color + "-500"}/20`
                          : "bg-muted/30 text-muted-foreground/25"
                    )}
                  >
                    {step.completed ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-4.5 w-4.5" />
                    )}
                    {step.active && !step.completed && (
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-current animate-pulse" />
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-xs font-bold mt-2.5",
                      step.completed
                        ? colors.activeText.replace("text-", "text-")
                        : step.active
                          ? "text-foreground"
                          : "text-muted-foreground/35"
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      "text-[10px] mt-0.5 leading-tight",
                      step.active || step.completed
                        ? "text-muted-foreground/70"
                        : "text-muted-foreground/25"
                    )}
                  >
                    {step.sublabel}
                  </p>
                </div>
                {idx < steps.length - 1 && (
                  <div className="flex items-center pt-[22px] px-0.5">
                    <div className="relative h-0.5 w-10">
                      <div className="absolute inset-0 rounded-full bg-border/40" />
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                          step.completed ? `${colors.line} w-full` : "w-0"
                        )}
                      />
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-page navigation with active state
// ---------------------------------------------------------------------------

const PROJECT_TABS = [
  { label: "Takenbord", segment: "board" },
  { label: "Gantt", segment: "gantt" },
  { label: "Processen", segment: "processes" },
  { label: "Tijdlijn", segment: "timeline" },
  { label: "Uren", segment: "time-tracking" },
];

function ProjectSubNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1 border-b border-border/50 pb-px">
      {PROJECT_TABS.map((tab) => {
        const href = `/dashboard/projects/${projectId}/${tab.segment}`;
        const isActive = pathname === href;
        return (
          <Link key={tab.segment} href={href}>
            <button
              className={cn(
                "relative rounded-lg px-3.5 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project hero section
// ---------------------------------------------------------------------------

function HeroProgressRing({ percent }: { percent: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const fill = Math.min(100, percent);
  const offset = circumference - (fill / 100) * circumference;
  const color = fill >= 100 ? "text-emerald-500" : "text-primary";

  return (
    <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
      {/* Ambient glow */}
      <div className={cn(
        "absolute inset-2 rounded-full blur-xl opacity-20",
        fill >= 100 ? "bg-emerald-500" : "bg-primary"
      )} />
      <svg width={128} height={128} viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/20" />
        <circle
          cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("metric-ring", color)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-black tracking-tight leading-none", color)}>{fill}</span>
        <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">% voltooid</span>
      </div>
    </div>
  );
}

function ProjectHero({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const progressPercent =
    summary.total > 0
      ? Math.round((summary.done / summary.total) * 100)
      : 0;
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter(
    (p) => p.status === "completed" || p.status === "done"
  ).length;
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
  const customerName = (project as { customer_name?: string }).customer_name;

  // Days remaining
  const daysRemaining = project.end_date
    ? Math.ceil(
        (new Date(project.end_date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const deadlineColor =
    daysRemaining !== null && daysRemaining < 0
      ? "text-red-500"
      : daysRemaining !== null && daysRemaining <= 7
        ? "text-amber-500"
        : "text-foreground";

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div className="hero-card rounded-2xl p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          {/* Progress ring */}
          <HeroProgressRing percent={progressPercent} />

          {/* Info section */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] md:text-[32px] font-black tracking-tight text-gradient leading-none">
                {project.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
                  statusCfg.bg,
                  statusCfg.text,
                  statusCfg.border
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", statusCfg.dot)} />
                {STATUS_LABELS[project.status] ?? project.status}
              </span>
            </div>

            {project.description && (
              <p className="text-sm text-muted-foreground/70 max-w-2xl leading-relaxed">
                {project.description}
              </p>
            )}

            {/* Meta chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {customerName && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-card/60 border border-border/40 px-2.5 py-1.5 font-medium">
                  <Users className="h-3 w-3 text-primary" />
                  {customerName}
                </span>
              )}
              {(project.start_date || project.end_date) && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-card/60 border border-border/40 px-2.5 py-1.5 font-medium">
                  <Calendar className="h-3 w-3 text-blue-500" />
                  {formatDate(project.start_date)} – {formatDate(project.end_date)}
                </span>
              )}
              {daysRemaining !== null && (
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-bold",
                  daysRemaining < 0
                    ? "bg-red-500/10 border-red-500/20 text-red-500"
                    : daysRemaining <= 7
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                      : "bg-card/60 border-border/40 text-foreground"
                )}>
                  {daysRemaining < 0 ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {daysRemaining > 0 ? `${daysRemaining} dagen resterend` : daysRemaining === 0 ? "Deadline vandaag" : `${Math.abs(daysRemaining)} dagen te laat`}
                </span>
              )}
            </div>

            {/* Inline metrics row */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <div className="inline-stat">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs"><span className="font-bold">{summary.done}/{summary.total}</span> <span className="text-muted-foreground">taken</span></span>
              </div>
              <div className="inline-stat">
                <LayoutGrid className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs"><span className="font-bold">{donePhases}/{totalPhases}</span> <span className="text-muted-foreground">fases</span></span>
              </div>
              {project.budget_cents != null && project.budget_cents > 0 && (
                <div className="inline-stat">
                  <Wallet className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-bold">{formatBudget(project.budget_cents)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-col gap-2 shrink-0">
            <Link href={`/dashboard/invoices/new?project_id=${project.id}&project_name=${encodeURIComponent(project.name)}`}>
              <Button size="sm" className="w-full gap-1.5 text-xs shadow-lg shadow-primary/25 font-semibold bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-600/90">
                <Receipt className="h-3.5 w-3.5" />
                Factuur aanmaken
              </Button>
            </Link>
            <Link href={`/dashboard/reports?project_id=${project.id}`}>
              <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Rapport genereren
              </Button>
            </Link>
          </div>
        </div>

        {/* Phase progress segments — visual timeline */}
        {totalPhases > 0 && (
          <div className="mt-6 pt-5 border-t border-border/30">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Fase voortgang</span>
              <span className="text-xs font-semibold">{donePhases} van {totalPhases} voltooid</span>
            </div>
            <div className="flex gap-1">
              {project.phases.map((phase, i) => {
                const phaseProgress = calcPhaseProgress(phase);
                const isDone = phase.status === "completed" || phase.status === "done";
                return (
                  <div key={phase.id} className="flex-1 min-w-0 group relative">
                    <div className={cn(
                      "h-2 rounded-full transition-all duration-500",
                      isDone
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-sm shadow-emerald-500/20"
                        : phaseProgress > 0
                          ? "bg-gradient-to-r from-primary to-primary/60"
                          : "bg-muted/40"
                    )} />
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-card border border-border shadow-lg text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      <span className="font-bold">{phase.name}</span>
                      <span className="text-muted-foreground ml-1.5">{phaseProgress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sub-page navigation tabs */}
      <ProjectSubNav projectId={project.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ task }: { task: TaskResponse }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <span className="text-sm font-medium">{task.name}</span>
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
          TASK_STATUS_CLASS[task.status] ?? TASK_STATUS_CLASS.todo
        )}
      >
        {TASK_STATUS_LABELS[task.status] ?? task.status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcontractor picker dialog
// ---------------------------------------------------------------------------

interface SubcontractorPickerProps {
  phaseId: string;
  onClose: () => void;
}

function SubcontractorPicker({ phaseId, onClose }: SubcontractorPickerProps) {
  const [subs, setSubs] = useState<SubcontractorResponse[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [rateEuros, setRateEuros] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SubcontractorListResponse>(
      "/subcontractors/?page=1&per_page=100"
    )
      .then((res) => setSubs(res.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const hourly_rate_cents = rateEuros
        ? Math.round(parseFloat(rateEuros) * 100)
        : undefined;
      await apiFetch(`/subcontractors/assignments/phase/${phaseId}`, {
        method: "POST",
        body: JSON.stringify({
          subcontractor_id: selectedId,
          hourly_rate_cents,
        }),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Onderaannemer toewijzen</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : (
          <form onSubmit={handleAssign} className="space-y-4">
            <div>
              <label
                htmlFor="sub-picker-select"
                className="mb-1.5 block text-sm font-medium"
              >
                Onderaannemer
              </label>
              <select
                id="sub-picker-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="" disabled>
                  Selecteer onderaannemer
                </option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedId && (
              <div>
                <label
                  htmlFor="sub-picker-rate"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Tarief voor deze fase (€/uur)
                </label>
                <input
                  id="sub-picker-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateEuros}
                  onChange={(e) => setRateEuros(e.target.value)}
                  placeholder="75.00"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuleren
              </Button>
              <Button type="submit" disabled={saving || !selectedId}>
                {saving ? "Toewijzen..." : "Toewijzen"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase card (expandable)
// ---------------------------------------------------------------------------

function PhaseCard({ phase }: { phase: PhaseResponse }) {
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const progress = calcPhaseProgress(phase);
  const done = phase.tasks.filter((t) => t.status === "done").length;
  const total = phase.tasks.length;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader
          className="cursor-pointer select-none pb-2 hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <CardTitle className="text-sm font-bold">
                {phase.name}
              </CardTitle>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-foreground">
                {progress}%
              </span>
              <span className="text-xs text-muted-foreground">
                {done}/{total} taken
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-1.5 pt-0">
            {phase.tasks.length > 0 &&
              phase.tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}

            {/* Subcontractor assignment button */}
            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setPickerOpen(true);
                }}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Onderaannemer toewijzen
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {pickerOpen && (
        <SubcontractorPicker
          phaseId={phase.id}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: Props) {
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      getProject(id)
        .then(setProject)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-96 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-muted/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        </Link>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? "Project niet gevonden."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back */}
      <Link href="/dashboard/projects">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Projecten
        </Button>
      </Link>

      {/* Hero section */}
      <ProjectHero project={project} />

      {/* Contract lifecycle stepper */}
      <ContractLifecycleStepper
        projectId={project.id}
        projectStatus={project.status}
      />

      {/* Financial overview */}
      <FinancialOverview
        projectId={project.id}
        budgetCents={project.budget_cents ?? null}
      />

      {/* Punch list */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Nakijklijst</h2>
        <PunchListTab projectId={project.id} />
      </div>

      {/* Phases */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Fases</h2>
        {project.phases.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutGrid className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Geen fases toegevoegd.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {project.phases.map((phase) => (
              <PhaseCard key={phase.id} phase={phase} />
            ))}
          </div>
        )}
      </div>

      {/* Time tracking */}
      <TimeTracker projectId={project.id} />
    </div>
  );
}
