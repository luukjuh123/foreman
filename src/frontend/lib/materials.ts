import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface PaintSpec {
  type: "paint";
  surface: "walls" | "ceiling" | "floor";
  coats?: number;
  coverage_m2_per_liter?: number | null;
}

export interface TileSpec {
  type: "tiles";
  surface: "floor" | "walls";
  waste_pct?: number | null;
}

export interface ConcreteSpec {
  type: "concrete";
  surface: "floor";
  thickness_m: number;
}

export interface LumberSpec {
  type: "lumber";
  total_length_m: number;
  piece_length_m: number;
}

export type MaterialSpec = PaintSpec | TileSpec | ConcreteSpec | LumberSpec;

export interface RoomEstimateRequest {
  length_m: number;
  width_m: number;
  height_m: number;
  materials: MaterialSpec[];
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface MaterialEstimate {
  material: string;
  quantity: number;
  unit: string;
  notes: string;
}

export interface RoomEstimateResponse {
  data: { estimates: MaterialEstimate[] } | null;
  error: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// API client function
// ---------------------------------------------------------------------------

export async function estimateMaterials(
  req: RoomEstimateRequest
): Promise<RoomEstimateResponse> {
  return apiFetch<RoomEstimateResponse>("/materials/estimate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
