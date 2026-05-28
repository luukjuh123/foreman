import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useParams: vi.fn(() => ({ id: "project-1" })),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "mock-token"),
}));

import { WeatherGanttOverlay } from "@/components/gantt/WeatherGanttOverlay";
import { WeatherRiskBadge } from "@/components/agenda/WeatherRiskBadge";
import { RescheduleConfirmDialog } from "@/components/planning/RescheduleConfirmDialog";
import { classifyWeatherDay } from "@/lib/weather";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function offsetIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// WeatherGanttOverlay
// ---------------------------------------------------------------------------

describe("WeatherGanttOverlay", () => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 1);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 5);

  const todayIso = new Date().toISOString().split("T")[0];
  const tomorrowIso = offsetIso(1);

  const forecast = [
    {
      date: todayIso,
      weather_risk: "good" as const,
      precipitation_mm: 0,
      wind_speed_kmh: 10,
      temp_min: 12,
      temp_max: 20,
      weather_code: 1,
      description: "Mainly clear",
    },
    {
      date: tomorrowIso,
      weather_risk: "poor" as const,
      precipitation_mm: 15,
      wind_speed_kmh: 60,
      temp_min: -1,
      temp_max: 5,
      weather_code: 65,
      description: "Heavy rain",
    },
  ];

  it("renders weather icons for each forecast day", () => {
    render(
      <WeatherGanttOverlay
        startDate={startDate}
        endDate={endDate}
        dayWidthPx={40}
        forecast={forecast}
      />
    );
    const cells = screen.getAllByTestId("weather-day-cell");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("marks poor weather days with a visual indicator", () => {
    render(
      <WeatherGanttOverlay
        startDate={startDate}
        endDate={endDate}
        dayWidthPx={40}
        forecast={forecast}
      />
    );
    const poorCells = screen.getAllByTestId("weather-risk-poor");
    expect(poorCells.length).toBeGreaterThan(0);
  });

  it("marks good weather days differently", () => {
    render(
      <WeatherGanttOverlay
        startDate={startDate}
        endDate={endDate}
        dayWidthPx={40}
        forecast={forecast}
      />
    );
    const goodCells = screen.getAllByTestId("weather-risk-good");
    expect(goodCells.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// WeatherRiskBadge
// ---------------------------------------------------------------------------

describe("WeatherRiskBadge", () => {
  it("renders rain badge", () => {
    render(<WeatherRiskBadge riskType="rain" details="15.0 mm neerslag" />);
    expect(screen.getByTestId("weather-risk-badge")).toBeInTheDocument();
    expect(screen.getByText(/regen/i)).toBeInTheDocument();
  });

  it("renders wind badge", () => {
    render(<WeatherRiskBadge riskType="wind" details="50 km/h wind" />);
    expect(screen.getByTestId("weather-risk-badge")).toBeInTheDocument();
    expect(screen.getByText(/wind/i)).toBeInTheDocument();
  });

  it("renders frost badge", () => {
    render(<WeatherRiskBadge riskType="frost" details="-1.5 °C" />);
    expect(screen.getByTestId("weather-risk-badge")).toBeInTheDocument();
    expect(screen.getByText(/vorst/i)).toBeInTheDocument();
  });

  it("shows tooltip on hover with details text", async () => {
    render(<WeatherRiskBadge riskType="rain" details="12.5 mm neerslag" />);
    const badge = screen.getByTestId("weather-risk-badge");
    fireEvent.mouseEnter(badge);
    await waitFor(() => {
      expect(screen.getByText("12.5 mm neerslag")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// RescheduleConfirmDialog
// ---------------------------------------------------------------------------

describe("RescheduleConfirmDialog", () => {
  const suggestions = [
    {
      task_id: "task-1",
      task_name: "Dakdekken fase 1",
      project_id: "project-1",
      phase_id: "phase-1",
      current_start: offsetIso(1),
      current_end: offsetIso(2),
      suggested_start: offsetIso(3),
      suggested_end: offsetIso(4),
      weather_risk: "rain" as const,
      weather_details: "15.0 mm neerslag verwacht",
    },
    {
      task_id: "task-2",
      task_name: "Schilderwerk gevel",
      project_id: "project-1",
      phase_id: "phase-1",
      current_start: offsetIso(2),
      current_end: offsetIso(3),
      suggested_start: null,
      suggested_end: null,
      weather_risk: "wind" as const,
      weather_details: "55 km/h wind",
    },
  ];

  it("renders dialog with suggestion list", () => {
    render(
      <RescheduleConfirmDialog
        open={true}
        suggestions={suggestions}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Dakdekken fase 1")).toBeInTheDocument();
    expect(screen.getByText("Schilderwerk gevel")).toBeInTheDocument();
  });

  it("shows weather risk type for each suggestion", () => {
    render(
      <RescheduleConfirmDialog
        open={true}
        suggestions={suggestions}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/regen/i)).toBeInTheDocument();
    expect(screen.getByText(/wind/i)).toBeInTheDocument();
  });

  it("shows 'geen voorstel' when no suggested date", () => {
    render(
      <RescheduleConfirmDialog
        open={true}
        suggestions={suggestions}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/geen voorstel/i)).toBeInTheDocument();
  });

  it("calls onConfirm with accepted reschedules when confirmed", async () => {
    const onConfirm = vi.fn();
    render(
      <RescheduleConfirmDialog
        open={true}
        suggestions={suggestions}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    const confirmBtn = screen.getByRole("button", { name: /bevestig/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledOnce();
    });
    const [accepted] = onConfirm.mock.calls[0];
    const hasTask1 = accepted.some((r: { task_id: string }) => r.task_id === "task-1");
    expect(hasTask1).toBe(true);
  });

  it("calls onClose when cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <RescheduleConfirmDialog
        open={true}
        suggestions={suggestions}
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: /annuleer/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not render when open=false", () => {
    render(
      <RescheduleConfirmDialog
        open={false}
        suggestions={suggestions}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText("Dakdekken fase 1")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// classifyWeatherDay helper
// ---------------------------------------------------------------------------

describe("classifyWeatherDay", () => {
  it("classifies a rainy day as poor", () => {
    expect(
      classifyWeatherDay({ precipitation_mm: 15, wind_speed_kmh: 10, temp_min: 12 })
    ).toBe("poor");
  });

  it("classifies a windy day as poor", () => {
    expect(
      classifyWeatherDay({ precipitation_mm: 0, wind_speed_kmh: 65, temp_min: 12 })
    ).toBe("poor");
  });

  it("classifies a frosty day as poor", () => {
    expect(
      classifyWeatherDay({ precipitation_mm: 0, wind_speed_kmh: 10, temp_min: -2 })
    ).toBe("poor");
  });

  it("classifies a moderate rain day as moderate", () => {
    expect(
      classifyWeatherDay({ precipitation_mm: 3, wind_speed_kmh: 10, temp_min: 12 })
    ).toBe("moderate");
  });

  it("classifies a clear day as good", () => {
    expect(
      classifyWeatherDay({ precipitation_mm: 0, wind_speed_kmh: 10, temp_min: 15 })
    ).toBe("good");
  });
});
