"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { crews, day, Job, JobStatus, overlaps, today } from "@/lib/planner";
import { usePlanner } from "./provider";
export function JobEditor({
  job,
  children,
}: {
  job?: Job;
  children?: React.ReactNode;
}) {
  const { plan, update, ready } = usePlanner();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [draft, setDraft] = useState<Job>(
    job ?? {
      id: "",
      name: "",
      location: "",
      start: today(),
      end: day(today(), 7),
      crew: "Unassigned",
      status: "Scheduled",
      progress: 0,
      phase: "Site preparation",
    },
  );
  function launch() {
    setDraft(
      job ?? {
        id: "",
        name: "",
        location: "",
        start: today(),
        end: day(today(), 7),
        crew: "Unassigned",
        status: "Scheduled",
        progress: 0,
        phase: "Site preparation",
      },
    );
    setConfirm(false);
    setOpen(true);
  }
  const conflict = plan.jobs.some((j) => overlaps(draft, j));
  return (
    <>
      <Button
        disabled={!ready}
        variant={job ? "ghost" : "default"}
        onClick={launch}
        className={job ? "edit-job" : "new-job"}
      >
        {children ?? (
          <>
            <Plus size={17} /> New job
          </>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="planner-dialog">
          <DialogHeader>
            <DialogTitle>{job ? "Edit job" : "Plan a new job"}</DialogTitle>
            <DialogDescription>
              Set the dates and assign a crew. Everything else can follow.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.name.trim() || draft.end < draft.start) return;
              const next = {
                ...draft,
                name: draft.name.trim(),
                id: job?.id ?? crypto.randomUUID(),
                progress: draft.status === "Complete" ? 100 : draft.progress,
              };
              update((p) => ({
                ...p,
                jobs: job
                  ? p.jobs.map((j) => (j.id === job.id ? next : j))
                  : [...p.jobs, next],
              }));
              setOpen(false);
            }}
          >
            <label>
              Job name
              <input
                required
                maxLength={100}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Site / location
              <input
                maxLength={160}
                value={draft.location}
                onChange={(e) =>
                  setDraft({ ...draft, location: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Start date
                <input
                  required
                  type="date"
                  value={draft.start}
                  onChange={(e) =>
                    setDraft({ ...draft, start: e.target.value })
                  }
                />
              </label>
              <label>
                End date
                <input
                  required
                  type="date"
                  min={draft.start}
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </label>
              <label>
                Crew
                <select
                  aria-label="Crew"
                  value={draft.crew}
                  onChange={(e) => setDraft({ ...draft, crew: e.target.value })}
                >
                  {crews.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  aria-label="Status"
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as JobStatus })
                  }
                >
                  {["Scheduled", "In progress", "On hold", "Complete"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <label>
              Current phase
              <input
                required
                maxLength={80}
                value={draft.phase}
                onChange={(e) => setDraft({ ...draft, phase: e.target.value })}
              />
            </label>
            <label>
              Progress · {draft.progress}%
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={draft.progress}
                onChange={(e) =>
                  setDraft({ ...draft, progress: Number(e.target.value) })
                }
              />
            </label>
            {conflict && (
              <p className="form-warning" role="status">
                This crew has another job on these dates. You can save, or
                choose another crew.
              </p>
            )}
            <div className="dialog-actions">
              {job && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (!confirm) {
                      setConfirm(true);
                      return;
                    }
                    update((p) => ({
                      ...p,
                      jobs: p.jobs.filter((j) => j.id !== job.id),
                    }));
                    setOpen(false);
                  }}
                >
                  <Trash2 size={15} />
                  {confirm ? "Confirm delete" : "Delete"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {job ? "Save changes" : "Create job"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
