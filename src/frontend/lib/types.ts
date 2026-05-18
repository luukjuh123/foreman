// Response types (from backend)

export interface TaskResponse {
  id: string;
  phase_id: string;
  name: string;
  description?: string | null;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: number;
  estimated_hours: number | null;
  labor_cost_cents?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PhaseResponse {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  order_index: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
  updated_at?: string;
  tasks: TaskResponse[];
}

export interface ProjectResponse {
  id: string;
  owner_id?: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  budget_cents: number | null;
  phases: PhaseResponse[];
  created_at?: string;
  updated_at?: string;
}

export interface TaskUpdate {
  name?: string;
  description?: string;
  status?: string;
  priority?: number;
  estimated_hours?: number;
  labor_cost_cents?: number;
  start_date?: string;
  end_date?: string;
}

export interface ProjectListResponse {
  data: ProjectResponse[];
  total: number;
  page: number;
  per_page: number;
}

// Request types (to backend)

export interface ProjectCreate {
  name: string;
  description?: string;
  status: string;
  start_date?: string;
  end_date?: string;
  budget_cents?: number;
}

export interface PhaseCreate {
  name: string;
  description?: string;
  order_index: number;
  status: string;
  start_date?: string;
  end_date?: string;
}

export interface TaskCreate {
  name: string;
  description?: string;
  status: string;
  priority: string;
  estimated_hours?: number;
  labor_cost_cents?: number;
  start_date?: string;
  end_date?: string;
}
