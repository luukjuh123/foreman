"use client";
import { usePathname } from "next/navigation";
import LegacyLayout from "@/components/planner/legacy-layout";
import { PlannerShell } from "@/components/planner/shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return usePathname() === "/dashboard" ? (
    <PlannerShell>{children}</PlannerShell>
  ) : (
    <LegacyLayout>{children}</LegacyLayout>
  );
}
