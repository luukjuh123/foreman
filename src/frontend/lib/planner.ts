export type JobStatus = "Scheduled" | "In progress" | "On hold" | "Complete";
export type Job = {
  id: string;
  name: string;
  location: string;
  start: string;
  end: string;
  crew: string;
  status: JobStatus;
  progress: number;
  phase: string;
};
export type Planner = {
  jobs: Job[];
  checks: string[];
  delivered: string[];
  company: string;
};
export const crews = ["Unassigned", "Team Atlas", "Team Brick", "Team Cedar"];
export function day(date: string, offset = 0) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
export function overlaps(a: Job, b: Job) {
  return (
    a.id !== b.id &&
    a.crew !== "Unassigned" &&
    a.crew === b.crew &&
    a.status !== "Complete" &&
    b.status !== "Complete" &&
    a.start <= b.end &&
    b.start <= a.end
  );
}
export function validJob(j: unknown): j is Job {
  if (!j || typeof j !== "object") return false;
  const v = j as Job;
  return (
    [v.id, v.name, v.location, v.phase].every((x) => typeof x === "string") &&
    crews.includes(v.crew) &&
    ["Scheduled", "In progress", "On hold", "Complete"].includes(v.status) &&
    [v.start, v.end].every(
      (x) =>
        typeof x === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(x) &&
        !Number.isNaN(Date.parse(x)),
    ) &&
    v.end >= v.start &&
    Number.isFinite(v.progress) &&
    v.progress >= 0 &&
    v.progress <= 100
  );
}
export function seed(): Planner {
  const t = today();
  return {
    company: "Northline Construction",
    checks: [],
    delivered: [],
    jobs: [
      {
        id: "FM-001",
        name: "Riverside residence",
        location: "Utrecht · West district",
        start: day(t, -4),
        end: day(t, 8),
        crew: "Team Atlas",
        status: "In progress",
        progress: 65,
        phase: "Structure & framing",
      },
      {
        id: "FM-002",
        name: "The Foundry offices",
        location: "Amsterdam · Noord",
        start: day(t, -2),
        end: day(t, 4),
        crew: "Team Brick",
        status: "In progress",
        progress: 40,
        phase: "Interior fit-out",
      },
      {
        id: "FM-003",
        name: "Parkside extension",
        location: "Amersfoort · Parkside",
        start: day(t, 2),
        end: day(t, 12),
        crew: "Team Cedar",
        status: "Scheduled",
        progress: 0,
        phase: "Groundworks",
      },
      {
        id: "FM-004",
        name: "Canal house renovation",
        location: "Utrecht · City centre",
        start: day(t, 10),
        end: day(t, 20),
        crew: "Team Atlas",
        status: "Scheduled",
        progress: 0,
        phase: "Site preparation",
      },
    ],
  };
}
