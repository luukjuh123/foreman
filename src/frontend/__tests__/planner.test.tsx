import { beforeEach, describe, expect, it } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { PlannerProvider } from "@/components/planner/provider";
import { Jobs, Dashboard, Safety } from "@/components/planner/pages";
import { day, overlaps, seed, validJob } from "@/lib/planner";

beforeEach(() => localStorage.clear());
function mount(children: React.ReactNode) {
  return render(<PlannerProvider>{children}</PlannerProvider>);
}

describe("planning workspace", () => {
  it("works without authentication or integrations", async () => {
    mount(<Dashboard />);
    expect(
      await screen.findByRole("heading", { name: /Let’s get building/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Active jobs", { selector: ".kpi-top span" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sample forecast")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Riverside residence" }).length,
    ).toBeGreaterThan(0);
  });

  it("creates, filters, reschedules and persists a job", async () => {
    const { unmount } = mount(<Jobs />);
    fireEvent.click(await screen.findByRole("button", { name: "New job" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Job name"), {
      target: { value: "Warehouse roof" },
    });
    fireEvent.change(dialog.getByLabelText("Crew"), {
      target: { value: "Team Atlas" },
    });
    expect(dialog.getByRole("status")).toHaveTextContent("another job");
    fireEvent.click(dialog.getByRole("button", { name: "Create job" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search jobs" }), {
      target: { value: "Warehouse roof" },
    });
    expect(
      screen.queryByRole("button", { name: "Riverside residence" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Warehouse roof" }));
    const edit = within(screen.getByRole("dialog"));
    fireEvent.change(edit.getByLabelText("Start date"), {
      target: { value: "2027-01-15" },
    });
    fireEvent.change(edit.getByLabelText("End date"), {
      target: { value: "2027-01-20" },
    });
    fireEvent.click(edit.getByRole("button", { name: "Save changes" }));
    unmount();
    mount(<Jobs />);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(
      await screen.findByRole("button", { name: "Warehouse roof" }),
    ).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("foreman-planner-v1")!);
    expect(
      saved.jobs.find((j: { name: string }) => j.name === "Warehouse roof")
        .start,
    ).toBe("2027-01-15");
  });

  it("requires a second action to delete a job", async () => {
    mount(<Jobs />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Riverside residence" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(
      screen.queryByRole("button", { name: "Riverside residence" }),
    ).not.toBeInTheDocument();
  });

  it("keeps safety checks across remounts", async () => {
    const { unmount } = mount(<Safety />);
    fireEvent.click((await screen.findAllByRole("checkbox"))[0]);
    unmount();
    mount(<Safety />);
    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")[0]).toBeChecked(),
    );
  });

  it("recovers from malformed browser storage", async () => {
    localStorage.setItem("foreman-planner-v1", '{"jobs":null}');
    mount(<Jobs />);
    expect(
      await screen.findByRole("button", { name: "Riverside residence" }),
    ).toBeInTheDocument();
  });
});

describe("schedule dates and conflicts", () => {
  it("handles calendar boundaries and inclusive overlapping assignments", () => {
    expect(day("2026-12-31", 1)).toBe("2027-01-01");
    const a = seed().jobs[0];
    expect(overlaps(a, { ...a, id: "other", start: a.end })).toBe(true);
    expect(
      overlaps(a, {
        ...a,
        id: "other",
        start: day(a.end, 1),
        end: day(a.end, 2),
      }),
    ).toBe(false);
    expect(overlaps(a, { ...a, id: "other", status: "Complete" })).toBe(false);
    expect(
      overlaps(
        { ...a, crew: "Unassigned" },
        { ...a, id: "other", crew: "Unassigned" },
      ),
    ).toBe(false);
  });
  it("rejects invalid persisted jobs", () => {
    expect(validJob({ ...seed().jobs[0], progress: 500 })).toBe(false);
    expect(validJob({ ...seed().jobs[0], start: "not-a-date" })).toBe(false);
  });
});
