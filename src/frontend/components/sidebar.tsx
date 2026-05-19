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
  BarChart3,
  BookOpen,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projecten", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Agenda", href: "/dashboard/agenda", icon: Calendar },
  { label: "Facturen", href: "/dashboard/invoices", icon: FileText },
  { label: "Financiën", href: "/dashboard/financials", icon: TrendingUp },
  { label: "Materialen", href: "/dashboard/materials", icon: Package },
  { label: "Beschikbaarheid", href: "/dashboard/materials/availability", icon: Package },
  { label: "Processen", href: "/dashboard/processes", icon: Wrench },
  { label: "Personeel", href: "/dashboard/staff", icon: Users },
  { label: "Rapporten", href: "/dashboard/reports", icon: BarChart3 },
  { label: "Boekhouding", href: "/dashboard/financials", icon: BookOpen },
  { label: "Instellingen", href: "/dashboard/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const nav = (
    <nav className="flex flex-col gap-1 px-2 py-4">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
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
    </nav>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed left-4 top-4 z-50 rounded-md p-2 md:hidden bg-card border"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-full w-64 bg-card border-r transition-transform md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold text-foreground">Foreman</span>
        </div>
        {nav}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r bg-card h-screen sticky top-0">
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold text-foreground">Foreman</span>
        </div>
        {nav}
      </aside>
    </>
  );
}
