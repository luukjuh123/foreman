"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Bell, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchNotifications,
  markNotificationRead,
  type NotificationResponse,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const PER_PAGE = 20;

  const load = useCallback(
    async (p: number, unread: boolean) => {
      setLoading(true);
      try {
        const res = await fetchNotifications({
          unread_only: unread,
          page: p,
          per_page: PER_PAGE,
        });
        setNotifications(res.data);
        setHasMore(res.data.length === PER_PAGE);
      } catch {
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load(page, unreadOnly);
  }, [page, unreadOnly, load]);

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
  }

  function toggleUnreadOnly() {
    setPage(1);
    setUnreadOnly((v) => !v);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Meldingen</h1>
        <Button
          variant={unreadOnly ? "default" : "outline"}
          size="sm"
          onClick={toggleUnreadOnly}
        >
          Alleen ongelezen
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : notifications.length === 0 ? (
        <div data-testid="notifications-empty" className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Bell className="h-10 w-10 opacity-30" />
          <p className="text-sm">Geen meldingen</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border bg-card">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3",
                !n.read_at && "bg-amber-500/5"
              )}
            >
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    !n.read_at ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {n.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground/60">{formatDate(n.created_at)}</p>
              </div>
              {!n.read_at && (
                <button
                  data-testid={`mark-read-${n.id}`}
                  aria-label="Markeer als gelezen"
                  onClick={() => handleMarkRead(n.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && notifications.length > 0 && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Vorige
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Volgende
          </Button>
        </div>
      )}
    </div>
  );
}
