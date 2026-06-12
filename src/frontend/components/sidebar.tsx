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
  Receipt,
  UserRound,
  Clock,
  Building2,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overzicht",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Agenda", href: "/dashboard/agenda", icon: Calendar },
    ],
  },
  {
    title: "Administratie",
    items: [
      { label: "Projecten", href: "/dashboard/projects", icon: FolderKanban },
      { label: "Offertes", href: "/dashboard/quotes", icon: ClipboardList },
      { label: "Klanten", href: "/dashboard/customers", icon: UserRound },
      { label: "Facturen", href: "/dashboard/invoices", icon: FileText },
      { label: "BTW", href: "/dashboard/btw", icon: Receipt },
    ],
  },
  {
    title: "Uitvoering",
    items: [
      { label: "Processen", href: "/dashboard/processes", icon: Wrench },
      { label: "Tijdregistratie", href: "/dashboard/time-tracking", icon: Clock },
      { label: "Materialen", href: "/dashboard/materials", icon: Package },
      { label: "Onderaannemers", href: "/dashboard/subcontractors", icon: Building2 },
      { label: "Personeel", href: "/dashboard/staff", icon: Users },
      { label: "Gereedschap", href: "/dashboard/equipment", icon: Hammer },
    ],
  },
  {
    title: "Financieel",
    items: [
      { label: "Financiën", href: "/dashboard/financials", icon: TrendingUp },
      { label: "Rapporten", href: "/dashboard/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Overig",
    items: [
      { label: "Reviews", href: "/dashboard/reviews", icon: Star },
      { label: "Notificaties", href: "/dashboard/notifications", icon: Bell },
      { label: "Voice", href: "/dashboard/voice", icon: Mic },
      { label: "Instellingen", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

function NavGroupSection({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-1">
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
        {group.title}
      </p>
      {group.items.map(({ label, href, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md mx-2 px-3 py-2 text-sm font-medium transition-colors",
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
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const navContent = (
    <nav className="flex flex-col gap-0 py-3 overflow-y-auto flex-1">
      {NAV_GROUPS.map((group) => (
        <NavGroupSection
          key={group.title}
          group={group}
          pathname={pathname}
          onNavigate={() => setOpen(false)}
        />
      ))}
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
          "fixed left-0 top-0 z-40 h-full w-64 bg-card border-r transition-transform md:hidden flex flex-col",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center border-b px-4 shrink-0">
          <span className="font-semibold text-foreground">Foreman</span>
        </div>
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r bg-card h-screen sticky top-0">
        <div className="flex h-14 items-center border-b px-4 shrink-0">
          <span className="font-semibold text-foreground">Foreman</span>
        </div>
        {navContent}
      </aside>
    </>
  );
}
