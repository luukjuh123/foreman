"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tier } from "@/lib/billing";

const DISMISS_KEY = "upgrade_banner_dismissed_until";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  return Date.now() < Number(raw);
}

interface UpgradeBannerProps {
  tier: Tier;
}

export default function UpgradeBanner({ tier }: UpgradeBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (tier === "free" && !isDismissed()) {
      setVisible(true);
    }
  }, [tier]);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS));
    setVisible(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-primary/10 border border-primary/20 rounded-md px-4 py-3 text-sm">
      <span>
        U gebruikt het <strong>gratis plan</strong>. Upgrade naar{" "}
        <strong>Starter</strong> voor onbeperkte projecten.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <Button asChild size="sm">
          <Link href="/pricing">Upgraden</Link>
        </Button>
        <button
          onClick={dismiss}
          aria-label="Sluiten"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
