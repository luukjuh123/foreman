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

// Invoice types

export interface InvoiceLineResponse {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bp: number;
  line_total_cents: number;
  vat_amount_cents: number;
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

export interface AgendaWeekResponse {
  week_start: string;
  week_end: string;
  days: AgendaDayResponse[];
}

// Process timeline types

export interface ProcessResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unit: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectProcessResponse {
  id: string;
  project_id: string;
  process_id: string;
  notes: string | null;
  created_at: string;
  process: ProcessResponse;
}

export interface ProjectProcessListResponse {
  data: ProjectProcessResponse[];
}

export interface TimeEntryResponse {
  id: string;
  project_process_id: string;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

export interface TimeEntryListResponse {
  data: TimeEntryResponse[];
  total_seconds: number;
}

export interface PhotoResponse {
  id: string;
  project_id: string;
  recognized_process_id: string | null;
  recognized_process_slug: string | null;
  image_url: string;
  completion_pct: number | null;
  reasoning: string | null;
  created_at: string;
}

export interface PhotoListResponse {
  data: PhotoResponse[];
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

// Staff types

export interface StaffResponse {
  id: string;
  owner_id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  hourly_rate_cents: number;
  weekly_hours_target: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  availability: unknown[];
}

export interface StaffListResponse {
  data: StaffResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface StaffCreate {
  full_name: string;
  role: string;
  hourly_rate_cents: number;
  email?: string;
  phone?: string;
  weekly_hours_target?: number;
  active?: boolean;
}

export interface StaffUpdate {
  full_name?: string;
  role?: string;
  hourly_rate_cents?: number;
  email?: string;
  phone?: string;
  weekly_hours_target?: number;
  active?: boolean;
}

// Report types

export interface ReportResponse {
  id: string;
  project_id: string;
  type: "weekly" | "completion";
  title: string;
  period_start: string | null;
  period_end: string | null;
  data: Record<string, any>;
  is_shared: boolean;
  share_token: string | null;
  created_at: string;
}

export interface ReportListResponse {
  data: ReportResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface ReportGenerateRequest {
  project_id: string;
  type: "weekly" | "completion";
  period_start?: string;
  period_end?: string;
}

export interface ReportShareResponse {
  share_token: string | null;
  share_url: string;
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
  weekly_hours_target?: number | null;
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

export interface StaffCreate {
  full_name: string;
  role: string;
  hourly_rate_cents: number;
  email?: string;
  phone?: string;
  weekly_hours_target?: number;
  active?: boolean;
}

export interface StaffUpdate {
  full_name?: string;
  role?: string;
  hourly_rate_cents?: number;
  email?: string;
  phone?: string;
  weekly_hours_target?: number;
  active?: boolean;
}

export interface StaffAssignmentResponse {
  id: string;
  staff_id: string;
  project_id: string;
  task_id?: string | null;
  start_at: string;
  end_at: string;
  notes?: string | null;
  project_name?: string;
  created_at?: string;
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
