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

// Staff types

export interface StaffResponse {
  id: string;
  owner_id?: string;
  full_name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  hourly_rate_cents: number;
  weekly_hours_target?: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
  availability?: unknown[];
}

export interface StaffListResponse {
  data: StaffResponse[];
  total: number;
  page: number;
  per_page: number;
}

// Loan types

export interface LoanDeductionResponse {
  id: string;
  loan_id: string;
  amount_cents: number;
  deduction_date: string;
  notes?: string | null;
  created_at: string;
}

export interface StaffLoanResponse {
  id: string;
  staff_id: string;
  principal_cents: number;
  issued_date: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deductions: LoanDeductionResponse[];
  deducted_cents: number;
  outstanding_cents: number;
}

export interface StaffOutstandingBalance {
  staff_id: string;
  total_principal_cents: number;
  total_deducted_cents: number;
  outstanding_cents: number;
  loans: StaffLoanResponse[];
}

export interface StaffLoanCreate {
  staff_id: string;
  principal_cents: number;
  issued_date: string;
  notes?: string;
}

export interface LoanDeductionCreate {
  amount_cents: number;
  deduction_date: string;
  notes?: string;
}
