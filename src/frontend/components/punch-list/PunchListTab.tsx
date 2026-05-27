"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listPunchItems,
  updatePunchItem,
  deletePunchItem,
  type PunchItemResponse,
  type PunchItemStatus,
} from "@/lib/punch-items";
import { PunchStatusBadge } from "./PunchStatusBadge";

const STATUS_FILTERS: Array<{ label: string; value: PunchItemStatus | undefined }> = [
  { label: "Alle", value: undefined },
  { label: "Open", value: "open" },
  { label: "Gerepareerd", value: "fixed" },
  { label: "Geverifieerd", value: "verified" },
];

interface Props {
  projectId: string;
}

export default function PunchListTab({ projectId }: Props) {
  const [items, setItems] = useState<PunchItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<PunchItemStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (status?: PunchItemStatus) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listPunchItems(projectId, status);
        setItems(result.data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    load(activeFilter);
  }, [load, activeFilter]);

  async function handleMarkFixed(item: PunchItemResponse) {
    await updatePunchItem(projectId, item.id, { status: "fixed" });
    load(activeFilter);
  }

  async function handleDelete(itemId: string) {
    await deletePunchItem(projectId, itemId);
    load(activeFilter);
  }

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.label}
            variant={activeFilter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Laden…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen punten gevonden.</p>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <PunchItemCard
            key={item.id}
            item={item}
            onMarkFixed={handleMarkFixed}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single item card
// ---------------------------------------------------------------------------

interface CardProps {
  item: PunchItemResponse;
  onMarkFixed: (item: PunchItemResponse) => void;
  onDelete: (id: string) => void;
}

function PunchItemCard({ item, onMarkFixed, onDelete }: CardProps) {
  const hasBefore = Boolean(item.photo_before_url);
  const hasAfter = Boolean(item.photo_after_url);

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium flex-1">{item.description}</p>
          <PunchStatusBadge
            status={item.status as PunchItemStatus}
            data-testid={`status-badge-${item.id}`}
          />
        </div>

        {/* Before / after photo comparison */}
        {(hasBefore || hasAfter) && (
          <div className="flex gap-3">
            {hasBefore && (
              <div className="flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">Voor</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.photo_before_url!}
                  alt={`Voor foto - ${item.description}`}
                  className="w-full h-32 object-cover rounded-md border"
                />
              </div>
            )}
            {hasAfter && (
              <div className="flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">Na</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.photo_after_url!}
                  alt={`Na foto - ${item.description}`}
                  className="w-full h-32 object-cover rounded-md border"
                />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {item.status === "open" && (
            <Button
              size="sm"
              variant="outline"
              data-testid={`mark-fixed-${item.id}`}
              onClick={() => onMarkFixed(item)}
            >
              Markeer als gerepareerd
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(item.id)}
          >
            Verwijder
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
