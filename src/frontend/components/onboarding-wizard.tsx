"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createProject, createPhase, createTask } from "@/lib/projects";
import {
  CheckCircle2,
  FolderKanban,
  CalendarClock,
  Receipt,
  Clock,
  ChevronRight,
} from "lucide-react";

// Constants

const ONBOARDING_KEY = "foreman_onboarding_done";

const SAMPLE_PROJECT_NAME = "Badkamer renovatie";
const SAMPLE_PROJECT_DESCRIPTION =
  "Volledige renovatie van de badkamer inclusief sloop, nieuwe leidingen, betegeling en afwerking.";

interface SamplePhase {
  name: string;
  tasks: string[];
}

const SAMPLE_PHASES: SamplePhase[] = [
  { name: "Sloop", tasks: ["Verwijderen tegels", "Verwijderen sanitair"] },
  { name: "Leidingwerk", tasks: ["Waterleiding aanleggen", "Riolering aanpassen"] },
  { name: "Tegelen", tasks: ["Vloertegels plaatsen", "Wandtegels plaatsen"] },
  { name: "Afwerking", tasks: ["Sanitair plaatsen", "Schilderwerk"] },
];

// Stepper

function Stepper({ currentStep, totalSteps, labels }: { currentStep: number; totalSteps: number; labels: string[] }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8" role="navigation" aria-label="Wizard stappen">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isDone = stepNum < currentStep;
        return (
          <React.Fragment key={stepNum}>
            <div className="flex flex-col items-center">
              <div
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  isActive
                    ? "bg-amber-500 text-black"
                    : isDone
                    ? "bg-amber-500/40 text-amber-300"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
                aria-current={isActive ? "step" : undefined}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
              </div>
              <span
                className={[
                  "mt-1 hidden text-xs sm:block",
                  isActive ? "text-amber-400 font-medium" : "text-muted-foreground",
                ].join(" ")}
              >
                {labels[i]}
              </span>
            </div>
            {stepNum < totalSteps && (
              <div
                className={[
                  "h-0.5 w-10 sm:w-16 mx-1 mt-[-1rem]",
                  isDone ? "bg-amber-500/40" : "bg-muted",
                ].join(" ")}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Step 1 — Welkom

function Step1Welcome({ onBegin, onSkip }: { onBegin: () => void; onSkip: () => void }) {
  const features = [
    {
      icon: <FolderKanban className="h-5 w-5 text-amber-400" />,
      title: "Projectplanning",
      description: "Beheer al uw bouwprojecten op één plek met fasen, taken en deadlines.",
    },
    {
      icon: <CalendarClock className="h-5 w-5 text-amber-400" />,
      title: "AI-planning",
      description: "Laat de AI uw werkrooster automatisch optimaliseren op basis van prioriteiten.",
    },
    {
      icon: <Receipt className="h-5 w-5 text-amber-400" />,
      title: "Facturatie",
      description: "Maak en verstuur facturen rechtstreeks vanuit uw project (UBL/Peppol).",
    },
    {
      icon: <Clock className="h-5 w-5 text-amber-400" />,
      title: "Urenregistratie",
      description: "Registreer gewerkte uren per project en medewerker in real-time.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-foreground">Welkom bij Foreman</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Het complete platform voor uw bouwbedrijf. Laten we u in een paar stappen op weg helpen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div
            key={f.title}
            className="flex gap-3 rounded-lg border bg-card p-4"
          >
            <div className="mt-0.5 shrink-0">{f.icon}</div>
            <div>
              <p className="text-sm font-semibold text-foreground">{f.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
            </div>
          </div>
        ))}
      </div>

      <WizardNav onSkip={onSkip} onNext={onBegin} nextLabel="Begin" />
    </div>
  );
}

// Step 2 — Uw eerste project

function WizardNav({ onSkip, onBack, onNext, nextLabel, isLoading }: {
  onSkip: () => void; onBack?: () => void; onNext: () => void; nextLabel: string; isLoading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onSkip} disabled={isLoading}>Overslaan</Button>
        {onBack && <Button variant="outline" size="sm" onClick={onBack} disabled={isLoading}>Vorige</Button>}
      </div>
      <Button onClick={onNext} disabled={isLoading} className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2">
        {nextLabel} <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Step2Project({ projectName, projectDescription, onChangeName, onChangeDescription, onNext, onBack, onSkip }: {
  projectName: string; projectDescription: string; onChangeName: (v: string) => void;
  onChangeDescription: (v: string) => void; onNext: () => void; onBack: () => void; onSkip: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Uw eerste project</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          We hebben alvast een voorbeeldproject voor u klaargezet. U kunt het aanpassen of direct doorgaan.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="project-name" className="text-sm font-medium text-foreground">Projectnaam</label>
          <Input id="project-name" value={projectName} onChange={(e) => onChangeName(e.target.value)} placeholder="Naam van het project" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="project-description" className="text-sm font-medium text-foreground">Beschrijving</label>
          <textarea id="project-description" role="textbox" aria-label="Beschrijving" value={projectDescription}
            onChange={(e) => onChangeDescription(e.target.value)} rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Optionele beschrijving" />
        </div>
      </div>
      <WizardNav onSkip={onSkip} onBack={onBack} onNext={onNext} nextLabel="Volgende" />
    </div>
  );
}

// Step 3 — Fasen & taken

function Step3Phases({ projectName, onComplete, onBack, onSkip, isLoading, progress }: {
  projectName: string; onComplete: () => void; onBack: () => void; onSkip: () => void; isLoading: boolean; progress: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Fasen &amp; taken</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Voor <strong className="text-foreground">{projectName}</strong> worden de volgende fasen en taken aangemaakt.
        </p>
      </div>

      {/* Progress indicator */}
      {isLoading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Aanmaken...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      <div className="space-y-3" data-testid="phases-list">
        {SAMPLE_PHASES.map((phase, idx) => (
          <div key={phase.name} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                {idx + 1}
              </span>
              <span className="text-sm font-semibold text-foreground">{phase.name}</span>
            </div>
            <ul className="ml-7 space-y-1">
              {phase.tasks.map((task) => (
                <li key={task} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ChevronRight className="h-3 w-3 text-amber-500/60 shrink-0" />
                  {task}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <WizardNav onSkip={onSkip} onBack={onBack} onNext={onComplete} nextLabel={isLoading ? "Bezig..." : "Voltooien"} isLoading={isLoading} />
    </div>
  );
}

// Step 4 — Klaar!

function Step4Done({ projectId, projectName }: { projectId: string; projectName: string }) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
          <CheckCircle2 className="h-8 w-8 text-amber-400" />
        </div>
      </div>

      <div>
        <h2 className="text-3xl font-bold text-foreground">Klaar!</h2>
        <p className="text-muted-foreground mt-2">
          Uw project <strong className="text-foreground">{projectName}</strong> is aangemaakt met fasen en taken.
          U bent klaar om aan de slag te gaan.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild className="bg-amber-500 hover:bg-amber-400 text-black font-semibold">
          <Link href={`/dashboard/projects/${projectId}`}>
            Naar mijn project
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">
            Naar het dashboard
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 text-left space-y-3">
        <p className="text-sm font-semibold text-foreground">Ontdek meer functies</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { label: "AI-planning bekijken", href: "/dashboard/projects" },
            { label: "Factuur aanmaken", href: "/dashboard/invoices" },
            { label: "Materialen zoeken", href: "/dashboard/materials" },
            { label: "Personeel beheren", href: "/dashboard/staff" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main wizard component

const STEP_LABELS = ["Welkom", "Project", "Fasen", "Klaar!"];

export default function OnboardingWizard() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState(SAMPLE_PROJECT_NAME);
  const [projectDescription, setProjectDescription] = useState(SAMPLE_PROJECT_DESCRIPTION);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  function skip() {
    localStorage.setItem(ONBOARDING_KEY, "true");
    router.push("/dashboard");
  }

  async function handleComplete() {
    setIsLoading(true);
    setProgress(0);

    try {
      // Create project
      const project = await createProject({
        name: projectName,
        description: projectDescription || undefined,
        status: "planning",
      });
      setProgress(20);
      setCreatedProjectId(project.id);

      // Create phases and tasks
      const totalItems = SAMPLE_PHASES.length + SAMPLE_PHASES.reduce((s, p) => s + p.tasks.length, 0);
      let done = 0;

      for (const phase of SAMPLE_PHASES) {
        const createdPhase = await createPhase(project.id, {
          name: phase.name,
          order_index: SAMPLE_PHASES.indexOf(phase),
          status: "not_started",
        });
        done++;
        setProgress(20 + Math.round((done / totalItems) * 80));

        for (const taskName of phase.tasks) {
          await createTask(project.id, createdPhase.id, {
            name: taskName,
            status: "todo",
            priority: "medium",
          });
          done++;
          setProgress(20 + Math.round((done / totalItems) * 80));
        }
      }

      setProgress(100);
      localStorage.setItem(ONBOARDING_KEY, "true");
      setStep(4);
    } catch (err) {
      console.error("Onboarding fout:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 px-4">
      <Stepper currentStep={step} totalSteps={4} labels={STEP_LABELS} />

      <Card>
        <CardContent className="pt-6">
          {step === 1 && (
            <Step1Welcome
              onBegin={() => setStep(2)}
              onSkip={skip}
            />
          )}

          {step === 2 && (
            <Step2Project
              projectName={projectName}
              projectDescription={projectDescription}
              onChangeName={setProjectName}
              onChangeDescription={setProjectDescription}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
              onSkip={skip}
            />
          )}

          {step === 3 && (
            <Step3Phases
              projectName={projectName}
              onComplete={handleComplete}
              onBack={() => setStep(2)}
              onSkip={skip}
              isLoading={isLoading}
              progress={progress}
            />
          )}

          {step === 4 && (
            <Step4Done
              projectId={createdProjectId ?? ""}
              projectName={projectName}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
