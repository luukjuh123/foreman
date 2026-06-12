"use client";

import { usePathname } from "next/navigation";

const PATH_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/agenda": "Agenda",
  "/dashboard/projects": "Projecten",
  "/dashboard/quotes": "Offertes",
  "/dashboard/customers": "Klanten",
  "/dashboard/invoices": "Facturen",
  "/dashboard/btw": "BTW",
  "/dashboard/processes": "Processen",
  "/dashboard/time-tracking": "Tijdregistratie",
  "/dashboard/materials": "Materialen",
  "/dashboard/materials/availability": "Beschikbaarheid",
  "/dashboard/subcontractors": "Onderaannemers",
  "/dashboard/staff": "Personeel",
  "/dashboard/equipment": "Gereedschap",
  "/dashboard/financials": "Financiën",
  "/dashboard/reports": "Rapporten",
  "/dashboard/reviews": "Reviews",
  "/dashboard/notifications": "Notificaties",
  "/dashboard/voice": "Voice",
  "/dashboard/settings": "Instellingen",
};

function deriveLabelFromPathname(pathname: string): string {
  // Exact match first
  if (PATH_LABELS[pathname]) return PATH_LABELS[pathname];

  // Find the longest matching prefix
  const sorted = Object.keys(PATH_LABELS).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (pathname.startsWith(key + "/") || pathname === key) {
      return PATH_LABELS[key];
    }
  }

  return "Dashboard";
}

export function TopbarBreadcrumb() {
  const pathname = usePathname();
  const label = deriveLabelFromPathname(pathname);

  return (
    <span className="text-sm font-semibold text-foreground">
      {label}
    </span>
  );
}
