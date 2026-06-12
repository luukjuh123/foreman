"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  FolderKanban,
  Wrench,
  BarChart3,
  FileText,
  Users,
  Package,
  TrendingUp,
  Hammer,
  Star,
  Bell,
  Mic,
  Settings,
  Menu,
  X,
  Receipt,
  UserCheck,
  HardHat,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  /** Undefined = ungrouped (no section label rendered) */
  section?: string;
  items: NavItem[];
  /** Renders a top separator line before the group */
  separator?: boolean;
};

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Agenda", href: "/dashboard/agenda", icon: Calendar },
    ],
  },
  {
    section: "Projecten",
    items: [
      { label: "Projecten", href: "/dashboard/projects", icon: FolderKanban },
      { label: "Processen", href: "/dashboard/processes", icon: Wrench },
      { label: "Rapporten", href: "/dashboard/reports", icon: BarChart3 },
    ],
  },
  {
    section: "Contracteren",
    items: [
      { label: "Offertes", href: "/dashboard/quotes", icon: ClipboardList },
      { label: "Klanten", href: "/dashboard/customers", icon: UserCheck },
      { label: "Facturen", href: "/dashboard/invoices", icon: FileText },
    ],
  },
  {
    section: "Financieel",
    items: [
      { label: "Financiën", href: "/dashboard/financials", icon: TrendingUp },
      { label: "BTW Aangifte", href: "/dashboard/btw", icon: Receipt },
    ],
  },
  {
    section: "Inkoop",
    items: [
      { label: "Materialen", href: "/dashboard/materials", icon: Package },
      {
        label: "Beschikbaarheid",
        href: "/dashboard/materials/availability",
        icon: Package,
      },
      { label: "Gereedschap", href: "/dashboard/equipment", icon: Hammer },
    ],
  },
  {
    section: "Team",
    items: [
      { label: "Personeel", href: "/dashboard/staff", icon: Users },
      {
        label: "Onderaannemers",
        href: "/dashboard/subcontractors",
        icon: HardHat,
      },
    ],
  },
  {
    separator: true,
    items: [
      { label: "Reviews", href: "/dashboard/reviews", icon: Star },
      { label: "Meldingen", href: "/dashboard/notifications", icon: Bell },
      { label: "Spraakassistent", href: "/dashboard/voice", icon: Mic },
      { label: "Instellingen", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

// ─── Active-state helper ──────────────────────────────────────────────────────

function isActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(href + "/");
}

// ─── Nav content ─────────────────────────────────────────────────────────────

function NavContent({
  pathname,
  onItemClick,
}: {
  pathname: string;
  onItemClick: () => void;
}) {
  return (
    <nav className="flex flex-col flex-1 overflow-y-auto px-3 py-3 gap-1">
      {NAV_GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          {/* Separator before bottom block */}
          {group.separator && (
            <div className="my-2 border-t border-border" />
          )}

          {/* Section label */}
          {group.section && (
            <p className="mt-3 mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground select-none">
              {group.section}
            </p>
          )}

          {/* Items */}
          {group.items.map(({ label, href, icon: Icon }) => {
            const active = isActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={onItemClick}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {/* Left accent indicator for active item */}
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary-foreground opacity-70" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );
}

// ─── Sidebar header ───────────────────────────────────────────────────────────

function SidebarHeader() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold select-none">
        F
      </div>
      <span className="font-semibold text-foreground tracking-tight">
        Foreman
      </span>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed left-4 top-4 z-50 rounded-md p-2 md:hidden bg-card border border-border"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          data-testid="mobile-overlay"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-64 flex-col bg-card border-r border-border transition-transform md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarHeader />
        <NavContent pathname={pathname} onItemClick={close} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-border bg-card h-screen sticky top-0">
        <SidebarHeader />
        <NavContent pathname={pathname} onItemClick={() => {}} />
      </aside>
    </>
  );
}
