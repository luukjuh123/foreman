"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSubscription, type Tier, type Subscription } from "@/lib/billing";

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

function tierSufficient(userTier: Tier, requiredTier: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier];
}

interface PaywallGateProps {
  requiredTier: Tier;
  feature: string;
  children: React.ReactNode;
}

export default function PaywallGate({ requiredTier, feature, children }: PaywallGateProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSubscription()
      .then(setSubscription)
      .catch(() => setSubscription(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return null;
  }

  const userTier: Tier = subscription?.tier ?? "free";

  if (tierSufficient(userTier, requiredTier)) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center p-8">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>{feature}</CardTitle>
          <CardDescription>
            Deze functie vereist het <strong>{requiredTier}</strong> plan of hoger.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/pricing">Upgraden</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
