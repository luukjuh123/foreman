"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FolderKanban, AlertCircle, TrendingUp, Receipt, Users, Plus,
  FileText, Calendar, ArrowRight, Clock, ClipboardList, CheckCircle2, Send,
} from "lucide-react";
import { listProjects, formatBudget } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse, AgendaTask } from "@/lib/types";
import { fetchWeekAgenda } from "@/lib/agenda";

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

function isOverdue(task: { status: string; end_date?: string | null }): boolean {
  if (task.status === "done") return false;
  if (!task.end_date) return false;
  return new Date(task.end_date) < new Date();
}

function computeStats(projects: ProjectResponse[], invoices: InvoiceSummary[], staffUtilization: StaffUtilization): DashboardStats {
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const overdueTasks = projects.flatMap((p) => p.phases ?? []).flatMap((ph) => ph.tasks ?? []).filter(isOverdue).length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenueCents = invoices
    .filter((inv) => inv.status === "paid" && inv.paid_at != null && inv.paid_at.slice(0, 7) === thisMonth)
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0);
  const outstandingCents = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0);
  return { activeProjects, overdueTasks, monthlyRevenueCents, outstandingCents, staffUtilization };
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
  const gradientMap: Record<string, string> = {
    "bg-primary": "from-primary/20 to-primary/5",
    "bg-destructive": "from-red-500/20 to-red-500/5",
    "bg-emerald-500": "from-emerald-500/20 to-emerald-500/5",
    "bg-amber-500": "from-amber-500/20 to-amber-500/5",
    "bg-blue-500": "from-blue-500/20 to-blue-500/5",
  };
  const gradient = gradientMap[accent] ?? "from-primary/20 to-primary/5";

  return (
    <Card className="relative overflow-hidden group hover:shadow-md transition-shadow duration-200">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      <div className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <CardContent className="relative flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accent}/10 ring-1 ring-inset ${accent}/20`}>
          <Icon className={`h-5 w-5 ${accent.replace("bg-", "text-")}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight mt-0.5" data-testid={testId}>{value}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pipeline funnel
// ---------------------------------------------------------------------------

interface PipelineData {
  quotesOpen: number;
  quoteValueCents: number;
  projectsActive: number;
  projectValueCents: number;
  invoicedCents: number;
  paidCents: number;
}

function ChevronArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 48" fill="none" className={className}>
      <path d="M8 8L16 24L8 40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
    </svg>
  );
}

function conversionRate(from: number, to: number): string {
  if (from === 0) return "—";
  return `${Math.round((to / from) * 100)}%`;
}

function PipelineFunnel({ data }: { data: PipelineData }) {
  const stages = [
    { label: "Offertes", sublabel: `${data.quotesOpen} openstaand`, value: formatBudget(data.quoteValueCents), rawCents: data.quoteValueCents, icon: ClipboardList, bgColor: "bg-blue-500/10", textColor: "text-blue-600 dark:text-blue-400", ringColor: "ring-blue-500/20", href: "/dashboard/quotes" },
    { label: "Projecten", sublabel: `${data.projectsActive} actief`, value: formatBudget(data.projectValueCents), rawCents: data.projectValueCents, icon: FolderKanban, bgColor: "bg-primary/10", textColor: "text-primary", ringColor: "ring-primary/20", href: "/dashboard/projects" },
    { label: "Gefactureerd", sublabel: "verzonden", value: formatBudget(data.invoicedCents), rawCents: data.invoicedCents, icon: Send, bgColor: "bg-amber-500/10", textColor: "text-amber-600 dark:text-amber-400", ringColor: "ring-amber-500/20", href: "/dashboard/invoices" },
    { label: "Ontvangen", sublabel: "betaald", value: formatBudget(data.paidCents), rawCents: data.paidCents, icon: CheckCircle2, bgColor: "bg-emerald-500/10", textColor: "text-emerald-600 dark:text-emerald-400", ringColor: "ring-emerald-500/20", href: "/dashboard/invoices" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Contractpipeline</CardTitle>
        <Link href="/dashboard/quotes">
          <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
            Offertes bekijken
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-0">
          {stages.map((stage, idx) => (
            <React.Fragment key={stage.label}>
              <Link href={stage.href} className="group">
                <div className="relative rounded-xl border border-border/50 p-4 hover:border-border hover:shadow-sm transition-all text-center">
                  <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-xl ${stage.bgColor} ring-1 ring-inset ${stage.ringColor} mb-3`}>
                    <stage.icon className={`h-5 w-5 ${stage.textColor}`} />
                  </div>
                  <p className="text-lg font-bold tracking-tight group-hover:text-primary transition-colors">{stage.value}</p>
                  <p className="text-xs font-medium mt-0.5">{stage.label}</p>
                  <p className="text-[10px] text-muted-foreground">{stage.sublabel}</p>
                </div>
              </Link>
              {idx < stages.length - 1 && (
                <div className="flex flex-col items-center px-1">
                  <ChevronArrow className="h-10 w-6 text-muted-foreground/40" />
                  <span className="text-[9px] font-medium text-muted-foreground/60 -mt-1">
                    {conversionRate(stages[idx].rawCents, stages[idx + 1].rawCents)}
                  </span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="md:hidden space-y-2">
          {stages.map((stage, idx) => (
            <Link key={stage.label} href={stage.href}>
              <div className="flex items-center gap-3 rounded-xl border border-border/50 p-3 hover:border-border transition-all">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stage.bgColor}`}>
                  <stage.icon className={`h-4 w-4 ${stage.textColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{stage.label} <span className="text-muted-foreground font-normal">{stage.sublabel}</span></p>
                  <p className="text-base font-bold tracking-tight">{stage.value}</p>
                </div>
                {idx < stages.length - 1 && (
                  <span className="text-[10px] font-medium text-muted-foreground/60 shrink-0">
                    {conversionRate(stage.rawCents, stages[idx + 1].rawCents)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
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
    const quotesFetch = apiFetch<{ data: Array<{ status: string; total_cents: number }> }>("/quotes/?per_page=200").catch(() => ({ data: [] }));

    Promise.all([
      listProjects(1, 100),
      apiFetch<InvoiceListData>("/invoices/?per_page=200"),
      apiFetch<StaffUtilization>("/staff/utilization"),
      agendaFetch,
      quotesFetch,
    ])
      .then(async ([projectsRes, invoicesRes, utilizationRes, _agenda, quotesRes]) => {
        if (!cancelled) {
          const invoices: InvoiceSummary[] = (invoicesRes as { data?: { data?: InvoiceSummary[] } })?.data?.data ?? [];
          const utilization: StaffUtilization = (utilizationRes as StaffUtilization) ?? { utilization_percent: 0, assigned_hours: 0, available_hours: 0 };
          setStats(computeStats(projectsRes.data, invoices, utilization));

          const sorted = [...projectsRes.data].sort((a, b) => {
            const ta = (a as RecentProject).updated_at ?? "";
            const tb = (b as RecentProject).updated_at ?? "";
            return tb.localeCompare(ta);
          });
          setRecentProjects(sorted.slice(0, 5));

          const quotes = (quotesRes as { data: Array<{ status: string; total_cents: number }> }).data ?? [];
          const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");
          const activeProjects = projectsRes.data.filter((p) => p.status === "active");
          setPipeline({
            quotesOpen: openQuotes.length,
            quoteValueCents: openQuotes.reduce((s, q) => s + q.total_cents, 0),
            projectsActive: activeProjects.length,
            projectValueCents: activeProjects.reduce((s, p) => s + (p.budget_cents ?? 0), 0),
            invoicedCents: invoices.reduce((s, i) => s + (i.total_cents ?? 0), 0),
            paidCents: invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total_cents ?? 0), 0),
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
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Goedemorgen";
    if (h < 18) return "Goedemiddag";
    return "Goedenavond";
  })();

  return (
    <div className="space-y-8">
      {/* Hero welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary/[0.06]" />
        <div className="absolute right-16 top-20 h-24 w-24 rounded-full bg-primary/[0.04]" />

        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-foreground">{greeting}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            {stats && (
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                    <FolderKanban className="h-3 w-3 text-primary" />
                  </span>
                  <span className="text-sm font-semibold">{stats.activeProjects}</span>
                  <span className="text-xs text-muted-foreground">actief</span>
                </div>
                <div className="h-4 w-px bg-border/60" />
                <div className="flex items-center gap-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                  </span>
                  <span className="text-sm font-semibold">{formatBudget(stats.monthlyRevenueCents)}</span>
                  <span className="text-xs text-muted-foreground">deze maand</span>
                </div>
                {stats.overdueTasks > 0 && (
                  <>
                    <div className="h-4 w-px bg-border/60" />
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/10">
                        <AlertCircle className="h-3 w-3 text-red-500" />
                      </span>
                      <span className="text-sm font-semibold text-red-500">{stats.overdueTasks}</span>
                      <span className="text-xs text-muted-foreground">verlopen</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/projects/new">
              <Button size="sm" className="gap-1.5 shadow-sm shadow-primary/20">
                <Plus className="h-4 w-4" />
                Nieuw project
              </Button>
            </Link>
            <Link href="/dashboard/quotes/new">
              <Button size="sm" variant="outline" className="gap-1.5 bg-card/50 backdrop-blur-sm">
                <ClipboardList className="h-4 w-4" />
                Offerte
              </Button>
            </Link>
            <Link href="/dashboard/invoices/new">
              <Button size="sm" variant="outline" className="gap-1.5 bg-card/50 backdrop-blur-sm">
                <FileText className="h-4 w-4" />
                Factuur
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div data-testid="dashboard-loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
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
        <div data-testid="dashboard-error" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gegevens konden niet worden geladen: {error}
        </div>
      )}

      {!loading && !error && stats && (
        <>
          {/* Action alerts */}
          {(stats.overdueTasks > 0 || stats.outstandingCents > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.overdueTasks > 0 && (
                <Link href="/dashboard/projects" className="group">
                  <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 hover:border-red-500/40 transition-all">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400">{stats.overdueTasks} verlopen {stats.overdueTasks === 1 ? "taak" : "taken"}</p>
                      <p className="text-[11px] text-muted-foreground">Directe actie vereist</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              )}
              {stats.outstandingCents > 0 && (
                <Link href="/dashboard/invoices" className="group">
                  <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 hover:border-amber-500/40 transition-all">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                      <Receipt className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{formatBudget(stats.outstandingCents)} openstaand</p>
                      <p className="text-[11px] text-muted-foreground">Facturen wachten op betaling</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              )}
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="Actieve Projecten" value={stats.activeProjects} icon={FolderKanban} accent="bg-primary" testId="kpi-active-projects" />
            <KpiCard title="Omzet deze maand" value={formatBudget(stats.monthlyRevenueCents)} icon={TrendingUp} accent="bg-emerald-500" testId="kpi-monthly-revenue" />
            <KpiCard title="Openstaand" value={formatBudget(stats.outstandingCents)} icon={Receipt} accent="bg-amber-500" testId="kpi-outstanding-invoices" />
            <KpiCard title="Bezetting" value={`${stats.staffUtilization.utilization_percent}%`} icon={Users} accent="bg-blue-500" testId="kpi-staff-utilization" subtitle={`${stats.staffUtilization.assigned_hours}/${stats.staffUtilization.available_hours} uur`} />
          </div>

          {/* Pipeline funnel */}
          {pipeline && <PipelineFunnel data={pipeline} />}

          {/* Content grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                      <Button size="sm" variant="outline" className="mt-3 gap-1.5"><Plus className="h-3.5 w-3.5" />Eerste project aanmaken</Button>
                    </Link>
                  </div>
                ) : (
                  <ul className="space-y-0.5" data-testid="recent-activity-list">
                    {recentProjects.map((p) => (
                      <li key={p.id}>
                        <Link href={`/dashboard/projects/${p.id}`} className="flex items-center justify-between rounded-lg px-3 py-2.5 -mx-3 hover:bg-accent/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[p.status] ?? "bg-gray-400"}`} />
                            <span className="font-medium text-sm truncate">{p.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 ml-3">{p.updated_at ? formatDate(p.updated_at) : ""}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

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
                  <ul className="space-y-0.5" data-testid="upcoming-tasks-list">
                    {upcomingTasks.slice(0, 6).map((t) => (
                      <li key={`${t.task_id}-${t.date}`} className="flex items-start gap-3 rounded-lg px-3 py-2.5 -mx-3 hover:bg-accent/50 transition-colors">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">{t.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatDate(t.date)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{t.project_name}</p>
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
