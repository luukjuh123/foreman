"use client";

import React, { useEffect, useState } from "react";
import { isPushSupported, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

export default function PushPermission() {
  const supported = isPushSupported();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supported) return;
    isPushSubscribed().then(setSubscribed);
  }, [supported]);

  async function handleToggle() {
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        const ok = await subscribeToPush();
        if (ok) setSubscribed(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-2">Pushmeldingen</h3>
      {!supported ? (
        <p data-testid="push-status" className="text-sm text-muted-foreground">
          Niet ondersteund
        </p>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p data-testid="push-status" className="text-sm text-muted-foreground">
            {subscribed ? "Ingeschakeld" : "Uitgeschakeld"}
          </p>
          <button
            data-testid="push-toggle"
            onClick={handleToggle}
            disabled={loading}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {subscribed ? "Uitschakelen" : "Inschakelen"}
          </button>
        </div>
      )}
    </div>
  );
}
