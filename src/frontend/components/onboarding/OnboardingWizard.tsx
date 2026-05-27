"use client";

import React, { useState } from "react";
import { createProject, createPhase, createTask } from "@/lib/projects";

const ONBOARDING_KEY = "foreman_onboarding_complete";

interface Step {
  title: string;
  content: React.ReactNode;
}

interface OnboardingWizardProps {
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Step contents
// ---------------------------------------------------------------------------

function StepWelcome() {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        Foreman helpt bouwbedrijven hun projecten, planning, facturen en personeel overzichtelijk
        te beheren — alles op één plek.
      </p>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Projectplanning met AI-ondersteuning</li>
        <li>Financieel overzicht en facturen</li>
        <li>Personeelsbeheer en urenregistratie</li>
        <li>Klantrapportages en voortgangsoverzichten</li>
      </ul>
    </div>
  );
}

function StepProjects() {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        Maak projecten aan voor elke bouwklus. Voeg fasen en taken toe om de voortgang bij te
        houden. Stel budgetten in en koppel facturen direct aan projecten.
      </p>
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <strong>Tip:</strong> Gebruik de projectwizard om snel een nieuw project op te zetten met
        fasen en taken.
      </div>
    </div>
  );
}

function StepPlanning() {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        De AI-planningsmodule stelt automatisch een realistische planning op op basis van uw
        taken en beschikbare medewerkers.
      </p>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Gantt-diagrammen voor visueel overzicht</li>
        <li>Automatische roosteroptimalisatie</li>
        <li>Waarschuwingen bij planningsconflicten</li>
      </ul>
    </div>
  );
}

function StepFinancials() {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        Houd inkomsten en uitgaven bij, maak UBL-facturen en exporteer boekhouddata. Foreman
        ondersteunt het Nederlandse btw-systeem en Peppol-facturering.
      </p>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Facturen aanmaken en versturen</li>
        <li>Kostenoverzichten per project</li>
        <li>Exporteren naar boekhoudpakket</li>
      </ul>
    </div>
  );
}

interface StepSampleProjectProps {
  onCreated: (projectId: string) => void;
}

function StepSampleProject({ onCreated }: StepSampleProjectProps) {
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const project = await createProject({
        name: "Voorbeeld Renovatie",
        description: "Automatisch aangemaakt voorbeeldproject",
        status: "active",
        budget_cents: 5000000,
      });

      const phases = [
        {
          name: "Sloop",
          tasks: ["Oude keuken verwijderen", "Vloer strippen"],
        },
        {
          name: "Ruwbouw",
          tasks: ["Muren plaatsen", "Leidingwerk"],
        },
        {
          name: "Afwerking",
          tasks: ["Stucen", "Schilderen", "Vloer leggen"],
        },
      ];

      for (let i = 0; i < phases.length; i++) {
        const phase = await createPhase(project.id, {
          name: phases[i].name,
          order_index: i,
          status: "not_started",
        });
        for (const taskName of phases[i].tasks) {
          await createTask(project.id, phase.id, {
            name: taskName,
            status: "todo",
            priority: "medium",
          });
        }
      }

      setCreated(project.id);
      onCreated(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-3">
        <p className="font-medium text-green-600">Project aangemaakt!</p>
        <p className="text-sm text-muted-foreground">
          Het voorbeeldproject is klaar. U kunt het nu bekijken en verkennen.
        </p>
        <a
          href={`/dashboard/projects/${created}`}
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Bekijk voorbeeldproject
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        Klik op de knop om een voorbeeldproject aan te maken met fasen en taken. Zo kunt u
        Foreman direct verkennen.
      </p>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Fase: Sloop (2 taken)</li>
        <li>Fase: Ruwbouw (2 taken)</li>
        <li>Fase: Afwerking (3 taken)</li>
      </ul>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <button
        onClick={handleCreate}
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Aanmaken..." : "Maak voorbeeldproject"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export default function OnboardingWizard({ onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [sampleProjectId, setSampleProjectId] = useState<string | null>(null);

  const steps: Step[] = [
    { title: "Welkom bij Foreman!", content: <StepWelcome /> },
    { title: "Projectbeheer", content: <StepProjects /> },
    { title: "AI-planning en Gantt", content: <StepPlanning /> },
    { title: "Financiën en facturatie", content: <StepFinancials /> },
    {
      title: "Voorbeeldproject aanmaken",
      content: <StepSampleProject onCreated={(id) => setSampleProjectId(id)} />,
    },
  ];

  const totalSteps = steps.length;
  const isFirst = step === 0;
  const isLast = step === totalSteps - 1;

  function dismiss() {
    localStorage.setItem(ONBOARDING_KEY, "true");
    onClose?.();
  }

  function handleNext() {
    if (!isLast) {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (!isFirst) {
      setStep((s) => s - 1);
    }
  }

  function handleFinish() {
    localStorage.setItem(ONBOARDING_KEY, "true");
    onClose?.();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
        {/* Step dots */}
        <div className="mb-6 flex justify-center gap-2">
          {steps.map((_, i) => (
            <span
              key={i}
              role="presentation"
              className={`h-2 w-2 rounded-full transition-colors ${
                i === step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step heading */}
        <h2 className="mb-4 text-xl font-bold text-foreground">
          {steps[step].title}
        </h2>

        {/* Step content */}
        <div className="mb-6">{steps[step].content}</div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div>
            {!isFirst && (
              <button
                onClick={handleBack}
                className="rounded-md border px-4 py-2 text-sm font-medium"
              >
                Vorige
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={dismiss}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground"
            >
              Overslaan
            </button>

            {isLast ? (
              <button
                onClick={handleFinish}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Afronden
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Volgende
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
