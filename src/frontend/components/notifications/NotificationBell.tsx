"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import {
  fetchNotifications,
  markNotificationRead,
  type NotificationResponse,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications({ per_page: 10 })
      .then((res) => {
        setNotifications(res.data);
        setUnreadCount(res.unread_count);
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleMarkRead(notif: NotificationResponse) {
    if (notif.read_at) return;
    await markNotificationRead(notif.id);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        aria-label="Meldingen"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notification-dropdown"
          className="absolute right-0 top-10 z-50 w-80 rounded-lg border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold text-foreground">Meldingen</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Geen meldingen
              </p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => handleMarkRead(n)}
                    className={cn(
                      "cursor-pointer border-b px-4 py-3 last:border-b-0 hover:bg-accent/50 transition-colors",
                      !n.read_at && "bg-amber-500/5"
                    )}
                  >
                    <p
                      className={cn(
                        "text-sm font-medium",
                        !n.read_at ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
