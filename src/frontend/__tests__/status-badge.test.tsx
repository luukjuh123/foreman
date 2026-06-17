import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge, STATUS_CLASSES, STATUS_LABELS } from "@/components/ui/status-badge";

describe("StatusBadge", () => {
  it("renders label for known project status", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText("Actief")).toBeInTheDocument();
  });

  it("renders label for task status done", () => {
    render(<StatusBadge status="done" />);
    expect(screen.getByText("Klaar")).toBeInTheDocument();
  });

  it("renders label for document category contract", () => {
    render(<StatusBadge status="contract" />);
    expect(screen.getByText("Contract")).toBeInTheDocument();
  });

  it("falls back to status key for unknown status", () => {
    render(<StatusBadge status="unknown_status" />);
    expect(screen.getByText("unknown_status")).toBeInTheDocument();
  });

  it("respects custom label override", () => {
    render(<StatusBadge status="active" label="Aangepast" />);
    expect(screen.getByText("Aangepast")).toBeInTheDocument();
  });

  it("applies correct color class for blocked task", () => {
    render(<StatusBadge status="blocked" />);
    const badge = screen.getByText("Geblokkeerd");
    expect(badge.className).toContain("text-red-400");
  });

  it("applies correct color class for paid invoice", () => {
    render(<StatusBadge status="paid" />);
    const badge = screen.getByText("Betaald");
    expect(badge.className).toContain("text-emerald-400");
  });

  it("STATUS_LABELS covers all STATUS_CLASSES keys", () => {
    const classKeys = Object.keys(STATUS_CLASSES);
    const labelKeys = Object.keys(STATUS_LABELS);
    expect(classKeys.sort()).toEqual(labelKeys.sort());
  });
});
