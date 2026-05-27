"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import type { Certification } from "./certification-tab";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(isoDate);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface ExpiryTimelineProps {
  days?: number;
}

export default function ExpiryTimeline({ days = 90 }: ExpiryTimelineProps) {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Certification[]>(`/staff/certifications/expiring-soon?days=${days}`)
      .then((data) => {
        if (!cancelled) {
          setCerts(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden mislukt");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading) {
    return <div className="py-8 text-center text-gray-500">Laden...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-red-600">{error}</div>;
  }

  const sorted = [...certs].sort(
    (a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Verlooptijdlijn</h2>
      <p className="text-sm text-gray-500">
        Certificeringen die verlopen binnen {days} dagen.
      </p>

      {sorted.length === 0 ? (
        <p className="text-gray-500 text-sm py-4">
          Geen verlopen of binnenkort vervallende certificeringen.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((cert) => {
            const remaining = daysUntil(cert.expires_at);
            return (
              <div
                key={cert.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <div className="font-medium text-sm">{cert.cert_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {cert.cert_type} · Verloopt {formatDate(cert.expires_at)}
                  </div>
                </div>
                <Badge
                  variant={remaining <= 30 ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {remaining} dagen
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
