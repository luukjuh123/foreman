"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FolderKanban,
  AlertCircle,
  TrendingUp,
  Receipt,
  Users,
  Plus,
  FileText,
  Calendar,
  ArrowRight,
  Clock,
  ClipboardList,
  CheckCircle2,
  Send,
  Sparkles,
} from "lucide-react";
import { listProjects, formatBudget } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse, AgendaTask } from "@/lib/types";
import { fetchWeekAgenda } from "@/lib/agenda";
import { cn } from "@/lib/utils";

const ONBOARDING_KEY = "foreman_onboarding_done";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

interface RecentProject {
  id: string;
  name: string;
  status: string;
  updated_at?: string | null;
}

interface InvoiceSummary {
  id: string;
  status: "draft" | "sent" | "paid" | "overdue";
  total_cents: number;
  paid_at: string | null;
}

interface InvoiceListData {
  data: InvoiceSummary[];
  total: number;
}

interface StaffUtilization {
  utilization_percent: number;
  assigned_hours: number;
  available_hours: number;
}

interface DashboardStats {
  activeProjects: number;
  overdueTasks: number;
  monthlyRevenueCents: number;
  outstandingCents: number;
  staffUtilization: StaffUtilization;
}

const isOverdue = (task: { status: string; end_date?: string | null }): boolean =>
  task.status !== "done" && !!task.end_date && new Date(task.end_date) < new Date();

function computeStats(projects: ProjectResponse[], invoices: InvoiceSummary[], staffUtilization: StaffUtilization): DashboardStats {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const sumCents = (arr: InvoiceSummary[]) => arr.reduce((s, i) => s + (i.total_cents ?? 0), 0);
  return {
    activeProjects: projects.filter((p) => p.status === "active").length,
    overdueTasks: projects.flatMap((p) => p.phases ?? []).flatMap((ph) => ph.tasks ?? []).filter(isOverdue).length,
    monthlyRevenueCents: sumCents(invoices.filter((i) => i.status === "paid" && i.paid_at?.slice(0, 7) === thisMonth)),
    outstandingCents: sumCents(invoices.filter((i) => i.status === "sent" || i.status === "overdue")),
    staffUtilization,
  };
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  draft: "bg-gray-400",
  completed: "bg-blue-500",
  archived: "bg-gray-300",
};

function UtilizationGauge({ percent, assignedHours, availableHours }: { percent: number; assignedHours: number; availableHours: number }) {
  const p = Math.min(Math.max(percent, 0), 100);
  const R = 40, C = 2 * Math.PI * R;
  const gaugeColor = p >= 90 ? "text-red-500" : p >= 70 ? "text-primary" : p >= 40 ? "text-emerald-500" : "text-muted-foreground/40";
  const statusColor = p >= 90 ? "text-red-500" : p >= 70 ? "text-primary" : "text-emerald-500";
  const statusText = p >= 90 ? "Overbezet — overweeg extra capaciteit" : p >= 70 ? "Goed bezet" : p >= 40 ? "Ruimte beschikbaar" : "Team grotendeels vrij";
  const circleProps = { cx: 48, cy: 48, r: R, fill: "none", stroke: "currentColor", strokeWidth: 6 };

  return (
    <Card className="border-0 shadow-sm card-lift">
      <CardContent className="p-5 flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
            <circle {...circleProps} className="text-muted/60" />
            <circle {...circleProps} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (p / 100) * C} className={`${gaugeColor} transition-all duration-1000 ease-out`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-extrabold tracking-tight">{p}%</span>
            <span className="text-[9px] text-muted-foreground">bezet</span>
          </div>
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Teambezetting</p>
          <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{assignedHours}</span> van {availableHours} uur ingepland</p>
          <p className={`text-xs font-medium ${statusColor}`}>{statusText}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({ title, value, icon: Icon, accent, subtitle, testId }: {
  title: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  accent: string; subtitle?: string; testId?: string;
}) {
  const iconColor = accent.replace("bg-", "text-");
  return (
    <Card className="relative overflow-hidden border-0 shadow-sm group hover:shadow-md transition-all duration-200">
      <div className={`h-[2px] ${accent} opacity-60`} />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">{title}</p>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}/10 group-hover:scale-110 transition-transform duration-300`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </div>
        <p className="text-[26px] font-extrabold tracking-tight leading-none stat-value" data-testid={testId}>{value}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground/60 mt-2">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

interface PipelineData {
  quotesOpen: number; quoteValueCents: number; projectsActive: number;
  projectValueCents: number; invoicedCents: number; paidCents: number;
}

function ContractPipeline({ data }: { data: PipelineData }) {
  const pct = (num: number, den: number) => den > 0 ? Math.round((num / den) * 100) : 0;
  const stages = [
    {
      label: "Offertes",
      sublabel: `${data.quotesOpen} open`,
      value: formatBudget(data.quoteValueCents),
      rawCents: data.quoteValueCents,
      icon: ClipboardList,
      color: "blue",
      href: "/dashboard/quotes",
      conversion: pct(data.projectValueCents, data.quoteValueCents),
    },
    {
      label: "Projecten",
      sublabel: `${data.projectsActive} actief`,
      value: formatBudget(data.projectValueCents),
      rawCents: data.projectValueCents,
      icon: FolderKanban,
      color: "primary",
      href: "/dashboard/projects",
      conversion: pct(data.invoicedCents, data.projectValueCents),
    },
    {
      label: "Gefactureerd",
      sublabel: "verzonden",
      value: formatBudget(data.invoicedCents),
      rawCents: data.invoicedCents,
      icon: Send,
      color: "amber",
      href: "/dashboard/invoices",
      conversion: pct(data.paidCents, data.invoicedCents),
    },
    {
      label: "Ontvangen",
      sublabel: "betaald",
      value: formatBudget(data.paidCents),
      rawCents: data.paidCents,
      icon: CheckCircle2,
      color: "emerald",
      href: "/dashboard/invoices",
      conversion: null as number | null,
    },
  ];

  const cm = (c: string) => {
    const base = c === "primary" ? "primary" : `${c}-500`;
    return { iconBg: `bg-${base}/10`, iconText: `text-${base}`, barColor: `bg-${base}`, glowColor: `shadow-${base}/20` };
  };

  const maxCents = Math.max(...stages.map((s) => s.rawCents), 1);
  const totalPipeline = data.quoteValueCents + data.projectValueCents + data.invoicedCents;
  const overallConversion = totalPipeline > 0 ? Math.round((data.paidCents / totalPipeline) * 100) : 0;

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <CardContent className="p-5 md:p-6">
        {/* Header with overall stats */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-primary" />
            <h3 className="text-[13px] font-bold">Contract Pipeline</h3>
            {overallConversion > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-2.5 w-2.5" />
                {overallConversion}% conversie
              </span>
            )}
          </div>
          <Link href="/dashboard/contracts" className="text-[11px] font-medium text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-1">
            Volledig overzicht
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Flow pipeline — connected stages */}
        <div className="relative">
          {/* Background connector line */}
          <div className="hidden md:block absolute top-[36px] left-[60px] right-[60px] h-[2px] bg-gradient-to-r from-blue-500/20 via-primary/20 via-amber-500/20 to-emerald-500/20 rounded-full" />
          {/* Animated flow particle */}
          <div className="hidden md:block absolute top-[35px] left-[60px] right-[60px] h-[4px] overflow-hidden rounded-full">
            <div className="h-full w-[60px] rounded-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" style={{ animation: "flowRight 3s ease-in-out infinite" }} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-0">
            {stages.map((stage, idx) => {
              const colors = cm(stage.color);
              const barWidth = Math.max((stage.rawCents / maxCents) * 100, 4);
              const isActive = stage.rawCents > 0;
              return (
                <div key={stage.label} className="relative">
                  <Link href={stage.href} className="group block">
                    <div className={cn(
                      "relative rounded-xl border bg-card transition-all duration-200 overflow-hidden",
                      "md:rounded-none md:border-x-0 md:first:rounded-l-xl md:first:border-l md:last:rounded-r-xl md:last:border-r",
                      isActive
                        ? "border-border/40 hover:border-primary/20 hover:shadow-lg card-lift"
                        : "border-border/20 opacity-60"
                    )}>
                      {/* Top accent */}
                      <div className={cn("h-[3px]", colors.barColor, isActive ? "opacity-80" : "opacity-30")} />

                      <div className="p-4 md:px-5 md:py-5">
                        {/* Icon */}
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 mb-3",
                          colors.iconBg,
                          isActive && `shadow-md ${colors.glowColor}`,
                          "group-hover:scale-110"
                        )}>
                          <stage.icon className={cn("h-4.5 w-4.5", colors.iconText)} />
                        </div>

                        {/* Label */}
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 mb-1">
                          {stage.label}
                        </p>

                        {/* Value */}
                        <p className="text-2xl font-black tracking-tight leading-none stat-value mb-1">
                          {stage.value}
                        </p>
                        <p className="text-[11px] text-muted-foreground/60">{stage.sublabel}</p>

                        {/* Bar */}
                        <div className="mt-3 h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-700 ease-out", colors.barColor)}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Conversion badge between stages */}
                  {idx < stages.length - 1 && stage.conversion !== null && stage.conversion > 0 && (
                    <div className="hidden md:flex absolute -right-[18px] top-[28px] z-10 flex-col items-center gap-0.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card border-2 border-border/50 shadow-md">
                        <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                      </div>
                      <span className="mt-0.5 rounded-full bg-card border border-border/40 px-2 py-0.5 text-[9px] font-bold text-primary shadow-sm">
                        {stage.conversion}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DailyAction {
  id: string; type: string; title: string; subtitle: string; href: string; urgency: "high" | "medium" | "info";
}

function buildDailyActions(projects: ProjectResponse[], invoices: InvoiceSummary[], pipeline: PipelineData | null, upcomingTasks: Array<AgendaTask & { date: string }>): DailyAction[] {
  const actions: DailyAction[] = [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

  const overdue = projects.flatMap((p) => (p.phases ?? []).flatMap((ph) => (ph.tasks ?? []).map((t) => ({ ...t, projectName: p.name, projectId: p.id })))).filter((t) => t.status !== "done" && t.end_date && new Date(t.end_date) < now);
  if (overdue.length > 0)
    actions.push({ id: "overdue-tasks", type: "task_overdue", title: `${nl(overdue.length, "verlopen taak", "verlopen taken")}`, subtitle: overdue.slice(0, 2).map((t) => t.name).join(", ") + (overdue.length > 2 ? ` +${overdue.length - 2}` : ""), href: "/dashboard/agenda", urgency: "high" });

  const overdueInv = invoices.filter((i) => i.status === "overdue" || i.status === "sent");
  const overdueAmt = overdueInv.reduce((s, i) => s + (i.total_cents ?? 0), 0);
  if (overdueAmt > 0)
    actions.push({ id: "outstanding-invoices", type: "invoice_due", title: `${formatBudget(overdueAmt)} openstaand`, subtitle: `${nl(overdueInv.length, "factuur wacht", "facturen wachten")} op betaling`, href: "/dashboard/invoices?status=sent", urgency: overdueInv.some((i) => i.status === "overdue") ? "high" : "medium" });

  if (pipeline && pipeline.quotesOpen > 0)
    actions.push({ id: "open-quotes", type: "quote_followup", title: `${nl(pipeline.quotesOpen, "openstaande offerte", "openstaande offertes")}`, subtitle: `${formatBudget(pipeline.quoteValueCents)} in pipeline`, href: "/dashboard/quotes", urgency: "info" });

  const todayTasks = upcomingTasks.filter((t) => t.date === today);
  if (todayTasks.length > 0)
    actions.push({ id: "today-tasks", type: "project_update", title: `${nl(todayTasks.length, "taak", "taken")} vandaag`, subtitle: todayTasks.slice(0, 2).map((t) => t.name).join(", "), href: "/dashboard/agenda", urgency: "info" });

  return actions;
}

const URGENCY_STYLES: Record<string, { border: string; bg: string; icon: string }> = {
  high:   { border: "border-red-500/30",   bg: "bg-red-500/5",   icon: "text-red-500" },
  medium: { border: "border-amber-500/30", bg: "bg-amber-500/5", icon: "text-amber-500" },
  info:   { border: "border-blue-500/20",  bg: "bg-blue-500/5",  icon: "text-blue-500" },
};

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  task_overdue: AlertCircle, invoice_due: Receipt, quote_followup: ClipboardList, project_update: FolderKanban,
};

function DailyActionsPanel({ actions }: { actions: DailyAction[] }) {
  if (actions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Vandaag
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {actions.length} {actions.length === 1 ? "actie" : "acties"}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => {
          const style = URGENCY_STYLES[action.urgency];
          const Icon = ACTION_ICONS[action.type] ?? FolderKanban;
          return (
            <Link key={action.id} href={action.href}>
              <div
                className={`flex items-center gap-3 rounded-xl border ${style.border} ${style.bg} px-4 py-3 hover:shadow-sm transition-all group cursor-pointer`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.bg}`}
                >
                  <Icon className={`h-4 w-4 ${style.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {action.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {action.subtitle}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<
    Array<AgendaTask & { date: string }>
  >([]);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [allInvoices, setAllInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(ONBOARDING_KEY))
      router.push("/dashboard/onboarding");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const agendaFetch = fetchWeekAgenda().catch(() => null);
    const quotesFetch = apiFetch<{
      data: Array<{ status: string; total_cents: number }>;
    }>("/quotes/?per_page=200").catch(() => ({ data: [] }));

    Promise.all([
      listProjects(1, 100),
      apiFetch<InvoiceListData>("/invoices/?per_page=200"),
      apiFetch<StaffUtilization>("/staff/utilization"),
      agendaFetch,
      quotesFetch,
    ])
      .then(
        async ([
          projectsRes,
          invoicesRes,
          utilizationRes,
          _agenda,
          quotesRes,
        ]) => {
          if (!cancelled) {
            const invoices: InvoiceSummary[] =
              (invoicesRes as { data?: { data?: InvoiceSummary[] } })?.data
                ?.data ?? [];
            const utilization: StaffUtilization =
              (utilizationRes as StaffUtilization) ?? {
                utilization_percent: 0,
                assigned_hours: 0,
                available_hours: 0,
              };
            setStats(computeStats(projectsRes.data, invoices, utilization));
            setAllInvoices(invoices);

            setRecentProjects(
              [...projectsRes.data]
                .sort((a, b) => ((b as RecentProject).updated_at ?? "").localeCompare((a as RecentProject).updated_at ?? ""))
                .slice(0, 5),
            );

            const quotes =
              ((quotesRes as { data: Array<{ status: string; total_cents: number }> }).data ?? []);
            const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");
            const actProj = projectsRes.data.filter((p) => p.status === "active");
            const sum = <T,>(arr: T[], fn: (x: T) => number) => arr.reduce((s, x) => s + fn(x), 0);
            setPipeline({
              quotesOpen: openQuotes.length,
              quoteValueCents: sum(openQuotes, (q) => q.total_cents),
              projectsActive: actProj.length,
              projectValueCents: sum(actProj, (p) => p.budget_cents ?? 0),
              invoicedCents: sum(invoices, (i) => i.total_cents ?? 0),
              paidCents: sum(invoices.filter((i) => i.status === "paid"), (i) => i.total_cents ?? 0),
            });

            const agenda = await agendaFetch;
            if (!cancelled && agenda) {
              setUpcomingTasks(
                agenda.days.flatMap((day) =>
                  day.tasks
                    .filter((t) => t.status !== "done")
                    .map((t) => ({ ...t, date: day.date })),
                ),
              );
            }

            setLoading(false);
          }
        }
      )
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const h = new Date().getHours();
  const greeting = h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";

  return (
    <div className="space-y-6 page-enter">
      {/* Hero welcome card */}
      <div className="hero-card rounded-2xl p-6 md:p-8">
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[28px] md:text-[32px] font-black tracking-tight leading-none text-gradient">
              {greeting}
            </h1>
            <p className="text-[13px] text-muted-foreground/60">
              {new Date().toLocaleDateString("nl-NL", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {[
              { label: "Nieuw project", href: "/dashboard/projects/new", icon: FolderKanban, primary: true },
              { label: "Offerte", href: "/dashboard/quotes/new", icon: ClipboardList, primary: false },
              { label: "Factuur", href: "/dashboard/invoices/new", icon: FileText, primary: false },
            ].map((action) => (
              <Link key={action.href} href={action.href}>
                <Button
                  size="sm"
                  variant={action.primary ? "default" : "outline"}
                  className={action.primary
                    ? "gap-1.5 shadow-lg shadow-primary/25 font-semibold bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-600/90"
                    : "gap-1.5 font-medium"
                  }
                >
                  <action.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{action.label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div
          data-testid="dashboard-loading"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="relative overflow-hidden">
              <CardContent className="p-5">
                <div className="h-3 w-20 animate-pulse rounded bg-muted mb-3" />
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          data-testid="dashboard-error"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          Gegevens konden niet worden geladen: {error}
        </div>
      )}

      {!loading && !error && stats && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger-children">
            {([
              { title: "Actieve Projecten", value: stats.activeProjects, icon: FolderKanban, accent: "bg-primary", testId: "kpi-active-projects" },
              { title: "Omzet deze maand", value: formatBudget(stats.monthlyRevenueCents), icon: TrendingUp, accent: "bg-emerald-500", testId: "kpi-monthly-revenue" },
              { title: "Openstaand", value: formatBudget(stats.outstandingCents), icon: Receipt, accent: "bg-amber-500", testId: "kpi-outstanding-invoices" },
              { title: "Verlopen taken", value: stats.overdueTasks, icon: AlertCircle, accent: stats.overdueTasks > 0 ? "bg-red-500" : "bg-emerald-500", testId: "kpi-overdue-tasks", subtitle: stats.overdueTasks > 0 ? "vereist aandacht" : "alles op schema" },
            ] as const).map((kpi) => <KpiCard key={kpi.testId} {...kpi} />)}
          </div>

          {/* Contract Pipeline — full width */}
          {pipeline && <ContractPipeline data={pipeline} />}

          {/* Daily actions + Utilization row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DailyActionsPanel
                actions={buildDailyActions(
                  recentProjects as unknown as ProjectResponse[],
                  allInvoices,
                  pipeline,
                  upcomingTasks
                )}
              />
            </div>

            {/* Staff utilization gauge */}
            <UtilizationGauge
              percent={stats.staffUtilization.utilization_percent}
              assignedHours={stats.staffUtilization.assigned_hours}
              availableHours={stats.staffUtilization.available_hours}
            />
          </div>

          {/* Content grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 stagger-children">
            {/* Recent Projects */}
            <Card className="card-gradient-border">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="h-5 w-1 rounded-full bg-blue-500" />
                  Recente Projecten
                </CardTitle>
                <Link href="/dashboard/projects">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-muted-foreground"
                  >
                    Alles bekijken
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {recentProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FolderKanban className="h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Nog geen projecten.
                    </p>
                    <Link href="/dashboard/projects/new">
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Eerste project aanmaken
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <ul
                    className="space-y-0.5"
                    data-testid="recent-activity-list"
                  >
                    {recentProjects.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/dashboard/projects/${p.id}`}
                          className="flex items-center justify-between rounded-lg px-3 py-2.5 -mx-3 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[p.status] ?? "bg-gray-400"}`}
                            />
                            <span className="font-medium text-sm truncate">
                              {p.name}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 ml-3">
                            {p.updated_at ? formatDate(p.updated_at) : ""}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Tasks */}
            <Card className="card-gradient-border">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="h-5 w-1 rounded-full bg-emerald-500" />
                  Aankomende Taken
                </CardTitle>
                <Link href="/dashboard/agenda">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-muted-foreground"
                  >
                    Agenda openen
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {upcomingTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Calendar className="h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Geen aankomende taken.
                    </p>
                  </div>
                ) : (
                  <ul
                    className="space-y-0.5"
                    data-testid="upcoming-tasks-list"
                  >
                    {upcomingTasks.slice(0, 6).map((t) => (
                      <li
                        key={`${t.task_id}-${t.date}`}
                        className="flex items-start gap-3 rounded-lg px-3 py-2.5 -mx-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">
                              {t.name}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatDate(t.date)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {t.project_name}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
