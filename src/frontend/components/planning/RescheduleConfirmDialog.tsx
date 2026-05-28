"use client";

import React, { useState } from "react";
import type { RescheduleSuggestion, RescheduleItem } from "@/lib/weather";
import { WeatherRiskBadge } from "@/components/agenda/WeatherRiskBadge";

interface RescheduleConfirmDialogProps {
  open: boolean;
  suggestions: RescheduleSuggestion[];
  onConfirm: (accepted: RescheduleItem[]) => void;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Modal dialog that shows a list of weather-rescheduling suggestions and lets
 * the user confirm or cancel. Only tasks with a suggested date can be accepted.
 */
export function RescheduleConfirmDialog({
  open,
  suggestions,
  onConfirm,
  onClose,
}: RescheduleConfirmDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        suggestions
          .filter((s) => s.suggested_start !== null)
          .map((s) => s.task_id)
      )
  );

  if (!open) return null;

  function toggle(taskId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function handleConfirm() {
    const accepted: RescheduleItem[] = suggestions
      .filter(
        (s) =>
          selected.has(s.task_id) &&
          s.suggested_start !== null &&
          s.suggested_end !== null
      )
      .map((s) => ({
        task_id: s.task_id,
        new_start: s.suggested_start!,
        new_end: s.suggested_end!,
      }));
    onConfirm(accepted);
  }

  return (
    <div
      data-testid="reschedule-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg shadow-xl w-full max-w-xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="text-base font-semibold text-white">
            Hertplannen wegens weersomstandigheden
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            De volgende buitentaken zijn gepland op dagen met slecht weer. Kies
            welke taken je wilt verplaatsen.
          </p>
        </div>

        {/* Suggestions list */}
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-700/50">
          {suggestions.map((s) => {
            const hasSuggestion = s.suggested_start !== null;
            const isChecked = selected.has(s.task_id) && hasSuggestion;

            return (
              <div key={s.task_id} className="px-5 py-3 flex items-start gap-3">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!hasSuggestion}
                  onChange={() => hasSuggestion && toggle(s.task_id)}
                  className="mt-0.5 accent-amber-400 cursor-pointer disabled:cursor-not-allowed"
                  aria-label={`Selecteer ${s.task_name}`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">
                      {s.task_name}
                    </span>
                    <WeatherRiskBadge
                      riskType={s.weather_risk}
                      details={s.weather_details}
                    />
                  </div>

                  <div className="mt-1 text-xs text-gray-400 flex items-center gap-2">
                    <span>
                      Huidig:{" "}
                      <span className="text-gray-300">
                        {formatDate(s.current_start)}
                        {s.current_end !== s.current_start
                          ? ` – ${formatDate(s.current_end)}`
                          : ""}
                      </span>
                    </span>
                    <span>→</span>
                    <span>
                      Voorstel:{" "}
                      {hasSuggestion ? (
                        <span className="text-amber-300">
                          {formatDate(s.suggested_start)}
                          {s.suggested_end !== s.suggested_start
                            ? ` – ${formatDate(s.suggested_end)}`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-gray-500 italic">Geen voorstel</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Annuleer
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 text-sm rounded bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors"
          >
            Bevestig herplannen
          </button>
        </div>
      </div>
    </div>
  );
}
