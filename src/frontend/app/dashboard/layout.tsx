"use client";

import React, { useEffect } from "react";
import { redirect } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import OfflineIndicator from "@/components/offline-indicator";
import PwaRegister from "@/components/pwa-register";
import MobileNav from "@/components/mobile-nav";
import MobileTimeTracker from "@/components/mobile-time-tracker";

const ACCESS_TOKEN_KEY = "foreman_access_token";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(ACCESS_TOKEN_KEY)
        : null;
    if (!token) {
      redirect("/login");
    }
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Spacer for mobile hamburger button */}
            <div className="w-10 md:hidden" />
            <span className="text-sm font-medium text-muted-foreground">
              Foreman
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              G
            </div>
          </div>
        </header>
        <OfflineIndicator />
        <PwaRegister />
        <main className="flex-1 p-4 pb-16 md:p-6 md:pb-6">{children}</main>
        <MobileTimeTracker projectId="" />
        <MobileNav />
      </div>
    </div>
  );
}
