"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  FolderKanban,
  Wrench,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  Bell,
  Receipt,
  FileBarChart,
  Hammer,
  ClipboardList,
  FileText,
  TrendingUp,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Projecten",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Projecten", href: "/dashboard/projects", icon: FolderKanban },
      { label: "Agenda", href: "/dashboard/agenda", icon: Calendar },
      { label: "Processen", href: "/dashboard/processes", icon: Wrench },
    ],
  },
  {
    heading: "Administratie",
    items: [
      { label: "Offertes", href: "/dashboard/quotes", icon: ClipboardList },
      { label: "Facturen", href: "/dashboard/invoices", icon: FileText },
      { label: "Rapporten", href: "/dashboard/reports", icon: BarChart3 },
      { label: "Onderaannemers", href: "/dashboard/subcontractors", icon: Hammer },
      { label: "Personeel", href: "/dashboard/staff", icon: Users },
    ],
  },
  {
    heading: "Financieel",
    items: [
      { label: "Financiën", href: "/dashboard/financials", icon: TrendingUp },
      { label: "BTW Aangifte", href: "/dashboard/btw", icon: Receipt },
      { label: "Materialen", href: "/dashboard/materials", icon: Package },
    ],
  },
  {
    heading: "Instellingen",
    items: [
      { label: "Instellingen", href: "/dashboard/settings", icon: Settings },
      { label: "Meldingen", href: "/dashboard/notifications", icon: Bell },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pt-2">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Nav content (shared between desktop sidebar and mobile drawer)
// ---------------------------------------------------------------------------

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col px-2 py-2">
      {NAV_SECTIONS.map((section) => (
        <div key={section.heading}>
          <SectionHeading>{section.heading}</SectionHeading>
          <div className="flex flex-col gap-0.5">
            {section.items.map(({ label, href, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

export default function Sidebar() {
  const [open, setOpen] = React.useState(false);

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
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-full w-64 bg-card border-r transition-transform md:hidden overflow-y-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold text-foreground">Foreman</span>
        </div>
        <NavContent onNavigate={() => setOpen(false)} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r bg-card h-screen sticky top-0 overflow-y-auto">
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold text-foreground">Foreman</span>
        </div>
        <NavContent />
      </aside>
    </>
  );
}
