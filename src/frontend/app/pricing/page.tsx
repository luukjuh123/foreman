"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tier = "free" | "starter" | "pro";

interface TierConfig {
  id: Tier;
  name: string;
  price: string;
  priceNote: string;
  cta: string;
  highlighted: boolean;
  features: string[];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const TIERS: TierConfig[] = [
  {
    id: "free",
    name: "Free",
    price: "Gratis",
    priceNote: "Voor altijd",
    cta: "Start gratis",
    highlighted: false,
    features: [
      "1 project",
      "Basisplanning",
      "Community ondersteuning",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "€9,99",
    priceNote: "per maand",
    cta: "Kies Starter",
    highlighted: true,
    features: [
      "Onbeperkte projecten",
      "AI-planning",
      "FactuurGeneratie",
      "E-mailondersteuning",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€29,99",
    priceNote: "per maand",
    cta: "Kies Pro",
    highlighted: false,
    features: [
      "Alles in Starter",
      "Financiële rapporten",
      "Personeelsbeheer",
      "Bouwmarkt-integraties",
      "Voice AI-assistent",
      "Prioriteitsondersteuning",
    ],
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PricingPage() {
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);

  async function handleCta(tier: Tier) {
    if (tier === "free") {
      router.push("/login?redirect=/pricing");
      return;
    }

    setLoadingTier(tier);
    try {
      const data = await apiFetch<{ checkout_url: string }>(
        "/billing/checkout",
        {
          method: "POST",
          body: JSON.stringify({ tier }),
        }
      );
      window.location.href = data.checkout_url;
    } catch {
      // Not authenticated — redirect to login
      router.push("/login?redirect=/pricing");
    } finally {
      setLoadingTier(null);
    }
  }

  return (
    <main className="min-h-screen bg-background py-16 px-4">
      {/* Header */}
      <div className="mx-auto max-w-4xl text-center mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Kies jouw abonnement
        </h1>
        <p className="text-lg text-muted-foreground">
          Start gratis. Upgrade wanneer je klaar bent.
        </p>
      </div>

      {/* Tier cards */}
      <div className="mx-auto max-w-4xl grid grid-cols-1 gap-6 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <Card
            key={tier.id}
            className={
              tier.highlighted
                ? "border-primary ring-2 ring-primary relative"
                : "border-border"
            }
          >
            {tier.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                  Meest populair
                </span>
              </div>
            )}
            <CardContent className="p-6 flex flex-col gap-4">
              {/* Name */}
              <h2 className="text-xl font-bold text-foreground">{tier.name}</h2>

              {/* Price */}
              <div>
                <span className="text-3xl font-extrabold text-foreground">
                  {tier.price}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {tier.priceNote}
                </span>
              </div>

              {/* CTA */}
              <Button
                variant={tier.highlighted ? "default" : "outline"}
                className="w-full"
                disabled={loadingTier === tier.id}
                onClick={() => handleCta(tier.id)}
              >
                {loadingTier === tier.id ? "Laden…" : tier.cta}
              </Button>

              {/* Features */}
              <ul className="space-y-2 mt-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
