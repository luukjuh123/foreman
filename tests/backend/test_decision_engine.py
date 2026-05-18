"""Tests for the AI agent decision engine — prioritized 'do next' task list."""

from __future__ import annotations

import pytest

from app.services.planning.decision_engine import (
    DecisionEngine,
    DecisionInput,
    TaskStatus,
)


def _row(tid: str, hours: float, deps: list[str] | None = None,
         status: TaskStatus = "todo") -> DecisionInput:
    return DecisionInput(
        task_id=tid,
        name=tid,
        duration_hours=hours,
        dependencies=deps or [],
        status=status,
    )


def test_ready_tasks_ranked_above_blocked() -> None:
    rows = [
        _row("a", 4),                          # ready
        _row("b", 4, deps=["a"]),              # blocked by a (a is todo, not done)
    ]
    plan = DecisionEngine().decide(rows)
    # Only the ready task is returned in the prioritized list
    assert [d.task_id for d in plan.priorities] == ["a"]
    # And b shows up in `blocked` with a reasoning explaining why
    assert plan.blocked[0].task_id == "b"
    assert "a" in plan.blocked[0].reasoning


def test_critical_path_tasks_rank_first() -> None:
    # Diamond — t2b (longer) on critical path; t2a (shorter) has slack.
    rows = [
        _row("t1", 1, status="done"),
        _row("t2a", 4, deps=["t1"]),
        _row("t2b", 6, deps=["t1"]),
        _row("t3", 1, deps=["t2a", "t2b"]),
    ]
    plan = DecisionEngine().decide(rows)
    # Among ready (t2a, t2b), the critical one (t2b) must come first.
    ready_order = [d.task_id for d in plan.priorities]
    assert ready_order.index("t2b") < ready_order.index("t2a")


def test_in_progress_listed_separately_with_reasoning() -> None:
    rows = [_row("a", 4, status="in_progress"), _row("b", 2)]
    plan = DecisionEngine().decide(rows)
    assert {d.task_id for d in plan.in_progress} == {"a"}
    assert "progress" in plan.in_progress[0].reasoning.lower()
    # Ready set excludes in-progress
    assert [d.task_id for d in plan.priorities] == ["b"]


def test_completed_tasks_dropped() -> None:
    rows = [_row("a", 1, status="done"), _row("b", 1, deps=["a"])]
    plan = DecisionEngine().decide(rows)
    # b is unblocked because a is done
    assert [d.task_id for d in plan.priorities] == ["b"]
    # No `done` entries in any list
    all_ids = {d.task_id for d in (*plan.priorities, *plan.blocked, *plan.in_progress)}
    assert "a" not in all_ids


def test_every_decision_includes_reasoning() -> None:
    rows = [
        _row("a", 2),
        _row("b", 2, status="in_progress"),
        _row("c", 2, deps=["a"]),
    ]
    plan = DecisionEngine().decide(rows)
    for d in (*plan.priorities, *plan.blocked, *plan.in_progress):
        assert isinstance(d.reasoning, str) and d.reasoning
        # Reasoning lists at least one factor
        assert len(d.factors) >= 1


def test_priority_scores_are_monotonically_descending() -> None:
    rows = [_row(f"t{i}", float(i + 1)) for i in range(5)]
    plan = DecisionEngine().decide(rows)
    scores = [d.score for d in plan.priorities]
    assert scores == sorted(scores, reverse=True)


def test_empty_input_returns_empty_plan() -> None:
    plan = DecisionEngine().decide([])
    assert plan.priorities == [] and plan.blocked == [] and plan.in_progress == []


def test_blocked_status_treated_as_blocked() -> None:
    rows = [_row("a", 4, status="blocked")]
    plan = DecisionEngine().decide(rows)
    assert [d.task_id for d in plan.blocked] == ["a"]
    assert "blocked" in plan.blocked[0].reasoning.lower()


def test_top_n_truncates_priorities() -> None:
    rows = [_row(f"t{i}", 1) for i in range(10)]
    plan = DecisionEngine().decide(rows, top_n=3)
    assert len(plan.priorities) == 3


def test_dependency_cycle_raises() -> None:
    rows = [_row("a", 1, deps=["b"]), _row("b", 1, deps=["a"])]
    with pytest.raises(ValueError, match="cycle"):
        DecisionEngine().decide(rows)
