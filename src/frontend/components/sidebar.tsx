"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Mic,
  HardHat,
  ChevronDown,
  Receipt,
  ClipboardList,
  LogOut,
  ChevronsUpDown,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
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
    title: "Administratie",
    items: [
      { label: "Projecten", href: "/dashboard/projects", icon: FolderKanban },
      { label: "Klanten", href: "/dashboard/customers", icon: Users },
      { label: "Offertes", href: "/dashboard/quotes", icon: ClipboardList },
      { label: "Facturen", href: "/dashboard/invoices", icon: Receipt },
    ],
  },
  {
    title: "Planning",
    items: [
      { label: "Agenda", href: "/dashboard/agenda", icon: Calendar },
      { label: "Processen", href: "/dashboard/processes", icon: Wrench },
      { label: "Rapporten", href: "/dashboard/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Financieel",
    items: [
      { label: "Financien", href: "/dashboard/financials", icon: TrendingUp },
      { label: "BTW Aangifte", href: "/dashboard/btw", icon: FileText },
    ],
  },
  {
    title: "Team & Inkoop",
    items: [
      { label: "Personeel", href: "/dashboard/staff", icon: HardHat },
      { label: "Onderaannemers", href: "/dashboard/subcontractors", icon: Hammer },
      { label: "Materialen", href: "/dashboard/materials", icon: Package },
    ],
  },
  {
    title: "Overig",
    items: [
      { label: "Reviews", href: "/dashboard/reviews", icon: Star },
      { label: "Meldingen", href: "/dashboard/notifications", icon: Bell },
      { label: "Spraakassistent", href: "/dashboard/voice", icon: Mic },
      { label: "Instellingen", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

// ---------------------------------------------------------------------------
// Quick-create dropdown
// ---------------------------------------------------------------------------

const QUICK_CREATE_ITEMS = [
  { label: "Nieuw project", href: "/dashboard/projects/new", icon: FolderKanban },
  { label: "Nieuwe offerte", href: "/dashboard/quotes/new", icon: ClipboardList },
  { label: "Nieuwe factuur", href: "/dashboard/invoices/new", icon: Receipt },
];

function QuickCreate({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative px-3 mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Nieuw aanmaken
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg border bg-card shadow-lg overflow-hidden">
          {QUICK_CREATE_ITEMS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => { setOpen(false); onNavigate(); }}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent/50 transition-colors"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav section with collapsible groups
// ---------------------------------------------------------------------------

function NavSection({ group, pathname, onNavigate }: { group: NavGroup; pathname: string; onNavigate: () => void }) {
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
        group.items.map(({ label, href, icon: Icon, badge }) => {
          const active =
            pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
              )}
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground/70"
                )}
              />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User section
// ---------------------------------------------------------------------------

function UserSection() {
  return (
    <div className="border-t border-border/50 p-3">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50 transition-colors"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-xs font-bold shadow-sm">
          G
        </div>
        <div className="flex flex-1 flex-col items-start min-w-0">
          <span className="text-[13px] font-semibold text-foreground truncate w-full text-left">
            Gebruiker
          </span>
          <span className="text-[11px] text-muted-foreground/70 truncate w-full text-left">
            Starter Plan
          </span>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

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
    <div className="flex h-16 items-center gap-3 border-b border-border/40 px-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm shadow-primary/20">
        <HardHat className="h-5 w-5" />
      </div>
      <div className="flex flex-col">
        <span className="text-[15px] font-bold tracking-tight text-foreground">
          Foreman
        </span>
        <span className="text-[10px] font-medium text-muted-foreground/60">
          Bouwmanagement
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
        <div className="pt-3">
          <QuickCreate onNavigate={() => setOpen(false)} />
        </div>
        {nav}
        <UserSection />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-[272px] shrink-0 border-r border-border/40 bg-card/40 backdrop-blur-sm h-screen sticky top-0">
        {brand}
        <div className="pt-3">
          <QuickCreate onNavigate={() => {}} />
        </div>
        {nav}
        <UserSection />
      </aside>
    </>
  );
}
