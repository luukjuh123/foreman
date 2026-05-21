"""Agent decision engine — emit a prioritized 'do next' task list.

Given the current state of all tasks in a project (their dependencies,
estimated durations, statuses), the decision engine returns three buckets:

- `priorities` — ranked list of READY tasks (deps satisfied, status=todo).
  Each carries a `score`, the contributing `factors`, and a human-readable
  `reasoning` string (foreman convention).
- `in_progress` — tasks currently being worked on.
- `blocked` — tasks held up by unfinished dependencies or blocked status.

This is a pure function over project state — no I/O, no LLM. The optional
LLMClient hook is intentionally NOT included here: this engine is the
deterministic floor that runs every time. A higher-level agent can layer
an LLM rationale on top of these scores if needed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.services.planning.cpm import CpmTask, compute_critical_path

TaskStatus = Literal["todo", "in_progress", "done", "blocked"]


@dataclass
class DecisionInput:
    """One row of project state fed into the decision engine."""

    task_id: str
    name: str
    duration_hours: float
    dependencies: list[str] = field(default_factory=list)
    status: TaskStatus = "todo"


@dataclass
class Decision:
    """One emitted decision — its score and why it ranks where it does."""

    task_id: str
    name: str
    score: float
    reasoning: str
    factors: list[str] = field(default_factory=list)


@dataclass
class DecisionPlan:
    priorities: list[Decision]
    in_progress: list[Decision]
    blocked: list[Decision]


class DecisionEngine:
    """Deterministic priority scorer."""

    # Weighting knobs — kept conservative; tuning is easy if needed later.
    CRITICAL_BONUS = 1000.0
    FLOAT_PENALTY = 1.0  # per hour of total_float
    DURATION_PENALTY = 0.1  # per hour — prefer shorter tasks slightly

    def decide(self, rows: list[DecisionInput], *, top_n: int | None = None) -> DecisionPlan:
        if not rows:
            return DecisionPlan(priorities=[], in_progress=[], blocked=[])

        # Run CPM over the FULL task set (including done) so float values are
        # meaningful — but only completed tasks have their finish time at 0
        # effectively. Simpler: include everything; the relative ordering of
        # ready tasks by criticality is what we need.
        cpm_tasks = [
            CpmTask(
                id=r.task_id, name=r.name, duration_hours=max(r.duration_hours, 0.0), dependencies=list(r.dependencies)
            )
            for r in rows
        ]
        compute_critical_path(cpm_tasks)
        cpm_by_id = {t.id: t for t in cpm_tasks}
        row_by_id = {r.task_id: r for r in rows}
        done_ids = {r.task_id for r in rows if r.status == "done"}

        priorities: list[Decision] = []
        in_progress: list[Decision] = []
        blocked: list[Decision] = []

        for r in rows:
            if r.status == "done":
                continue
            cpm = cpm_by_id[r.task_id]
            unmet = [d for d in r.dependencies if d not in done_ids]

            if r.status == "in_progress":
                in_progress.append(
                    Decision(
                        task_id=r.task_id,
                        name=r.name,
                        score=0.0,
                        reasoning=f"Task '{r.name}' is currently in progress.",
                        factors=["in_progress"],
                    )
                )
                continue

            if r.status == "blocked":
                blocked.append(
                    Decision(
                        task_id=r.task_id,
                        name=r.name,
                        score=0.0,
                        reasoning=f"Task '{r.name}' is marked blocked.",
                        factors=["status=blocked"],
                    )
                )
                continue

            if unmet:
                blocked.append(
                    Decision(
                        task_id=r.task_id,
                        name=r.name,
                        score=0.0,
                        reasoning=(
                            f"Waiting on unfinished dependencies: "
                            f"{', '.join(row_by_id[d].name for d in unmet if d in row_by_id)}"
                        ),
                        factors=[f"depends_on={','.join(unmet)}"],
                    )
                )
                continue

            # Ready task — score it.
            factors: list[str] = []
            score = 0.0
            if cpm.is_critical:
                score += self.CRITICAL_BONUS
                factors.append("on critical path")
            else:
                pen = self.FLOAT_PENALTY * cpm.total_float
                score -= pen
                factors.append(f"slack={cpm.total_float:.1f}h")
            score -= self.DURATION_PENALTY * cpm.duration_hours
            factors.append(f"duration={cpm.duration_hours:.1f}h")

            reasoning_bits = ["Ready to start — " + "; ".join(factors)]
            priorities.append(
                Decision(
                    task_id=r.task_id,
                    name=r.name,
                    score=score,
                    reasoning=" ".join(reasoning_bits),
                    factors=factors,
                )
            )

        priorities.sort(key=lambda d: (-d.score, d.task_id))
        if top_n is not None:
            priorities = priorities[:top_n]

        return DecisionPlan(priorities=priorities, in_progress=in_progress, blocked=blocked)
