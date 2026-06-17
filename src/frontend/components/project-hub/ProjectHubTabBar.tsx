"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  label: string;
  href: (projectId: string) => string;
  // A path segment that must appear (after the project id) for this tab to be active.
  // Empty string means the root project page is active.
  segment: string;
}

const TABS: Tab[] = [
  {
    label: "Overzicht",
    href: (id) => `/dashboard/projects/${id}`,
    segment: "",
  },
  {
    label: "Planning",
    href: (id) => `/dashboard/projects/${id}/board`,
    segment: "board",
  },
  {
    label: "Documenten",
    href: (id) => `/dashboard/projects/${id}/documenten`,
    segment: "documenten",
  },
  {
    label: "Financieel",
    href: (id) => `/dashboard/projects/${id}/financieel`,
    segment: "financieel",
  },
  {
    label: "Team",
    href: (id) => `/dashboard/projects/${id}/team`,
    segment: "team",
  },
];

interface Props {
  projectId: string;
}

export function ProjectHubTabBar({ projectId }: Props) {
  const pathname = usePathname();

  // Determine which tab is active based on the path segment after the project id.
  function isActive(tab: Tab): boolean {
    const base = `/dashboard/projects/${projectId}`;
    if (tab.segment === "") {
      // Overzicht is active only on the exact project root (no sub-segment).
      return pathname === base;
    }
    return pathname.startsWith(`${base}/${tab.segment}`);
  }

  return (
    <nav
      aria-label="Project navigatie"
      className="flex gap-1 border-b border-border"
    >
      {TABS.map((tab) => {
        const active = isActive(tab);
        return (
          <Link
            key={tab.label}
            href={tab.href(projectId)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors rounded-t-md",
              active
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
