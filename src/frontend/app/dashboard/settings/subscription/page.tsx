"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, TrendingUp, Users, HardDrive, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface Subscription {
  id: string;
  tier: "free" | "starter" | "pro" | "enterprise";
  status: "active" | "trialing" | "past_due" | "cancelled";
  project_limit: number;
  current_period_end: string;
  trial_ends_at: string | null;
}

interface Usage {
  project_count: number;
  user_count: number;
  storage_bytes: number;
}

const TIER_LABELS: Record<string, string> = {
  free: "Gratis",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const TIER_PRICES: Record<string, string> = {
  free: "€0,00",
  starter: "€9,99",
  pro: "€29,99",
  enterprise: "Op maat",
};

const TIER_FEATURES: Record<string, string[]> = {
  free: ["5 projecten", "1 gebruiker", "1 GB opslag"],
  starter: ["20 projecten", "5 gebruikers", "10 GB opslag", "AI planning"],
  pro: ["50 projecten", "Onbeperkte gebruikers", "100 GB opslag", "AI planning", "Geavanceerde rapporten", "Prioriteitsondersteuning"],
  enterprise: ["Onbeperkte projecten", "Onbeperkte gebruikers", "Onbeperkte opslag", "Alle functies", "Dedicated ondersteuning"],
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actief",
  trialing: "Proefperiode",
  past_due: "Betaling achterstallig",
  cancelled: "Opgezegd",
};

const STATUS_CLASSES: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatStorage(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [sub, use] = await Promise.all([
          apiFetch<Subscription>("/billing/subscription"),
          apiFetch<Usage>("/billing/usage"),
        ]);
        if (!cancelled) {
          setSubscription(sub);
          setUsage(use);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleUpgrade(tier: "starter" | "pro") {
    setCheckoutLoading(true);
    try {
      const { checkout_url } = await apiFetch<{ checkout_url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ tier }),
      });
      window.location.href = checkout_url;
    } catch (e) {
      setError((e as Error).message);
      setCheckoutLoading(false);
    }
  }

  if (loading) {
    return (
      <div data-testid="subscription-loading" className="space-y-6">
        <div>
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
          <div className="mt-1 h-4 w-64 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-40 rounded-lg bg-muted animate-pulse" />
        <div className="h-40 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Abonnement</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!subscription || !usage) return null;

  const tierLabel = TIER_LABELS[subscription.tier] ?? subscription.tier;
  const statusLabel = STATUS_LABELS[subscription.status] ?? subscription.status;
  const statusClass = STATUS_CLASSES[subscription.status] ?? "";
  const features = TIER_FEATURES[subscription.tier] ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Abonnement</h1>
        <p className="text-muted-foreground mt-1">Beheer uw abonnement en gebruik</p>
      </div>

      {/* Trial banner */}
      {subscription.status === "trialing" && subscription.trial_ends_at && (
        <div
          data-testid="trial-banner"
          className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Uw proefperiode eindigt op {formatDate(subscription.trial_ends_at)}
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
              Upgraden om uw toegang te behouden.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => handleUpgrade("pro")}
            disabled={checkoutLoading}
          >
            Upgraden
          </Button>
        </div>
      )}

      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle>Huidig plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-foreground" data-testid="plan-tier-name">{tierLabel}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {TIER_PRICES[subscription.tier]} per maand
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            Huidige periode eindigt op{" "}
            <span data-testid="period-end-date" className="font-medium text-foreground">
              {formatDate(subscription.current_period_end)}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap pt-2">
            {subscription.tier !== "pro" && subscription.tier !== "enterprise" && (
              <Button onClick={() => handleUpgrade("pro")} disabled={checkoutLoading}>
                Upgraden naar Pro
              </Button>
            )}
            {subscription.tier === "free" && (
              <Button variant="outline" onClick={() => handleUpgrade("starter")} disabled={checkoutLoading}>
                Upgraden naar Starter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage stats */}
      <Card>
        <CardHeader>
          <CardTitle>Gebruik</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <TrendingUp className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold" data-testid="usage-project-count">
                  {usage.project_count}
                </p>
                <p className="text-sm text-muted-foreground">
                  Projecten
                  {subscription.project_limit > 0 && ` / ${subscription.project_limit}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold" data-testid="usage-user-count">
                  {usage.user_count}
                </p>
                <p className="text-sm text-muted-foreground">Gebruikers</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <HardDrive className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold" data-testid="usage-storage">
                  {formatStorage(usage.storage_bytes)}
                </p>
                <p className="text-sm text-muted-foreground">Opslag</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan features */}
      <Card>
        <CardHeader>
          <CardTitle>Inbegrepen functies</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
