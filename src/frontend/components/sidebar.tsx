"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Calendar,
  FileText,
  TrendingUp,
  Package,
  Wrench,
  Users,
  Hammer,
  BarChart3,
  Star,
  Settings,
  Menu,
  X,
  Bell,
  HardHat,
  ChevronDown,
  Receipt,
  ClipboardList,
  Plus,
  ArrowRight,
  Search,
  FileSignature,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Projecten & Contracten",
    items: [
      { label: "Projecten", href: "/dashboard/projects", icon: FolderKanban },
      { label: "Offertes", href: "/dashboard/quotes", icon: ClipboardList },
      { label: "Contracten", href: "/dashboard/contracts", icon: FileSignature },
      { label: "Facturen", href: "/dashboard/invoices", icon: Receipt },
      { label: "Klanten", href: "/dashboard/customers", icon: Users },
    ],
  },
  {
    title: "Planning & Team",
    items: [
      { label: "Agenda", href: "/dashboard/agenda", icon: Calendar },
      { label: "Personeel", href: "/dashboard/staff", icon: HardHat },
      { label: "Onderaannemers", href: "/dashboard/subcontractors", icon: Hammer },
    ],
  },
  {
    title: "Financieel",
    items: [
      { label: "Financiën", href: "/dashboard/financials", icon: TrendingUp },
      { label: "BTW Aangifte", href: "/dashboard/btw", icon: FileText },
      { label: "Rapporten", href: "/dashboard/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Hulpmiddelen",
    items: [
      { label: "Materialen", href: "/dashboard/materials", icon: Package },
      { label: "Processen", href: "/dashboard/processes", icon: Wrench },
      { label: "Reviews", href: "/dashboard/reviews", icon: Star },
      { label: "Instellingen", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

function NavSection({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const collapsible = group.title !== "";

  return (
    <div className="space-y-0.5">
      {group.title && (
        <button
          type="button"
          onClick={() => collapsible && setCollapsed((v) => !v)}
          className={cn(
            "flex w-full items-center justify-between px-3 pt-5 pb-1.5",
            collapsible && "cursor-pointer hover:text-foreground"
          )}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            {group.title}
          </span>
          {collapsible && (
            <ChevronDown
              className={cn(
                "h-3 w-3 text-muted-foreground/40 transition-transform duration-200",
                collapsed && "-rotate-90"
              )}
            />
          )}
        </button>
      )}
      {!collapsed &&
        group.items.map(({ label, href, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200",
                active
                  ? "bg-primary/[0.08] text-primary nav-active-glow"
                  : "text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                  active
                    ? "bg-primary/15 shadow-sm shadow-primary/10"
                    : "bg-transparent group-hover:bg-muted/60"
                )}
              >
                <Icon
                  className={cn(
                    "h-[16px] w-[16px] transition-all duration-200",
                    active
                      ? "text-primary"
                      : "text-muted-foreground/50 group-hover:text-foreground/70"
                  )}
                />
              </div>
              <span className="flex-1">{label}</span>
              {active && (
                <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              )}
            </Link>
          );
        })}
    </div>
  );
}

function SearchTrigger() {
  return (
    <div className="px-3 pt-3 pb-1">
      <button
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true })
          );
        }}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground/60 hover:bg-muted/50 hover:text-muted-foreground transition-all"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left text-xs">Zoeken...</span>
        <kbd className="rounded border border-border/50 bg-card px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/40">
          &#8984;K
        </kbd>
      </button>
    </div>
  );
}

function QuickCreateSection({ onNavigate }: { onNavigate: () => void }) {
  const actions = [
    {
      label: "Project",
      href: "/dashboard/projects/new",
      icon: FolderKanban,
      color: "text-primary",
      bg: "bg-primary/10",
      hoverBg: "group-hover:bg-primary/20",
    },
    {
      label: "Offerte",
      href: "/dashboard/quotes/new",
      icon: ClipboardList,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      hoverBg: "group-hover:bg-blue-500/20",
    },
    {
      label: "Factuur",
      href: "/dashboard/invoices/new",
      icon: Receipt,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      hoverBg: "group-hover:bg-emerald-500/20",
    },
    {
      label: "Klant",
      href: "/dashboard/customers?new=1",
      icon: Plus,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      hoverBg: "group-hover:bg-violet-500/20",
    },
  ];

  return (
    <div className="px-3 pt-2 pb-1">
      <div className="grid grid-cols-4 gap-1">
        {actions.map(({ label, href, icon: Icon, color, bg, hoverBg }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-muted-foreground hover:text-foreground transition-all duration-200 group"
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110 group-hover:shadow-sm",
                bg,
                hoverBg,
                color
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span className="text-[10px] font-bold">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contract pipeline mini-tracker — always visible in sidebar
// ---------------------------------------------------------------------------

interface PipelineStats {
  quotes: number;
  projects: number;
  invoices: number;
  paidCents: number;
}

function ContractFlowMini() {
  const [stats, setStats] = React.useState<PipelineStats | null>(null);

  React.useEffect(() => {
    Promise.all([
      apiFetch<{ total: number }>("/quotes/?per_page=1").catch(() => ({ total: 0 })),
      apiFetch<{ total: number }>("/projects?per_page=1").catch(() => ({ total: 0 })),
      apiFetch<{ data: Array<{ status: string; total_cents: number }> }>("/invoices/?per_page=200").catch(() => ({ data: [] })),
    ]).then(([q, p, inv]) => {
      const invoices = inv.data ?? [];
      const paidCents = invoices
        .filter((i) => i.status === "paid")
        .reduce((s, i) => s + (i.total_cents ?? 0), 0);
      setStats({
        quotes: q.total ?? 0,
        projects: p.total ?? 0,
        invoices: invoices.length,
        paidCents,
      });
    });
  }, []);

  if (!stats) return null;

  const total = stats.quotes + stats.projects + stats.invoices;
  const steps = [
    { label: "Offertes", count: stats.quotes, color: "bg-blue-500", textColor: "text-blue-500", icon: ClipboardList },
    { label: "Projecten", count: stats.projects, color: "bg-primary", textColor: "text-primary", icon: FolderKanban },
    { label: "Facturen", count: stats.invoices, color: "bg-emerald-500", textColor: "text-emerald-500", icon: Receipt },
  ];

  return (
    <Link href="/dashboard/contracts" className="block mx-3 mb-2">
      <div className="rounded-xl border border-border/30 bg-gradient-to-br from-muted/20 via-transparent to-primary/[0.03] p-3 hover:border-primary/20 hover:shadow-md transition-all duration-300 group relative overflow-hidden">
        {/* Ambient glow on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
              Pipeline
            </p>
            <div className="flex items-center gap-1.5">
              {total > 0 && (
                <span className="text-[9px] font-bold text-muted-foreground/30">{total} actief</span>
              )}
              <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all duration-200" />
            </div>
          </div>

          {/* Progress bar — combined */}
          {total > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/20 mb-3 gap-px">
              {steps.map((step) => {
                const pct = total > 0 ? (step.count / total) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={step.label}
                    className={cn("h-full rounded-full first:rounded-l-full last:rounded-r-full transition-all duration-500", step.color)}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>
          )}

          {/* Step flow */}
          <div className="flex items-center">
            {steps.map((step, i) => (
              <React.Fragment key={step.label}>
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300",
                    step.count > 0
                      ? `${step.color}/15 ${step.textColor} group-hover:shadow-sm`
                      : "bg-muted/30 text-muted-foreground/30"
                  )}>
                    <step.icon className="h-3.5 w-3.5" />
                  </div>
                  <p className={cn(
                    "text-[14px] font-black leading-none mt-1.5 transition-all duration-300",
                    step.count === 0 ? "text-muted-foreground/30" : "text-foreground group-hover:text-primary"
                  )}>
                    {step.count}
                  </p>
                  <p className="text-[8px] font-medium text-muted-foreground/40 mt-0.5 leading-none">{step.label}</p>
                </div>
                {i < steps.length - 1 && (
                  <div className="flex items-center px-0.5 -mt-4">
                    <div className={cn(
                      "h-px w-4 transition-all duration-300",
                      step.count > 0 && steps[i + 1].count > 0
                        ? "bg-gradient-to-r from-border/60 to-border/60 group-hover:from-primary/30 group-hover:to-primary/30"
                        : "bg-border/20"
                    )} />
                    <svg viewBox="0 0 6 10" className={cn("h-2 w-1.5 -ml-px transition-colors duration-300", step.count > 0 ? "text-border/40 group-hover:text-primary/40" : "text-border/20")}>
                      <path d="M1 1L5 5L1 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Paid amount — bottom line */}
          {stats.paidCents > 0 && (
            <div className="flex items-center justify-center gap-1.5 mt-3 pt-2.5 border-t border-border/20">
              <span className="text-[9px] text-muted-foreground/40">Ontvangen:</span>
              <span className="text-[11px] font-bold text-emerald-500">
                {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(stats.paidCents / 100)}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function UserSection() {
  return (
    <div className="border-t border-border/30 p-3">
      <Link
        href="/dashboard/settings"
        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-muted/40 transition-all duration-200 group"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-amber-600 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25">
          MB
        </div>
        <div className="flex flex-1 flex-col items-start min-w-0">
          <span className="text-[13px] font-bold text-foreground truncate w-full text-left">
            Mijn bedrijf
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold text-primary uppercase tracking-wider">
              Pro
            </span>
          </div>
        </div>
        <Settings className="h-4 w-4 text-muted-foreground/30 shrink-0 group-hover:rotate-90 group-hover:text-primary transition-all duration-300" />
      </Link>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-3 py-2 overflow-y-auto flex-1 scrollbar-thin">
      {NAV_GROUPS.map((group) => (
        <NavSection
          key={group.title || "home"}
          group={group}
          pathname={pathname}
          onNavigate={() => setOpen(false)}
        />
      ))}
    </nav>
  );

  const brand = (
    <div className="relative h-[72px] flex items-center gap-3.5 border-b border-border/30 px-5 overflow-hidden">
      {/* Ambient glow behind logo */}
      <div className="absolute -left-4 top-1/2 -translate-y-1/2 h-24 w-24 rounded-full bg-primary/[0.08] blur-2xl" />
      <div className="absolute left-12 top-0 h-16 w-16 rounded-full bg-amber-500/[0.04] blur-xl" />

      <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl brand-logo text-primary-foreground">
        <HardHat className="h-5.5 w-5.5 drop-shadow-sm" />
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card pulse-dot" />
      </div>
      <div className="relative flex flex-col">
        <span className="text-[17px] font-black tracking-tight text-foreground leading-tight">
          Foreman
        </span>
        <span className="text-[9px] font-bold text-primary/60 uppercase tracking-[0.2em] leading-tight">
          Bouwbeheer
        </span>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed left-4 top-4 z-50 rounded-lg p-2 md:hidden bg-card border shadow-sm"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-full w-[272px] bg-card/95 backdrop-blur-xl border-r transition-transform duration-200 md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {brand}
        <SearchTrigger />
        <QuickCreateSection onNavigate={() => setOpen(false)} />
        {nav}
        <ContractFlowMini />
        <UserSection />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-[272px] shrink-0 border-r border-border/40 bg-card/50 backdrop-blur-md h-screen sticky top-0">
        {brand}
        <SearchTrigger />
        <QuickCreateSection onNavigate={() => {}} />
        {nav}
        <ContractFlowMini />
        <UserSection />
      </aside>
    </>
  );
}
