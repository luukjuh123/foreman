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
  Mic,
  FileSignature,
  UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projecten", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Contracten", href: "/dashboard/contracten", icon: FileSignature },
  { label: "Klanten", href: "/dashboard/klanten", icon: UserCircle2 },
  { label: "Agenda", href: "/dashboard/agenda", icon: Calendar },
  { label: "Facturen", href: "/dashboard/invoices", icon: FileText },
  { label: "Financiën", href: "/dashboard/financials", icon: TrendingUp },
  { label: "BTW Aangifte", href: "/dashboard/btw", icon: FileText },
  { label: "Materialen", href: "/dashboard/materials", icon: Package },
  { label: "Beschikbaarheid", href: "/dashboard/materials/availability", icon: Package },
  { label: "Processen", href: "/dashboard/processes", icon: Wrench },
  { label: "Personeel", href: "/dashboard/staff", icon: Users },
  { label: "Gereedschap", href: "/dashboard/equipment", icon: Hammer },
  { label: "Rapporten", href: "/dashboard/reports", icon: BarChart3 },
  { label: "Reviews", href: "/dashboard/reviews", icon: Star },
  { label: "Meldingen", href: "/dashboard/notifications", icon: Bell },
  { label: "Spraakassistent", href: "/dashboard/voice", icon: Mic },
  { label: "Instellingen", href: "/dashboard/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-2 py-4">
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
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
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
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="text-lg font-bold text-primary">F</span>
          <span className="font-semibold text-foreground">Foreman</span>
        </div>
        {nav}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r bg-card h-screen sticky top-0 overflow-y-auto">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="text-lg font-bold text-primary">F</span>
          <span className="font-semibold text-foreground">Foreman</span>
        </div>
        {nav}
      </aside>
    </>
  );
}
