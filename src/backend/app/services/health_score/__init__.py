"""Project health score service package.

Re-exports the public API used by the projects router.
"""

from app.services.health_score.calculator import (
    HealthFactors,
    HealthGrade,
    HealthScoreResult,
    ProjectHealthCalculator,
    compute_health_score,
)


def calculate_health_score(project: object) -> HealthScoreResult:  # type: ignore[type-arg]
    """Derive a HealthScoreResult from a SQLAlchemy Project ORM object.

    This thin wrapper is the single entry-point used by the projects router.
    It extracts the relevant fields from the project and delegates to the
    pure compute_health_score() function.
    """
    from datetime import date

    tasks = list(project.tasks) if hasattr(project, "tasks") else []  # type: ignore[union-attr]
    budget_cents: int = getattr(project, "budget_cents", 0) or 0
    actual_spend_cents: int = getattr(project, "actual_spend_cents", 0) or 0
    actual_hours_total: float = getattr(project, "actual_hours_total", 0.0) or 0.0

    calculator = ProjectHealthCalculator(
        tasks=tasks,
        today=date.today(),
        budget_cents=budget_cents,
        actual_spend_cents=actual_spend_cents,
        actual_hours_total=actual_hours_total,
    )
    return compute_health_score(calculator.compute_factors())


__all__ = [
    "HealthFactors",
    "HealthGrade",
    "HealthScoreResult",
    "ProjectHealthCalculator",
    "compute_health_score",
    "calculate_health_score",
]
