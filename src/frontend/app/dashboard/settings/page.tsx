"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Sun, Moon, Monitor, CreditCard } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

interface NotificationPrefs {
  user_id: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  type_overrides: Record<string, unknown> | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-4 cursor-pointer select-none"
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-muted transition-colors checked:bg-primary"
      />
    </label>
  );
}

function NotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    apiFetch<{ data: NotificationPrefs; error: null }>("/notifications/preferences")
      .then((res) => setPrefs(res.data))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(field: keyof Pick<NotificationPrefs, "in_app_enabled" | "email_enabled" | "push_enabled">, value: boolean) {
    if (!prefs) return;
    const updated = { ...prefs, [field]: value };
    setPrefs(updated);
    setSaveState("saving");
    try {
      const res = await apiFetch<{ data: NotificationPrefs; error: null }>(
        "/notifications/preferences",
        {
          method: "PUT",
          body: JSON.stringify({ [field]: value }),
        }
      );
      setPrefs(res.data);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setPrefs(prefs); // revert
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (!prefs) return null;

  return (
    <div className="space-y-4">
      <Toggle
        id="toggle-in-app"
        label="In-app meldingen"
        checked={prefs.in_app_enabled}
        onChange={(v) => handleToggle("in_app_enabled", v)}
      />
      <Toggle
        id="toggle-email"
        label="E-mail meldingen"
        checked={prefs.email_enabled}
        onChange={(v) => handleToggle("email_enabled", v)}
      />
      <Toggle
        id="toggle-push"
        label="Push meldingen"
        checked={prefs.push_enabled}
        onChange={(v) => handleToggle("push_enabled", v)}
      />
      {saveState === "saved" && (
        <p className="text-sm text-green-600">Opgeslagen</p>
      )}
      {saveState === "error" && (
        <p className="text-sm text-destructive">Fout bij opslaan. Probeer opnieuw.</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Instellingen</h1>
        <p className="text-muted-foreground mt-1">Beheer uw voorkeuren</p>
      </div>

      <Link href="/dashboard/settings/subscription" className="block">
        <Card className="hover:bg-accent transition-colors cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Abonnement</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Beheer uw abonnement, plan en gebruik.
            </p>
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Weergave</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Kies het uiterlijk van de applicatie.
          </p>
          <div className="flex gap-3 flex-wrap">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors",
                  theme === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meldingsvoorkeuren</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Kies via welke kanalen u meldingen wilt ontvangen.
          </p>
          <NotificationPreferences />
        </CardContent>
      </Card>
    </div>
  );
}
