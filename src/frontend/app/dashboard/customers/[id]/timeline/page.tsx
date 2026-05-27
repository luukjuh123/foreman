"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Receipt,
  FileText,
  Star,
  Mail,
  CheckCircle,
  AlertCircle,
  Send,
  MessageSquare,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType =
  | "invoice_sent"
  | "invoice_paid"
  | "invoice_overdue"
  | "report_shared"
  | "review_posted"
  | "review_replied"
  | "email_sent"
  | "payment_received";

export interface TimelineEvent {
  id: string;
  event_type: EventType;
  timestamp: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface TimelineResponse {
  items: TimelineEvent[];
  total: number;
  offset: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Filter config
// ---------------------------------------------------------------------------

interface FilterOption {
  type: EventType;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { type: "invoice_sent", label: "Factuur verstuurd" },
  { type: "invoice_paid", label: "Factuur betaald" },
  { type: "invoice_overdue", label: "Factuur verlopen" },
  { type: "payment_received", label: "Betaling ontvangen" },
  { type: "report_shared", label: "Rapport gedeeld" },
  { type: "review_posted", label: "Review geplaatst" },
  { type: "review_replied", label: "Review beantwoord" },
  { type: "email_sent", label: "E-mail verstuurd" },
];

// ---------------------------------------------------------------------------
// Icons per event type
// ---------------------------------------------------------------------------

function EventIcon({ type }: { type: EventType }) {
  const className = "h-5 w-5";
  switch (type) {
    case "invoice_sent":
      return <Receipt className={className} />;
    case "invoice_paid":
      return <CheckCircle className={className} />;
    case "invoice_overdue":
      return <AlertCircle className={className} />;
    case "report_shared":
      return <FileText className={className} />;
    case "review_posted":
      return <Star className={className} />;
    case "review_replied":
      return <MessageSquare className={className} />;
    case "email_sent":
      return <Mail className={className} />;
    case "payment_received":
      return <CheckCircle className={className} />;
    default:
      return <Mail className={className} />;
  }
}

function eventIconBg(type: EventType): string {
  switch (type) {
    case "invoice_sent":
      return "bg-blue-100 text-blue-600";
    case "invoice_paid":
      return "bg-green-100 text-green-600";
    case "invoice_overdue":
      return "bg-red-100 text-red-600";
    case "report_shared":
      return "bg-purple-100 text-purple-600";
    case "review_posted":
      return "bg-yellow-100 text-yellow-600";
    case "review_replied":
      return "bg-indigo-100 text-indigo-600";
    case "email_sent":
      return "bg-gray-100 text-gray-600";
    case "payment_received":
      return "bg-emerald-100 text-emerald-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CustomerTimelinePage() {
  const params = useParams();
  const customerId = params?.id as string;

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(
    new Set(FILTER_OPTIONS.map((f) => f.type))
  );

  function buildUrl(currentOffset: number): string {
    const params = new URLSearchParams();
    params.set("offset", String(currentOffset));
    params.set("limit", String(PAGE_SIZE));
    return `/customers/${customerId}/timeline?${params.toString()}`;
  }

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    setEvents([]);
    setOffset(0);
    apiFetch<TimelineResponse>(buildUrl(0))
      .then((res) => {
        setEvents(res.items);
        setTotal(res.total);
        setOffset(res.items.length);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, activeFilters]);

  function handleLoadMore() {
    apiFetch<TimelineResponse>(buildUrl(offset))
      .then((res) => {
        setEvents((prev) => [...prev, ...res.items]);
        setOffset((prev) => prev + res.items.length);
        setTotal(res.total);
      })
      .catch((e: Error) => setError(e.message));
  }

  function toggleFilter(type: EventType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  const visibleEvents = events.filter((e) => activeFilters.has(e.event_type));
  const hasMore = offset < total;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          Communicatie tijdlijn
        </h1>
        {/* Quick-action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline">
            <Send className="mr-1.5 h-4 w-4" />
            Herinnering sturen
          </Button>
          <Button size="sm" variant="outline">
            <FileText className="mr-1.5 h-4 w-4" />
            Rapport delen
          </Button>
          <Button size="sm" variant="outline">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Review beantwoorden
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border bg-card p-3"
        role="group"
        aria-label="Filteren op gebeurtenistype"
      >
        {FILTER_OPTIONS.map(({ type, label }) => (
          <label key={type} className="flex cursor-pointer items-center gap-1.5 text-sm select-none">
            <input
              type="checkbox"
              className="rounded"
              checked={activeFilters.has(type)}
              onChange={() => toggleFilter(type)}
              aria-label={label}
            />
            {label}
          </label>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : visibleEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen activiteit gevonden.</p>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-border" aria-hidden="true" />

          <ol className="space-y-6">
            {visibleEvents.map((event) => (
              <li key={event.id} className="relative flex gap-4 pl-14">
                {/* Icon bubble */}
                <div
                  className={`absolute left-3 flex h-6 w-6 items-center justify-center rounded-full ${eventIconBg(event.event_type)}`}
                >
                  <EventIcon type={event.event_type} />
                </div>

                {/* Card */}
                <div className="flex-1 rounded-lg border bg-card p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-1">
                    <p className="font-medium text-foreground">{event.title}</p>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={event.timestamp}
                    >
                      {formatDate(event.timestamp)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* Load more */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleLoadMore}>
                Meer laden
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
