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

// Agenda types

export interface AgendaTask {
  task_id: string;
  project_id: string;
  project_name: string;
  phase_id: string;
  phase_name: string;
  name: string;
  description: string | null;
  status: string;
  priority: number;
  estimated_hours: number;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
}

export interface AgendaDayResponse {
  date: string;
  tasks: AgendaTask[];
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

// Invoice types

export interface InvoiceLineResponse {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bp: number;
  line_net_cents: number;
  line_vat_cents: number;
}

export interface InvoiceResponse {
  id: string;
  customer_id: string;
  project_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  payment_terms_days: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue";
  notes: string | null;
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
  sent_at: string | null;
  paid_at: string | null;
  lines: InvoiceLineResponse[];
}

export interface InvoiceListResponse {
  data: InvoiceResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface CustomerResponse {
  id: string;
  name: string;
  email: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string;
}

export interface InvoiceLineCreate {
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bp: number;
}

export interface InvoiceCreate {
  customer_id: string;
  project_id?: string | null;
  issue_date: string;
  payment_terms_days: number;
  notes?: string | null;
  lines: InvoiceLineCreate[];
}
