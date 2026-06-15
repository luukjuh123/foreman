"use client";

import React, { useEffect, useState, useCallback } from "react";
import { redirect, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import OfflineIndicator from "@/components/offline-indicator";
import PwaRegister from "@/components/pwa-register";
import MobileNav from "@/components/mobile-nav";
import MobileTimeTracker from "@/components/mobile-time-tracker";
import NotificationBell from "@/components/notifications/NotificationBell";
import { useAuth } from "@/lib/auth-context";
import { ChevronRight, Search, X, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCESS_TOKEN_KEY = "foreman_access_token";

// ---------------------------------------------------------------------------
// Breadcrumb builder
// ---------------------------------------------------------------------------

interface Crumb {
  label: string;
  href: string;
}

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projecten",
  customers: "Klanten",
  quotes: "Offertes",
  invoices: "Facturen",
  financials: "Financien",
  btw: "BTW Aangifte",
  staff: "Personeel",
  subcontractors: "Onderaannemers",
  materials: "Materialen",
  equipment: "Gereedschap",
  reviews: "Reviews",
  notifications: "Meldingen",
  voice: "Spraakassistent",
  settings: "Instellingen",
  agenda: "Agenda",
  processes: "Processen",
  reports: "Rapporten",
  new: "Nieuw",
  board: "Takenbord",
  gantt: "Gantt",
  timeline: "Tijdlijn",
  "balance-sheet": "Balans",
  "income-statement": "Resultatenrekening",
  "cash-flow": "Cashflow",
  costs: "Kosten",
  margins: "Marges",
  export: "Export",
  payroll: "Salarisadministratie",
  loans: "Voorschotten",
  schedule: "Planning",
};

function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];

  let path = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    path += `/${seg}`;

    if (i === 0 && seg === "dashboard") {
      crumbs.push({ label: "Dashboard", href: "/dashboard" });
      continue;
    }

    if (/^[0-9a-f-]{36}$/i.test(seg)) {
      crumbs.push({ label: "Detail", href: path });
      continue;
    }

    const label = ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, href: path });
  }

  return crumbs;
}

// ---------------------------------------------------------------------------
// Quick search command palette
// ---------------------------------------------------------------------------

interface SearchResult {
  label: string;
  href: string;
  section: string;
}

const SEARCH_ROUTES: SearchResult[] = [
  { label: "Dashboard", href: "/dashboard", section: "Pagina's" },
  { label: "Projecten", href: "/dashboard/projects", section: "Pagina's" },
  { label: "Nieuw project", href: "/dashboard/projects/new", section: "Acties" },
  { label: "Klanten", href: "/dashboard/customers", section: "Pagina's" },
  { label: "Offertes", href: "/dashboard/quotes", section: "Pagina's" },
  { label: "Nieuwe offerte", href: "/dashboard/quotes/new", section: "Acties" },
  { label: "Facturen", href: "/dashboard/invoices", section: "Pagina's" },
  { label: "Nieuwe factuur", href: "/dashboard/invoices/new", section: "Acties" },
  { label: "Financien", href: "/dashboard/financials", section: "Pagina's" },
  { label: "BTW Aangifte", href: "/dashboard/btw", section: "Pagina's" },
  { label: "Personeel", href: "/dashboard/staff", section: "Pagina's" },
  { label: "Materialen", href: "/dashboard/materials", section: "Pagina's" },
  { label: "Agenda", href: "/dashboard/agenda", section: "Pagina's" },
  { label: "Rapporten", href: "/dashboard/reports", section: "Pagina's" },
  { label: "Instellingen", href: "/dashboard/settings", section: "Pagina's" },
];

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const filtered = query.trim()
    ? SEARCH_ROUTES.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : SEARCH_ROUTES.slice(0, 8);

  const handleSelect = useCallback(
    (href: string) => {
      onClose();
      setQuery("");
      router.push(href);
    },
    [onClose, router]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Zoek pagina's, acties..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground/50"
          />
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Geen resultaten voor &ldquo;{query}&rdquo;
            </p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.href}
                onClick={() => handleSelect(r.href)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-accent/50 transition-colors text-left"
              >
                <span className="font-medium">{r.label}</span>
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{r.section}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground/50">
          <span><kbd className="rounded border px-1 py-0.5 text-[9px]">Esc</kbd> sluiten</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User avatar
// ---------------------------------------------------------------------------

function UserAvatar() {
  const { user } = useAuth();
  const initials = user?.name
    ? user.name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <Link
      href="/dashboard/settings"
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-xs font-bold shadow-sm shadow-primary/20">
        {initials}
      </div>
      {user?.name && (
        <span className="hidden lg:block text-sm font-medium truncate max-w-[120px]">
          {user.name}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(ACCESS_TOKEN_KEY)
        : null;
    if (!token) {
      redirect("/login");
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const crumbs = buildBreadcrumbs(pathname);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border/40 bg-card/80 backdrop-blur-md px-4 md:px-6 gap-4">
          <div className="w-10 md:hidden" />

          {/* Breadcrumbs */}
          <nav className="hidden md:flex items-center gap-1 text-sm min-w-0 flex-1">
            {crumbs.map((crumb, i) => (
              <React.Fragment key={crumb.href}>
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                {i === crumbs.length - 1 ? (
                  <span className="font-medium text-foreground truncate">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors truncate">
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </nav>

          <div className="flex-1 md:hidden" />

          {/* Search trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="hidden md:flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors w-56"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left text-xs">Zoeken...</span>
            <kbd className="rounded border border-border/60 bg-card px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            <UserAvatar />
          </div>
        </header>
        <OfflineIndicator />
        <PwaRegister />
        <main className="flex-1 p-4 pb-16 md:p-6 md:pb-6">{children}</main>
        <MobileTimeTracker projectId="" />
        <MobileNav />
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
