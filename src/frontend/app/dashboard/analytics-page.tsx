"use client";

import React, { useEffect, useState } from "react";
import { DashboardAnalyticsCards } from "@/components/dashboard/analytics-cards";
import { fetchDashboardAnalytics } from "@/lib/analytics";
import type { DashboardAnalyticsResponse } from "@/lib/analytics";

/**
 * Standalone analytics page component — renders the four KPI metric cards
 * (Active Projects, Overdue Tasks, Monthly Revenue, Staff Utilization Rate)
 * using data from GET /api/v1/analytics/dashboard.
 *
 * Designed to be embedded in any dashboard layout or used as a standalone page.
 */
export default function DashboardAnalyticsPage() {
  const [data, setData] = useState<DashboardAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDashboardAnalytics()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Kernmetrieken van uw constructiebedrijf
        </p>
      </div>

      <DashboardAnalyticsCards data={data} loading={loading} error={error} />
    </div>
  );
}
