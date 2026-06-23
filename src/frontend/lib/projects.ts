import { apiFetch } from "./api";
import { token } from "./auth";
import type {
  ProjectCreate,
  ProjectResponse,
  ProjectListResponse,
  PhaseCreate,
  PhaseResponse,
  TaskCreate,
  TaskResponse,
  TaskUpdate,
} from "./types";

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function calcPhaseProgress(phase: PhaseResponse): number {
  if (!phase.tasks || phase.tasks.length === 0) return 0;
  const done = phase.tasks.filter((t) => t.status === "done").length;
  return Math.round((done / phase.tasks.length) * 100);
}

export function calcTaskSummary(project: ProjectResponse): { done: number; total: number } {
  const allTasks = (project.phases ?? []).flatMap((p) => p.tasks ?? []);
  return {
    done: allTasks.filter((t) => t.status === "done").length,
    total: allTasks.length,
  };
}

export function formatBudget(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

export async function listProjects(page = 1, perPage = 20): Promise<ProjectListResponse> {
  return apiFetch<ProjectListResponse>(
    `/projects?page=${page}&per_page=${perPage}`,
    { token: token() }
  );
}

export async function getProject(id: string): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>(`/projects/${id}`, { token: token() });
}

export async function createProject(data: ProjectCreate): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function createPhase(projectId: string, data: PhaseCreate): Promise<PhaseResponse> {
  return apiFetch<PhaseResponse>(`/projects/${projectId}/phases`, {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function createTask(
  projectId: string,
  phaseId: string,
  data: TaskCreate
): Promise<TaskResponse> {
  return apiFetch<TaskResponse>(`/projects/${projectId}/phases/${phaseId}/tasks`, {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function updateTask(
  projectId: string,
  phaseId: string,
  taskId: string,
  data: TaskUpdate
): Promise<TaskResponse> {
  return apiFetch<TaskResponse>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
      token: token(),
    }
  );
}
