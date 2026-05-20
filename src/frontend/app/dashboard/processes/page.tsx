"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { listProcesses, listProcessStats, createProcess, formatDuration } from "@/lib/processes";
import type { ProcessResponse, ProcessStatsResponse, ProcessCreate } from "@/lib/types";

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

interface CreateFormProps {
  onSave: (data: ProcessCreate) => Promise<void>;
  onCancel: () => void;
}

function CreateProcessForm({ onSave, onCancel }: CreateFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, slug, unit, description });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6" data-testid="create-process-form">
      <CardHeader>
        <CardTitle className="text-base">Nieuw proces aanmaken</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="process-name" className="text-sm font-medium">Naam</label>
            <Input
              id="process-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="bijv. Fundering"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="process-slug" className="text-sm font-medium">Slug</label>
            <Input
              id="process-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="bijv. fundering"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="process-unit" className="text-sm font-medium">Eenheid</label>
            <Input
              id="process-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="bijv. m2"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="process-description" className="text-sm font-medium">Omschrijving</label>
            <Input
              id="process-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionele omschrijving"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
            <Button type="submit" disabled={saving}>Opslaan</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Process card
// ---------------------------------------------------------------------------

interface ProcessCardProps {
  process: ProcessResponse;
  stats: ProcessStatsResponse | undefined;
}

function ProcessCard({ process, stats }: ProcessCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{process.name}</CardTitle>
          <span className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5 shrink-0">
            {process.unit}
          </span>
        </div>
        {process.description && (
          <CardDescription className="text-sm">{process.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">{formatDuration(stats?.avg_seconds ?? null)}</span>
            <span className="ml-1">Gemiddelde duur</span>
          </div>
          <div>
            <span className="font-medium text-foreground">{stats?.project_count ?? 0}</span>
            <span className="ml-1">Projecten</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<ProcessResponse[]>([]);
  const [statsMap, setStatsMap] = useState<Map<string, ProcessStatsResponse>>(new Map());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [listRes, statsRes] = await Promise.all([listProcesses(), listProcessStats()]);
        if (cancelled) return;
        setProcesses(listRes.data);
        setTotal(listRes.total);
        const map = new Map<string, ProcessStatsResponse>();
        for (const s of statsRes.data) {
          map.set(s.process_id, s);
        }
        setStatsMap(map);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  async function handleCreate(data: ProcessCreate) {
    await createProcess(data);
    setShowForm(false);
    // Reload list
    const [listRes, statsRes] = await Promise.all([listProcesses(), listProcessStats()]);
    setProcesses(listRes.data);
    setTotal(listRes.total);
    const map = new Map<string, ProcessStatsResponse>();
    for (const s of statsRes.data) {
      map.set(s.process_id, s);
    }
    setStatsMap(map);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Processen</h1>
          {!loading && !error && (
            <p className="text-sm text-muted-foreground mt-1">{total} processen</p>
          )}
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuw proces
        </Button>
      </div>

      {showForm && (
        <CreateProcessForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading && (
        <div data-testid="processes-loading" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded animate-pulse mb-2 w-1/2" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <div data-testid="processes-error" className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700">
          Kon processen niet laden: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {processes.map((process) => (
            <ProcessCard
              key={process.id}
              process={process}
              stats={statsMap.get(process.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
