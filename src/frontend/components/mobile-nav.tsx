"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Calendar,
  Bell,
  MoreHorizontal,
  FileText,
  TrendingUp,
  Package,
  Users,
  BarChart2,
  Settings,
  X,
  Receipt,
  UserRound,
  Wrench,
} from "lucide-react";

const PRIMARY_TABS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Projecten", href: "/dashboard/projects", icon: FolderKanban, exact: false },
  { label: "Agenda", href: "/dashboard/agenda", icon: Calendar, exact: false },
  { label: "Facturen", href: "/dashboard/invoices", icon: FileText, exact: false },
];

const MORE_ITEMS = [
  { label: "Financiën", href: "/dashboard/financials", icon: TrendingUp },
  { label: "BTW", href: "/dashboard/btw", icon: Receipt },
  { label: "Klanten", href: "/dashboard/customers", icon: UserRound },
  { label: "Materialen", href: "/dashboard/materials", icon: Package },
  { label: "Processen", href: "/dashboard/processes", icon: Wrench },
  { label: "Personeel", href: "/dashboard/staff", icon: Users },
  { label: "Rapporten", href: "/dashboard/reports", icon: BarChart2 },
  { label: "Meldingen", href: "/dashboard/notifications", icon: Bell },
  { label: "Instellingen", href: "/dashboard/settings", icon: Settings },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t bg-card md:hidden">
        {PRIMARY_TABS.map(({ label, href, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={label}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* Meer button */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Meer"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>Meer</span>
        </button>
      </nav>

      {/* Sheet overlay */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSheetOpen(false)}
          />
          {/* Sheet panel */}
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">Meer</span>
              <button
                onClick={() => setSheetOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Sluiten"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="grid grid-cols-3 gap-2">
              {MORE_ITEMS.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSheetOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Icon className="h-6 w-6" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
