"""Tests for the health_score service — calculate_health_score pure function.

No DB required; tests exercise scoring algorithm directly via mock objects.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest

from app.services.health_score import HealthScoreResult, calculate_health_score

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)
LAST_WEEK = TODAY - timedelta(days=7)
NEXT_WEEK = TODAY + timedelta(days=7)
THREE_WEEKS_AGO = TODAY - timedelta(days=21)
TWO_WEEKS_AHEAD = TODAY + timedelta(days=14)


# ---------------------------------------------------------------------------
# Minimal fake ORM objects
# ---------------------------------------------------------------------------


class _FakeTask:
    def __init__(
        self,
        *,
        status: str = "todo",
        start_date: date | None = None,
        end_date: date | None = None,
        labor_cost_cents: int = 0,
    ):
        self.id = uuid.uuid4()
        self.status = status
        self.start_date = start_date
        self.end_date = end_date
        self.labor_cost_cents = labor_cost_cents


class _FakePhase:
    def __init__(self, tasks: list[_FakeTask]):
        self.tasks = tasks


class _FakeProject:
    def __init__(
        self,
        phases: list[_FakePhase],
        *,
        budget_cents: int = 0,
        start_date: date | None = None,
        end_date: date | None = None,
    ):
        self.budget_cents = budget_cents
        self.start_date = start_date
        self.end_date = end_date
        self.phases = phases


# ---------------------------------------------------------------------------
# Result shape
# ---------------------------------------------------------------------------


def test_result_has_required_fields():
    """HealthScoreResult exposes all required fields."""
    project = _FakeProject([])
    result = calculate_health_score(project)  # type: ignore[arg-type]

    assert isinstance(result, HealthScoreResult)
    assert hasattr(result, "score")
    assert hasattr(result, "rating")
    assert hasattr(result, "schedule_score")
    assert hasattr(result, "budget_score")
    assert hasattr(result, "completion_score")
    assert hasattr(result, "overdue_score")
    assert hasattr(result, "details")
    assert isinstance(result.details, dict)


def test_result_score_is_int():
    project = _FakeProject([])
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert isinstance(result.score, int)


def test_rating_values():
    """rating must be one of red/amber/green."""
    project = _FakeProject([])
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.rating in ("red", "amber", "green")


# ---------------------------------------------------------------------------
# Score clamping
# ---------------------------------------------------------------------------


def test_score_clamped_0_100_worst_case():
    """Worst case: all overdue, over budget → score >= 0."""
    tasks = [
        _FakeTask(status="todo", end_date=LAST_WEEK, labor_cost_cents=999_999),
        _FakeTask(status="todo", end_date=LAST_WEEK, labor_cost_cents=999_999),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=1)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert 0 <= result.score <= 100


def test_score_clamped_best_case():
    """Best case: all done, within budget → score <= 100."""
    tasks = [_FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=100)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert 0 <= result.score <= 100


# ---------------------------------------------------------------------------
# Rating thresholds
# ---------------------------------------------------------------------------


def test_rating_green_above_70():
    """All done, within budget, no overdue → green (score > 70)."""
    tasks = [
        _FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=1_000),
        _FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=1_000),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.score > 70
    assert result.rating == "green"


def test_rating_red_below_40():
    """All overdue, nothing done, with dates showing zero progress → red (score < 40)."""
    tasks = [
        _FakeTask(status="todo", end_date=LAST_WEEK),
        _FakeTask(status="todo", end_date=LAST_WEEK),
        _FakeTask(status="todo", end_date=LAST_WEEK),
    ]
    # Include project dates: 100% elapsed, 0% done → schedule penalty too
    project = _FakeProject(
        [_FakePhase(tasks)],
        budget_cents=0,
        start_date=THREE_WEEKS_AGO,
        end_date=YESTERDAY,
    )
    result = calculate_health_score(project)  # type: ignore[arg-type]
    # completion=0, overdue=0, schedule penalized (0% done, 100% elapsed), budget=25 (no budget)
    # Total <= 25 → red
    assert result.score < 40
    assert result.rating == "red"


def test_rating_amber_boundary():
    """0% done, halfway through timeline, no overdue, within budget → amber range."""
    # 0% done but halfway through → completion=0, schedule penalized
    # overdue=25 (tasks not past end), budget=25 → total in 40-70 range
    tasks = [
        _FakeTask(status="todo", end_date=NEXT_WEEK),
        _FakeTask(status="todo", end_date=NEXT_WEEK),
    ]
    project = _FakeProject(
        [_FakePhase(tasks)],
        budget_cents=10_000,
        start_date=LAST_WEEK,
        end_date=NEXT_WEEK,
    )
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert 40 <= result.score <= 70
    assert result.rating == "amber"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_no_tasks_neutral():
    """Project with no tasks gets a neutral mid-range score."""
    project = _FakeProject([])
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert 0 <= result.score <= 100
    # Should not be red or green — neutral
    assert result.rating in ("amber", "green")


def test_no_budget_no_budget_penalty():
    """budget_cents=0 means no budget set → budget_score should be max (no penalty)."""
    tasks = [_FakeTask(status="todo", end_date=TOMORROW, labor_cost_cents=50_000)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.budget_score == 25  # full points when no budget set


def test_no_dates_no_schedule_penalty():
    """Project without start/end dates → schedule_score should be max (no penalty)."""
    tasks = [_FakeTask(status="todo", labor_cost_cents=0)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0, start_date=None, end_date=None)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.schedule_score == 25  # full points when dates unknown


def test_no_overdue_tasks():
    """Tasks not yet past end_date are not overdue."""
    tasks = [
        _FakeTask(status="todo", end_date=TOMORROW),
        _FakeTask(status="in_progress", end_date=NEXT_WEEK),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.overdue_score == 25  # full points — nothing overdue
    assert result.details["overdue_count"] == 0


def test_done_tasks_not_overdue():
    """Done tasks past end_date are NOT counted as overdue."""
    tasks = [
        _FakeTask(status="done", end_date=LAST_WEEK, labor_cost_cents=100),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.details["overdue_count"] == 0


def test_tasks_without_end_date_not_overdue():
    """Tasks with no end_date cannot be overdue."""
    tasks = [_FakeTask(status="todo", end_date=None)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.details["overdue_count"] == 0


# ---------------------------------------------------------------------------
# Completion component (25 pts)
# ---------------------------------------------------------------------------


def test_completion_all_done():
    """All tasks done → completion_score == 25."""
    tasks = [
        _FakeTask(status="done"),
        _FakeTask(status="done"),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.completion_score == 25


def test_completion_none_done():
    """No tasks done → completion_score == 0."""
    tasks = [
        _FakeTask(status="todo"),
        _FakeTask(status="in_progress"),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.completion_score == 0


def test_completion_half_done():
    """Half done → completion_score ~ 12 or 13."""
    tasks = [_FakeTask(status="done"), _FakeTask(status="todo")]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.completion_score == round(0.5 * 25)


# ---------------------------------------------------------------------------
# Budget component (25 pts)
# ---------------------------------------------------------------------------


def test_budget_within_budget_full_score():
    """Spending exactly at budget → budget_score == 25."""
    tasks = [_FakeTask(status="done", labor_cost_cents=10_000)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.budget_score == 25


def test_budget_under_budget_full_score():
    """Spending below budget → budget_score == 25."""
    tasks = [_FakeTask(status="done", labor_cost_cents=5_000)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.budget_score == 25


def test_budget_over_budget_penalized():
    """Spending 2x budget → budget_score < 25."""
    tasks = [_FakeTask(status="done", labor_cost_cents=20_000)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.budget_score < 25


def test_budget_far_over_budget_zero():
    """Spending massively over budget → budget_score == 0."""
    tasks = [_FakeTask(status="done", labor_cost_cents=100_000_000)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=1)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.budget_score == 0


def test_budget_details_include_burn_rate():
    """details dict includes budget_burn_rate."""
    tasks = [_FakeTask(status="done", labor_cost_cents=5_000)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert "budget_burn_rate" in result.details
    assert result.details["budget_burn_rate"] == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# Overdue component (25 pts)
# ---------------------------------------------------------------------------


def test_overdue_all_overdue_zero_score():
    """All tasks overdue → overdue_score == 0."""
    tasks = [
        _FakeTask(status="todo", end_date=LAST_WEEK),
        _FakeTask(status="in_progress", end_date=LAST_WEEK),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.overdue_score == 0


def test_overdue_count_in_details():
    """details includes overdue_count."""
    tasks = [
        _FakeTask(status="todo", end_date=LAST_WEEK),
        _FakeTask(status="done", end_date=LAST_WEEK),  # done — not overdue
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.details["overdue_count"] == 1


# ---------------------------------------------------------------------------
# Schedule component (25 pts)
# ---------------------------------------------------------------------------


def test_schedule_on_track():
    """Project ahead of schedule → full schedule_score."""
    # Elapsed = 7/14 days (50%), but 100% tasks done → ahead
    tasks = [
        _FakeTask(status="done"),
        _FakeTask(status="done"),
    ]
    project = _FakeProject(
        [_FakePhase(tasks)],
        start_date=LAST_WEEK,
        end_date=NEXT_WEEK,
    )
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.schedule_score == 25


def test_schedule_behind_penalized():
    """Project behind schedule → reduced schedule_score."""
    # All tasks still todo, halfway through timeline → behind
    tasks = [
        _FakeTask(status="todo"),
        _FakeTask(status="todo"),
    ]
    project = _FakeProject(
        [_FakePhase(tasks)],
        start_date=LAST_WEEK,
        end_date=NEXT_WEEK,
    )
    result = calculate_health_score(project)  # type: ignore[arg-type]
    # Planned progress ~50%, actual 0% → penalized
    assert result.schedule_score < 25


def test_schedule_details_include_progress():
    """details includes actual_progress and planned_progress."""
    tasks = [_FakeTask(status="done")]
    project = _FakeProject(
        [_FakePhase(tasks)],
        start_date=LAST_WEEK,
        end_date=NEXT_WEEK,
    )
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert "actual_progress" in result.details
    assert "planned_progress" in result.details


# ---------------------------------------------------------------------------
# Sub-score sum equals total score
# ---------------------------------------------------------------------------


def test_sub_scores_sum_to_total():
    """schedule + budget + completion + overdue == total score."""
    tasks = [
        _FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=3_000),
        _FakeTask(status="todo", end_date=TOMORROW, labor_cost_cents=0),
    ]
    project = _FakeProject(
        [_FakePhase(tasks)],
        budget_cents=10_000,
        start_date=LAST_WEEK,
        end_date=NEXT_WEEK,
    )
    result = calculate_health_score(project)  # type: ignore[arg-type]
    expected = result.schedule_score + result.budget_score + result.completion_score + result.overdue_score
    assert result.score == expected


def test_sub_scores_each_max_25():
    """Each sub-score is in 0-25 range."""
    tasks = [_FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=1_000)]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    for sub in (result.schedule_score, result.budget_score, result.completion_score, result.overdue_score):
        assert 0 <= sub <= 25


# ---------------------------------------------------------------------------
# Multi-phase project
# ---------------------------------------------------------------------------


def test_multi_phase_tasks_aggregated():
    """Tasks from multiple phases are all counted."""
    phase1 = _FakePhase([_FakeTask(status="done", end_date=YESTERDAY)])
    phase2 = _FakePhase([_FakeTask(status="todo", end_date=LAST_WEEK)])
    project = _FakeProject([phase1, phase2], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]
    assert result.details["total_tasks"] == 2
    assert result.details["done_tasks"] == 1
    assert result.details["overdue_count"] == 1
