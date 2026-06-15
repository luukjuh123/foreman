"use client";

import React, { useEffect, useState, useMemo } from "react";
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
  AlertTriangle,
  ExternalLink,
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
  invoice_number?: string;
  customer_id?: string;
  status: "draft" | "sent" | "paid" | "overdue";
  total_cents: number;
  paid_at: string | null;
  due_date?: string;
  issue_date?: string;
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
  overdueInvoiceCount: number;
  staffUtilization: StaffUtilization;
}

interface QuoteSummary {
  id: string;
  quote_number?: string;
  customer_name?: string;
  status: string;
  total_cents: number;
  valid_until?: string;
}

function isOverdue(task: { status: string; end_date?: string | null }): boolean {
  if (task.status === "done") return false;
  if (!task.end_date) return false;
  return new Date(task.end_date) < new Date();
}

function computeStats(
  projects: ProjectResponse[],
  invoices: InvoiceSummary[],
  staffUtilization: StaffUtilization,
): DashboardStats {
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const overdueTasks = projects
    .flatMap((p) => p.phases ?? [])
    .flatMap((ph) => ph.tasks ?? [])
    .filter(isOverdue).length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenueCents = invoices
    .filter(
      (inv) =>
        inv.status === "paid" &&
        inv.paid_at != null &&
        inv.paid_at.slice(0, 7) === thisMonth
    )
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0);
  const outstandingCents = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0);
  const overdueInvoiceCount = invoices.filter((inv) => inv.status === "overdue").length;
  return { activeProjects, overdueTasks, monthlyRevenueCents, outstandingCents, overdueInvoiceCount, staffUtilization };
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  draft: "bg-gray-400",
  completed: "bg-blue-500",
  archived: "bg-gray-300",
};

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  subtitle?: string;
  testId?: string;
}

function KpiCard({ title, value, icon: Icon, accent, subtitle, testId }: KpiCardProps) {
  return (
    <Card className="relative overflow-hidden group hover:shadow-md transition-shadow duration-200">
      <div className={cn("absolute left-0 top-0 h-full w-1", accent)} />
      <CardContent className="relative flex items-center gap-4 p-5">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", `${accent}/10`)}>
          <Icon className={cn("h-5 w-5", accent.replace("bg-", "text-"))} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl font-bold tracking-tight mt-0.5" data-testid={testId}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Needs Attention Widget
// ---------------------------------------------------------------------------

interface AttentionItem {
  id: string;
  type: "overdue_invoice" | "expiring_quote" | "overdue_task" | "project_deadline";
  title: string;
  description: string;
  href: string;
  urgency: "critical" | "warning";
}

function NeedsAttentionWidget({
  invoices,
  quotes,
  projects,
}: {
  invoices: InvoiceSummary[];
  quotes: QuoteSummary[];
  projects: ProjectResponse[];
}) {
  const items = useMemo(() => {
    const result: AttentionItem[] = [];
    const now = new Date();

    // Overdue invoices
    const overdueInvoices = invoices.filter((i) => i.status === "overdue");
    for (const inv of overdueInvoices.slice(0, 3)) {
      result.push({
        id: `inv-${inv.id}`,
        type: "overdue_invoice",
        title: `Factuur ${inv.invoice_number ?? inv.id.slice(0, 8)} is verlopen`,
        description: formatBudget(inv.total_cents),
        href: `/dashboard/invoices/${inv.id}`,
        urgency: "critical",
      });
    }

    // Quotes expiring within 7 days
    for (const q of quotes) {
      if (q.status !== "sent" || !q.valid_until) continue;
      const diff = new Date(q.valid_until).getTime() - now.getTime();
      if (diff > 0 && diff < 7 * 24 * 60 * 60 * 1000) {
        result.push({
          id: `quote-${q.id}`,
          type: "expiring_quote",
          title: `Offerte ${q.quote_number ?? ""} verloopt binnenkort`,
          description: q.customer_name ?? formatBudget(q.total_cents),
          href: `/dashboard/quotes`,
          urgency: "warning",
        });
      }
    }

    // Projects near deadline (within 7 days)
    for (const p of projects) {
      if (p.status !== "active" || !p.end_date) continue;
      const daysLeft = Math.ceil(
        (new Date(p.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft < 0) {
        result.push({
          id: `proj-${p.id}`,
          type: "project_deadline",
          title: `${p.name} is over de deadline`,
          description: `${Math.abs(daysLeft)} dagen te laat`,
          href: `/dashboard/projects/${p.id}`,
          urgency: "critical",
        });
      } else if (daysLeft <= 7) {
        result.push({
          id: `proj-${p.id}`,
          type: "project_deadline",
          title: `${p.name} nadert deadline`,
          description: `Nog ${daysLeft} dag${daysLeft !== 1 ? "en" : ""}`,
          href: `/dashboard/projects/${p.id}`,
          urgency: "warning",
        });
      }
    }

    return result.slice(0, 5);
  }, [invoices, quotes, projects]);

  if (items.length === 0) return null;

  return (
    <Card className="border-amber-500/20 bg-amber-500/[0.02]">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </div>
        <div>
          <CardTitle className="text-base font-semibold">Actie vereist</CardTitle>
          <p className="text-[11px] text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""} vereisen uw aandacht</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 -mx-1 hover:bg-accent/50 transition-colors group"
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                item.urgency === "critical"
                  ? "bg-red-500/10"
                  : "bg-amber-500/10"
              )}
            >
              {item.type === "overdue_invoice" && (
                <Receipt className={cn("h-4 w-4", item.urgency === "critical" ? "text-red-500" : "text-amber-500")} />
              )}
              {item.type === "expiring_quote" && (
                <ClipboardList className="h-4 w-4 text-amber-500" />
              )}
              {item.type === "project_deadline" && (
                <Clock className={cn("h-4 w-4", item.urgency === "critical" ? "text-red-500" : "text-amber-500")} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Funnel
// ---------------------------------------------------------------------------

interface PipelineData {
  quotesOpen: number;
  quoteValueCents: number;
  projectsActive: number;
  projectValueCents: number;
  invoicedCents: number;
  paidCents: number;
}

function PipelineFunnel({ data }: { data: PipelineData }) {
  const steps = [
    {
      label: "Offertes",
      sublabel: `${data.quotesOpen} openstaand`,
      value: formatBudget(data.quoteValueCents),
      icon: ClipboardList,
      color: "bg-blue-500",
      bgColor: "bg-blue-500/10",
      textColor: "text-blue-600 dark:text-blue-400",
      width: "100%",
    },
    {
      label: "Actieve projecten",
      sublabel: `${data.projectsActive} projecten`,
      value: formatBudget(data.projectValueCents),
      icon: FolderKanban,
      color: "bg-primary",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
      width: data.quoteValueCents > 0
        ? `${Math.max(30, Math.round((data.projectValueCents / data.quoteValueCents) * 100))}%`
        : "75%",
    },
    {
      label: "Gefactureerd",
      sublabel: "totaal verzonden",
      value: formatBudget(data.invoicedCents),
      icon: Send,
      color: "bg-amber-500",
      bgColor: "bg-amber-500/10",
      textColor: "text-amber-600 dark:text-amber-400",
      width: data.quoteValueCents > 0
        ? `${Math.max(20, Math.round((data.invoicedCents / data.quoteValueCents) * 100))}%`
        : "50%",
    },
    {
      label: "Ontvangen",
      sublabel: "betaald",
      value: formatBudget(data.paidCents),
      icon: CheckCircle2,
      color: "bg-emerald-500",
      bgColor: "bg-emerald-500/10",
      textColor: "text-emerald-600 dark:text-emerald-400",
      width: data.quoteValueCents > 0
        ? `${Math.max(15, Math.round((data.paidCents / data.quoteValueCents) * 100))}%`
        : "30%",
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Pipeline</CardTitle>
        <Link href="/dashboard/quotes">
          <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
            Offertes bekijken
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step) => (
          <div key={step.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", step.bgColor)}>
                  <step.icon className={cn("h-3.5 w-3.5", step.textColor)} />
                </div>
                <div>
                  <span className="text-xs font-medium">{step.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">{step.sublabel}</span>
                </div>
              </div>
              <span className="text-sm font-bold">{step.value}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", step.color)}
                style={{ width: step.width }}
              />
            </div>
          </div>
        ))}
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
  const [upcomingTasks, setUpcomingTasks] = useState<Array<AgendaTask & { date: string }>>([]);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [allInvoices, setAllInvoices] = useState<InvoiceSummary[]>([]);
  const [allQuotes, setAllQuotes] = useState<QuoteSummary[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const done = localStorage.getItem(ONBOARDING_KEY);
      if (!done) {
        router.push("/dashboard/onboarding");
      }
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const agendaFetch = fetchWeekAgenda().catch(() => null);
    const quotesFetch = apiFetch<{ data: QuoteSummary[] }>("/quotes/?per_page=200").catch(() => ({ data: [] }));

    Promise.all([
      listProjects(1, 100),
      apiFetch<InvoiceListData>("/invoices/?per_page=200"),
      apiFetch<StaffUtilization>("/staff/utilization"),
      agendaFetch,
      quotesFetch,
    ])
      .then(async ([projectsRes, invoicesRes, utilizationRes, _agenda, quotesRes]) => {
        if (cancelled) return;

        const invoices: InvoiceSummary[] = (invoicesRes as { data?: { data?: InvoiceSummary[] } })?.data?.data ?? [];
        const utilization: StaffUtilization = (utilizationRes as StaffUtilization) ?? {
          utilization_percent: 0,
          assigned_hours: 0,
          available_hours: 0,
        };
        setStats(computeStats(projectsRes.data, invoices, utilization));
        setAllInvoices(invoices);
        setAllProjects(projectsRes.data);

        const quotes = (quotesRes as { data: QuoteSummary[] }).data ?? [];
        setAllQuotes(quotes);

        const sorted = [...projectsRes.data].sort((a, b) => {
          const ta = (a as RecentProject).updated_at ?? "";
          const tb = (b as RecentProject).updated_at ?? "";
          return tb.localeCompare(ta);
        });
        setRecentProjects(sorted.slice(0, 5));

        // Pipeline
        const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");
        const activeProjects = projectsRes.data.filter((p) => p.status === "active");
        setPipeline({
          quotesOpen: openQuotes.length,
          quoteValueCents: openQuotes.reduce((s, q) => s + q.total_cents, 0),
          projectsActive: activeProjects.length,
          projectValueCents: activeProjects.reduce((s, p) => s + (p.budget_cents ?? 0), 0),
          invoicedCents: invoices.reduce((s, i) => s + (i.total_cents ?? 0), 0),
          paidCents: invoices
            .filter((i) => i.status === "paid")
            .reduce((s, i) => s + (i.total_cents ?? 0), 0),
        });

        const agenda = await agendaFetch;
        if (!cancelled && agenda) {
          const tasks: Array<AgendaTask & { date: string }> = [];
          for (const day of agenda.days) {
            for (const task of day.tasks) {
              if (task.status !== "done") {
                tasks.push({ ...task, date: day.date });
              }
            }
          }
          setUpcomingTasks(tasks);
        }

        setLoading(false);
      })
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

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Goedemorgen";
    if (h < 18) return "Goedemiddag";
    return "Goedenavond";
  })();

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 px-6 py-6 md:px-8 md:py-7">
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-foreground">
              {greeting}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Beheer uw projecten, offertes en facturen vanuit een overzicht.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <Link href="/dashboard/projects/new">
                <Button size="sm" className="gap-1.5 shadow-sm shadow-primary/20">
                  <Plus className="h-4 w-4" />
                  Nieuw project
                </Button>
              </Link>
              <Link href="/dashboard/quotes/new">
                <Button size="sm" variant="outline" className="gap-1.5 bg-card/50">
                  <ClipboardList className="h-4 w-4" />
                  Offerte
                </Button>
              </Link>
              <Link href="/dashboard/invoices/new">
                <Button size="sm" variant="outline" className="gap-1.5 bg-card/50">
                  <FileText className="h-4 w-4" />
                  Factuur
                </Button>
              </Link>
            </div>
          </div>

          {!loading && stats && (
            <div className="hidden md:grid grid-cols-2 gap-3 shrink-0">
              <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/40 px-4 py-3 min-w-[130px]">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Actieve projecten</p>
                <p className="text-xl font-bold mt-0.5">{stats.activeProjects}</p>
              </div>
              <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/40 px-4 py-3 min-w-[130px]">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Openstaand</p>
                <p className="text-xl font-bold mt-0.5">{formatBudget(stats.outstandingCents)}</p>
              </div>
            </div>
          )}
        </div>
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary/[0.04]" />
        <div className="absolute -right-4 top-14 h-28 w-28 rounded-full bg-primary/[0.03]" />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div data-testid="dashboard-loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Card key={i} className="relative overflow-hidden">
              <div className="absolute left-0 top-0 h-full w-1 bg-muted animate-pulse" />
              <CardContent className="p-5">
                <div className="h-3 w-20 animate-pulse rounded bg-muted mb-3" />
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              title="Actieve Projecten"
              value={stats.activeProjects}
              icon={FolderKanban}
              accent="bg-primary"
              testId="kpi-active-projects"
            />
            <KpiCard
              title="Verlopen Taken"
              value={stats.overdueTasks}
              icon={AlertCircle}
              accent={stats.overdueTasks > 0 ? "bg-destructive" : "bg-emerald-500"}
              testId="kpi-overdue-tasks"
            />
            <KpiCard
              title="Omzet deze maand"
              value={formatBudget(stats.monthlyRevenueCents)}
              icon={TrendingUp}
              accent="bg-emerald-500"
              testId="kpi-monthly-revenue"
            />
            <KpiCard
              title="Openstaand"
              value={formatBudget(stats.outstandingCents)}
              icon={Receipt}
              accent="bg-amber-500"
              testId="kpi-outstanding-invoices"
              subtitle={stats.overdueInvoiceCount > 0 ? `${stats.overdueInvoiceCount} verlopen` : undefined}
            />
            <KpiCard
              title="Bezetting"
              value={`${stats.staffUtilization.utilization_percent}%`}
              icon={Users}
              accent="bg-blue-500"
              testId="kpi-staff-utilization"
              subtitle={`${stats.staffUtilization.assigned_hours}/${stats.staffUtilization.available_hours} uur`}
            />
          </div>

          {/* Needs Attention */}
          <NeedsAttentionWidget
            invoices={allInvoices}
            quotes={allQuotes}
            projects={allProjects}
          />

          {/* Pipeline funnel + Recent Projects row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {pipeline && <PipelineFunnel data={pipeline} />}

            {/* Recent Projects */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-semibold">Recente Projecten</CardTitle>
                <Link href="/dashboard/projects">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                    Alles bekijken
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {recentProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FolderKanban className="h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">Nog geen projecten.</p>
                    <Link href="/dashboard/projects/new">
                      <Button size="sm" variant="outline" className="mt-3 gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Eerste project aanmaken
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <ul className="space-y-0.5" data-testid="recent-activity-list">
                    {recentProjects.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/dashboard/projects/${p.id}`}
                          className="flex items-center justify-between rounded-lg px-3 py-2.5 -mx-3 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT[p.status] ?? "bg-gray-400")} />
                            <span className="font-medium text-sm truncate">{p.name}</span>
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
          </div>

          {/* Upcoming Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Aankomende Taken</CardTitle>
              <Link href="/dashboard/agenda">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                  Agenda openen
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {upcomingTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Geen aankomende taken.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {upcomingTasks.slice(0, 6).map((t) => (
                    <div
                      key={`${t.task_id}-${t.date}`}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">{t.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDate(t.date)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{t.project_name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
