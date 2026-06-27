"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createProject, createPhase, createTask } from "@/lib/projects";
import type { PhaseCreate, TaskCreate } from "@/lib/types";
import { ChevronLeft, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Local wizard state types
// ---------------------------------------------------------------------------

interface WizardTask {
  name: string;
  estimated_hours: string;
  priority: "low" | "medium" | "high";
}

interface WizardPhase {
  name: string;
  description: string;
  tasks: WizardTask[];
}

interface WizardData {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  budget_euros: string;
  phases: WizardPhase[];
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = ["Projectgegevens", "Fasen", "Taken", "Controle"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, idx) => (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                idx < current
                  ? "bg-primary text-primary-foreground"
                  : idx === current
                  ? "bg-primary text-primary-foreground ring-2 ring-offset-2 ring-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {idx + 1}
            </div>
            <span className={cn("text-xs hidden sm:block", idx === current ? "font-semibold" : "text-muted-foreground")}>
              {label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={cn("flex-1 h-0.5", idx < current ? "bg-primary" : "bg-muted")} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Project details
// ---------------------------------------------------------------------------

interface Step1Props {
  data: WizardData;
  onChange: (d: WizardData) => void;
  errors: Record<string, string>;
}

function Step1({ data, onChange, errors }: Step1Props) {
  function set(field: keyof WizardData, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="project-name" className="text-sm font-medium">
          Projectnaam <span className="text-destructive">*</span>
        </label>
        <Input
          id="project-name"
          value={data.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Bijv. Renovatie Amsterdam"
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="project-description" className="text-sm font-medium">
          Omschrijving
        </label>
        <Input
          id="project-description"
          value={data.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Optionele beschrijving"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="project-start" className="text-sm font-medium">
            Startdatum
          </label>
          <Input
            id="project-start"
            type="date"
            value={data.start_date}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="project-end" className="text-sm font-medium">
            Einddatum
          </label>
          <Input
            id="project-end"
            type="date"
            value={data.end_date}
            onChange={(e) => set("end_date", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="project-budget" className="text-sm font-medium">
          Budget (€)
        </label>
        <Input
          id="project-budget"
          type="number"
          min="0"
          step="0.01"
          value={data.budget_euros}
          onChange={(e) => set("budget_euros", e.target.value)}
          placeholder="0,00"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Phases
// ---------------------------------------------------------------------------

interface Step2Props {
  phases: WizardPhase[];
  onChange: (phases: WizardPhase[]) => void;
}

function Step2({ phases, onChange }: Step2Props) {
  function addPhase() {
    onChange([...phases, { name: `Fase ${phases.length + 1}`, description: "", tasks: [] }]);
  }

  function removePhase(idx: number) {
    onChange(phases.filter((_, i) => i !== idx));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...phases];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  }

  function moveDown(idx: number) {
    if (idx === phases.length - 1) return;
    const next = [...phases];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  }

  function updatePhase(idx: number, field: keyof WizardPhase, value: string) {
    const next = [...phases];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Voeg fasen toe aan uw project. U kunt de volgorde aanpassen met de pijlknoppen.
      </p>

      {phases.map((phase, idx) => (
        <div key={idx} className="flex gap-2 items-start">
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              aria-label="Omhoog"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => moveDown(idx)}
              disabled={idx === phases.length - 1}
              aria-label="Omlaag"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-2">
            <Input
              value={phase.name}
              onChange={(e) => updatePhase(idx, "name", e.target.value)}
              placeholder="Fasenaam"
            />
            <Input
              value={phase.description}
              onChange={(e) => updatePhase(idx, "description", e.target.value)}
              placeholder="Omschrijving (optioneel)"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removePhase(idx)}
            aria-label="Fase verwijderen"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addPhase} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Fase toevoegen
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Tasks per phase
// ---------------------------------------------------------------------------

interface Step3Props {
  phases: WizardPhase[];
  onChange: (phases: WizardPhase[]) => void;
}

function Step3({ phases, onChange }: Step3Props) {
  function addTask(phaseIdx: number) {
    const next = [...phases];
    next[phaseIdx] = {
      ...next[phaseIdx],
      tasks: [...next[phaseIdx].tasks, { name: "", estimated_hours: "", priority: "medium" }],
    };
    onChange(next);
  }

  function removeTask(phaseIdx: number, taskIdx: number) {
    const next = [...phases];
    next[phaseIdx] = {
      ...next[phaseIdx],
      tasks: next[phaseIdx].tasks.filter((_, i) => i !== taskIdx),
    };
    onChange(next);
  }

  function updateTask(phaseIdx: number, taskIdx: number, field: keyof WizardTask, value: string) {
    const next = [...phases];
    next[phaseIdx] = {
      ...next[phaseIdx],
      tasks: next[phaseIdx].tasks.map((t, i) =>
        i === taskIdx ? { ...t, [field]: value } : t
      ),
    };
    onChange(next);
  }

  if (phases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Geen fasen gedefinieerd. Ga terug om fasen toe te voegen.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {phases.map((phase, phaseIdx) => (
        <div key={phaseIdx} className="space-y-3">
          <h3 className="font-semibold text-sm">{phase.name}</h3>

          {phase.tasks.map((task, taskIdx) => (
            <div key={taskIdx} className="flex gap-2 items-start">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <Input
                  className="col-span-1"
                  value={task.name}
                  onChange={(e) => updateTask(phaseIdx, taskIdx, "name", e.target.value)}
                  placeholder="Taaknaam"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={task.estimated_hours}
                  onChange={(e) => updateTask(phaseIdx, taskIdx, "estimated_hours", e.target.value)}
                  placeholder="Uren"
                />
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={task.priority}
                  onChange={(e) => updateTask(phaseIdx, taskIdx, "priority", e.target.value)}
                >
                  <option value="low">Laag</option>
                  <option value="medium">Gemiddeld</option>
                  <option value="high">Hoog</option>
                </select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeTask(phaseIdx, taskIdx)}
                aria-label="Taak verwijderen"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addTask(phaseIdx)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Taak toevoegen
          </Button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Review & submit
// ---------------------------------------------------------------------------

interface Step4Props {
  data: WizardData;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}

function Step4({ data, submitting, error, onSubmit }: Step4Props) {
  const budgetDisplay = data.budget_euros
    ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
        parseFloat(data.budget_euros)
      )
    : "—";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-semibold">Project</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {([
            ["Naam", data.name],
            ["Omschrijving", data.description],
            ["Start", data.start_date],
            ["Einde", data.end_date],
            ["Budget", budgetDisplay],
          ] as const)
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <React.Fragment key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
        </dl>
      </div>

      {data.phases.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Fasen &amp; Taken</h3>
          {data.phases.map((phase, idx) => (
            <div key={idx} className="pl-2 border-l-2 border-muted space-y-1">
              <p className="text-sm font-medium">{phase.name}</p>
              {phase.tasks.length > 0 ? (
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                  {phase.tasks.map((t, ti) => (
                    <li key={ti}>{t.name || "(naamloos)"}{t.estimated_hours && ` — ${t.estimated_hours}u`}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Geen taken</p>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="w-full"
      >
        {submitting ? "Bezig met aanmaken…" : "Project aanmaken"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard page
// ---------------------------------------------------------------------------

export default function ProjectWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>({
    name: "",
    description: "",
    start_date: "",
    end_date: "",
    budget_euros: "",
    phases: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validateStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!data.name.trim()) errs.name = "Projectnaam is verplicht";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (step === 0 && !validateStep1()) return;
    setErrors({});
    setStep((s) => s + 1);
  }

  function handlePrev() {
    setErrors({});
    setStep((s) => s - 1);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Convert budget euros → cents
      const budgetCents = data.budget_euros
        ? Math.round(parseFloat(data.budget_euros) * 100)
        : undefined;

      const project = await createProject({
        name: data.name.trim(),
        description: data.description || undefined,
        status: "planning",
        start_date: data.start_date || undefined,
        end_date: data.end_date || undefined,
        budget_cents: budgetCents,
      });

      // Create phases sequentially
      for (let i = 0; i < data.phases.length; i++) {
        const wp = data.phases[i];
        const phaseData: PhaseCreate = {
          name: wp.name,
          description: wp.description || undefined,
          order_index: i,
          status: "not_started",
        };
        const phase = await createPhase(project.id, phaseData);

        // Create tasks for this phase
        for (const wt of wp.tasks) {
          if (!wt.name.trim()) continue;
          const taskData: TaskCreate = {
            name: wt.name.trim(),
            status: "todo",
            priority: wt.priority,
            estimated_hours: wt.estimated_hours ? parseFloat(wt.estimated_hours) : undefined,
          };
          await createTask(project.id, phase.id, taskData);
        }
      }

      router.push("/dashboard/projects");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Er is een fout opgetreden");
    } finally {
      setSubmitting(false);
    }
  }

  function updatePhases(phases: WizardPhase[]) {
    setData((d) => ({ ...d, phases }));
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-2">Nieuw project</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Volg de stappen om een nieuw project aan te maken.
      </p>

      <StepIndicator current={step} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent>
          {step === 0 && (
            <Step1 data={data} onChange={setData} errors={errors} />
          )}
          {step === 1 && (
            <Step2 phases={data.phases} onChange={updatePhases} />
          )}
          {step === 2 && (
            <Step3 phases={data.phases} onChange={updatePhases} />
          )}
          {step === 3 && (
            <Step4
              data={data}
              submitting={submitting}
              error={submitError}
              onSubmit={handleSubmit}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-4">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrev}
          disabled={step === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Vorige
        </Button>

        {step < STEPS.length - 1 && (
          <Button type="button" onClick={handleNext}>
            Volgende
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
