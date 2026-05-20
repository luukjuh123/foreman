"use client";

import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { ReviewResponse, ReviewStats } from "@/lib/reviews";
import { formatReviewDate } from "@/lib/reviews";

// ---------------------------------------------------------------------------
// Default location — in production this comes from user context / settings
// ---------------------------------------------------------------------------

const DEFAULT_LOCATION_ID = "default";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StarDisplay({ rating, size = 4 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${rating} van 5 sterren`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-${size} w-${size} ${
            s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
          }`}
        />
      ))}
    </span>
  );
}

function RatingDistribution({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  return (
    <div data-testid="rating-distribution" className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[String(star)] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div
            key={star}
            data-testid={`dist-row-${star}`}
            className="flex items-center gap-2 text-sm"
          >
            <span className="w-4 text-right text-muted-foreground">{star}</span>
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
            <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-yellow-400"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-right text-muted-foreground">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function MonthLabel(month: string): string {
  // month format: "YYYY-MM" → "jan '24"
  try {
    const [year, m] = month.split("-");
    const d = new Date(Number(year), Number(m) - 1, 1);
    return new Intl.DateTimeFormat("nl-NL", { month: "short", year: "2-digit" }).format(d);
  } catch {
    return month;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReviewsDashboard() {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<ReviewResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load(locationId = DEFAULT_LOCATION_ID) {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, reviewsRes] = await Promise.all([
        apiFetch<{ data: ReviewStats }>(`/reviews/stats?location_id=${locationId}`),
        apiFetch<{ data: ReviewResponse[] }>(`/reviews?location_id=${locationId}`),
      ]);
      setStats(statsRes.data);
      setReviews(reviewsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      await apiFetch(`/reviews/sync`, {
        method: "POST",
        body: JSON.stringify({ location_id: DEFAULT_LOCATION_ID }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync mislukt");
    } finally {
      setSyncing(false);
    }
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div data-testid="reviews-loading" className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-20 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div
        data-testid="reviews-error"
        className="rounded border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Trend chart data
  // -------------------------------------------------------------------------

  const trendData = (stats?.monthly_trend ?? []).map((point) => ({
    ...point,
    label: MonthLabel(point.month),
  }));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reviews</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchroniseren…" : "Synchroniseren"}
        </Button>
      </div>

      {/* Stats + Distribution row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Stats card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Gemiddelde beoordeling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-3">
              <span
                data-testid="stats-average-rating"
                className="text-4xl font-bold text-foreground"
              >
                {stats?.average_rating.toFixed(1) ?? "—"}
              </span>
              <span className="mb-1 text-muted-foreground text-sm">/ 5</span>
            </div>
            {stats && (
              <StarDisplay rating={Math.round(stats.average_rating)} size={5} />
            )}
            <p className="text-sm text-muted-foreground">
              Gebaseerd op{" "}
              <span data-testid="stats-total-count" className="font-medium text-foreground">
                {stats?.total_count ?? 0}
              </span>{" "}
              reviews
            </p>
          </CardContent>
        </Card>

        {/* Distribution card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Verdeling
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats && (
              <RatingDistribution
                distribution={stats.rating_distribution}
                total={stats.total_count}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly trend chart */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Trend per maand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => [value.toFixed(2), "Gem. beoordeling"]}
                />
                <Line
                  type="monotone"
                  dataKey="average_rating"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Reviews list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Alle reviews ({reviews.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <p
              data-testid="reviews-empty"
              className="text-sm text-muted-foreground py-6 text-center"
            >
              Geen reviews gevonden.
            </p>
          ) : (
            <div className="divide-y">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  data-testid={`review-item-${review.id}`}
                  className="py-4 first:pt-0 last:pb-0 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm text-foreground">
                        {review.author_name}
                      </p>
                      <StarDisplay rating={review.rating} size={3} />
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        data-testid={`reply-status-${review.id}`}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          review.reply_text
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {review.reply_text ? "Beantwoord" : "Onbeantwoord"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatReviewDate(review.created_at_external)}
                      </span>
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground">{review.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
