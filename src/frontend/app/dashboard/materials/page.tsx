"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import {
  estimateMaterials,
  type MaterialSpec,
  type MaterialEstimate,
} from "@/lib/materials";

// ---------------------------------------------------------------------------
// Types for local form state
// ---------------------------------------------------------------------------

type MaterialType = "paint" | "tiles" | "concrete" | "lumber";

interface MaterialRow {
  id: number;
  type: MaterialType;
  // paint + tiles
  surface: "walls" | "ceiling" | "floor";
  // paint
  coats: string;
  // concrete
  thickness_m: string;
  // lumber
  total_length_m: string;
  piece_length_m: string;
}

function defaultRow(id: number): MaterialRow {
  return {
    id,
    type: "paint",
    surface: "walls",
    coats: "2",
    thickness_m: "0.1",
    total_length_m: "",
    piece_length_m: "2.4",
  };
}

function rowToSpec(row: MaterialRow): MaterialSpec {
  switch (row.type) {
    case "paint":
      return {
        type: "paint",
        surface: row.surface as "walls" | "ceiling" | "floor",
        coats: parseInt(row.coats, 10) || 2,
      };
    case "tiles":
      return {
        type: "tiles",
        surface: row.surface as "floor" | "walls",
      };
    case "concrete":
      return {
        type: "concrete",
        surface: "floor",
        thickness_m: parseFloat(row.thickness_m) || 0.1,
      };
    case "lumber":
      return {
        type: "lumber",
        total_length_m: parseFloat(row.total_length_m) || 0,
        piece_length_m: parseFloat(row.piece_length_m) || 2.4,
      };
  }
}

// ---------------------------------------------------------------------------
// Material type labels (Dutch)
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<MaterialType, string> = {
  paint: "Verf",
  tiles: "Tegels",
  concrete: "Beton",
  lumber: "Hout",
};

const SURFACE_OPTIONS_PAINT = [
  { value: "walls", label: "Wanden" },
  { value: "ceiling", label: "Plafond" },
  { value: "floor", label: "Vloer" },
] as const;

const SURFACE_OPTIONS_TILES = [
  { value: "floor", label: "Vloer" },
  { value: "walls", label: "Wanden" },
] as const;

// ---------------------------------------------------------------------------
// Material row form component
// ---------------------------------------------------------------------------

interface MaterialRowFormProps {
  row: MaterialRow;
  onChange: (row: MaterialRow) => void;
  onRemove: () => void;
}

function MaterialRowForm({ row, onChange, onRemove }: MaterialRowFormProps) {
  function set<K extends keyof MaterialRow>(field: K, value: MaterialRow[K]) {
    onChange({ ...row, [field]: value });
  }

  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor={`type-${row.id}`} className="text-sm font-medium">
            Type
          </label>
          <select
            id={`type-${row.id}`}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={row.type}
            onChange={(e) => {
              const t = e.target.value as MaterialType;
              // Reset surface to valid default when switching type
              const surface =
                t === "tiles" ? "floor" : t === "paint" ? "walls" : "floor";
              onChange({ ...row, type: t, surface: surface as MaterialRow["surface"] });
            }}
          >
            {(Object.keys(TYPE_LABELS) as MaterialType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="Verwijderen"
          className="mt-6"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* Paint-specific fields */}
      {row.type === "paint" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor={`surface-${row.id}`} className="text-sm font-medium">
              Oppervlak
            </label>
            <select
              id={`surface-${row.id}`}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={row.surface}
              onChange={(e) => set("surface", e.target.value as MaterialRow["surface"])}
            >
              {SURFACE_OPTIONS_PAINT.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`coats-${row.id}`} className="text-sm font-medium">
              Lagen
            </label>
            <Input
              id={`coats-${row.id}`}
              type="number"
              min="1"
              max="10"
              value={row.coats}
              onChange={(e) => set("coats", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Tiles-specific fields */}
      {row.type === "tiles" && (
        <div className="space-y-1">
          <label htmlFor={`surface-${row.id}`} className="text-sm font-medium">
            Oppervlak
          </label>
          <select
            id={`surface-${row.id}`}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={row.surface}
            onChange={(e) => set("surface", e.target.value as MaterialRow["surface"])}
          >
            {SURFACE_OPTIONS_TILES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Concrete-specific fields */}
      {row.type === "concrete" && (
        <div className="space-y-1">
          <label htmlFor={`thickness-${row.id}`} className="text-sm font-medium">
            Dikte (m)
          </label>
          <Input
            id={`thickness-${row.id}`}
            type="number"
            min="0.01"
            step="0.01"
            value={row.thickness_m}
            onChange={(e) => set("thickness_m", e.target.value)}
          />
        </div>
      )}

      {/* Lumber-specific fields */}
      {row.type === "lumber" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor={`total-length-${row.id}`} className="text-sm font-medium">
              Totale lengte (m)
            </label>
            <Input
              id={`total-length-${row.id}`}
              type="number"
              min="0"
              step="0.1"
              value={row.total_length_m}
              onChange={(e) => set("total_length_m", e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`piece-length-${row.id}`} className="text-sm font-medium">
              Stuklengte (m)
            </label>
            <Input
              id={`piece-length-${row.id}`}
              type="number"
              min="0.01"
              step="0.1"
              value={row.piece_length_m}
              onChange={(e) => set("piece_length_m", e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

function ResultsTable({ estimates }: { estimates: MaterialEstimate[] }) {
  if (estimates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Geen schattingen beschikbaar.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium">Materiaal</th>
            <th className="text-right py-2 pr-4 font-medium">Hoeveelheid</th>
            <th className="text-left py-2 pr-4 font-medium">Eenheid</th>
            <th className="text-left py-2 font-medium">Toelichting</th>
          </tr>
        </thead>
        <tbody>
          {estimates.map((est, idx) => (
            <tr key={idx} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{est.material}</td>
              <td className="py-2 pr-4 text-right">
                {est.quantity.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{est.unit}</td>
              <td className="py-2 text-muted-foreground">{est.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MaterialsPage() {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [nextId, setNextId] = useState(1);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MaterialEstimate[] | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  function addMaterial() {
    setMaterials((prev) => [...prev, defaultRow(nextId)]);
    setNextId((n) => n + 1);
  }

  function removeMaterial(id: number) {
    setMaterials((prev) => prev.filter((r) => r.id !== id));
  }

  function updateMaterial(updated: MaterialRow) {
    setMaterials((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function handleCalculate() {
    setValidationError(null);
    setApiError(null);
    setResults(null);

    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);

    if (!length || !width || !height || isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0) {
      setValidationError("Vul geldige afmetingen in (lengte, breedte en hoogte).");
      return;
    }

    setLoading(true);
    try {
      const response = await estimateMaterials({
        length_m: l,
        width_m: w,
        height_m: h,
        materials: materials.map(rowToSpec),
      });

      if (response.error) {
        setApiError("Berekening mislukt. Controleer de invoer en probeer opnieuw.");
      } else {
        setResults(response.data?.estimates ?? []);
      }
    } catch {
      setApiError("Er is een fout opgetreden bij de berekening.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-2">Materialen</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Bereken de benodigde materialen voor een ruimte op basis van de afmetingen.
      </p>

      {/* Room dimensions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Ruimte-afmetingen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label htmlFor="length" className="text-sm font-medium">
                Lengte (m)
              </label>
              <Input
                id="length"
                type="number"
                min="0.01"
                step="0.01"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="width" className="text-sm font-medium">
                Breedte (m)
              </label>
              <Input
                id="width"
                type="number"
                min="0.01"
                step="0.01"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="height" className="text-sm font-medium">
                Hoogte (m)
              </label>
              <Input
                id="height"
                type="number"
                min="0.01"
                step="0.01"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          {validationError && (
            <p className="text-sm text-destructive mt-2">{validationError}</p>
          )}
        </CardContent>
      </Card>

      {/* Materials list */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Materialen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {materials.map((row) => (
            <MaterialRowForm
              key={row.id}
              row={row}
              onChange={updateMaterial}
              onRemove={() => removeMaterial(row.id)}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addMaterial}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Materiaal toevoegen
          </Button>
        </CardContent>
      </Card>

      {/* Calculate */}
      <Button
        type="button"
        onClick={handleCalculate}
        disabled={loading}
        className="w-full mb-6"
      >
        {loading ? "Bezig met berekenen…" : "Berekenen"}
      </Button>

      {/* Error */}
      {apiError && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{apiError}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resultaten</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsTable estimates={results} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
