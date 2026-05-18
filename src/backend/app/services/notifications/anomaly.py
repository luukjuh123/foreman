"""Anomaly detection for AI-driven project alerts.

Architecture:
- `Reasoner` is the LLM interface. `FakeReasoner` is a deterministic stub used
  in tests and as a safe default when no LLM is configured. An
  `OpenAIReasoner` (skeleton) can be wired in production via DI.
- `AnomalyDetector` runs *deterministic* rules over a `ProjectContext` and
  produces typed `Anomaly` objects. The LLM is only used to translate facts
  into a human-readable `reasoning` string — never to decide whether an
  anomaly exists. That keeps the system auditable.
- `scan_and_dispatch()` fans anomalies out to the existing
  `NotificationDispatcher`, persisting one notification per anomaly.
- `run_scheduled_scan()` is the hook a cron / APScheduler / Celery beat job
  calls; it iterates over active projects and dispatches via the dispatcher.
"""

from __future__ import annotations

import logging
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.project import Project
from app.services.notifications.engine import NotificationDispatcher

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Reasoner — LLM behind an interface
# ---------------------------------------------------------------------------


class Reasoner(ABC):
    """Produces a human-readable reasoning string for an anomaly."""

    @abstractmethod
    def explain(self, *, anomaly_type: str, facts: dict) -> str: ...


class FakeReasoner(Reasoner):
    """Deterministic reasoner — used in tests and as a safe default.

    Output format is stable so tests can assert on it.
    """

    def explain(self, *, anomaly_type: str, facts: dict) -> str:
        return f"[{anomaly_type}] " + ", ".join(
            f"{k}={facts[k]}" for k in sorted(facts)
        )


class OpenAIReasoner(Reasoner):  # pragma: no cover - thin shim, not unit-tested
    """Production reasoner — calls the OpenAI chat completions API.

    Constructed lazily so importing this module does not require the SDK.
    """

    def __init__(self, *, model: str, api_key: str) -> None:
        self.model = model
        self.api_key = api_key

    def explain(self, *, anomaly_type: str, facts: dict) -> str:
        # Intentionally minimal — real implementation lives outside this PR's
        # tested surface. Returns a graceful fallback if the SDK is unavailable.
        try:
            from openai import OpenAI  # type: ignore[import-not-found]
        except Exception:
            return FakeReasoner().explain(anomaly_type=anomaly_type, facts=facts)
        try:
            client = OpenAI(api_key=self.api_key)
            resp = client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You explain construction project anomalies to a "
                            "site foreman in 1-2 sentences. Be concrete."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Anomaly: {anomaly_type}\nFacts: {facts}",
                    },
                ],
                temperature=0.2,
            )
            return resp.choices[0].message.content or ""
        except Exception:  # noqa: BLE001
            logger.exception("openai_reasoner_failed")
            return FakeReasoner().explain(anomaly_type=anomaly_type, facts=facts)


# ---------------------------------------------------------------------------
# Anomaly + context data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Anomaly:
    type: str           # e.g. "alert.over_budget"
    severity: str       # "low" | "medium" | "high"
    title: str
    facts: dict
    reasoning: str


@dataclass
class ProjectContext:
    """Bag of inputs the detector needs to evaluate one project."""

    spent_cents: int
    today: date
    weather_forecast: list[dict] | None = None  # [{date, condition, wind_kmh}]
    # Future hooks: progress_pct, resource_conflicts, etc.
    notes: dict = field(default_factory=dict)


# Conditions we consider risky for outdoor construction work.
_SEVERE_CONDITIONS = {"storm", "heavy_rain", "snow", "hail", "ice"}
_SEVERE_WIND_KMH = 60


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


class AnomalyDetector:
    """Runs deterministic anomaly rules and stamps an LLM reasoning on each."""

    def __init__(self, reasoner: Reasoner) -> None:
        self.reasoner = reasoner

    # -- rule implementations -------------------------------------------------

    def _over_budget(
        self, project: Project, ctx: ProjectContext
    ) -> Anomaly | None:
        budget = project.budget_cents or 0
        if budget <= 0:
            return None
        if ctx.spent_cents <= budget:
            return None
        overrun = ctx.spent_cents - budget
        facts = {
            "project": project.name,
            "budget_cents": budget,
            "spent_cents": ctx.spent_cents,
            "overrun_cents": overrun,
        }
        return Anomaly(
            type="alert.over_budget",
            severity="high",
            title=f"{project.name} is over budget",
            facts=facts,
            reasoning=self.reasoner.explain(
                anomaly_type="alert.over_budget", facts=facts
            ),
        )

    def _behind_schedule(
        self, project: Project, ctx: ProjectContext
    ) -> Anomaly | None:
        if project.end_date is None:
            return None
        if project.status in {"completed", "archived"}:
            return None
        if ctx.today <= project.end_date:
            return None
        days_overdue = (ctx.today - project.end_date).days
        facts = {
            "project": project.name,
            "end_date": project.end_date.isoformat(),
            "today": ctx.today.isoformat(),
            "days_overdue": days_overdue,
        }
        return Anomaly(
            type="alert.behind_schedule",
            severity="high" if days_overdue > 14 else "medium",
            title=f"{project.name} is {days_overdue} days behind schedule",
            facts=facts,
            reasoning=self.reasoner.explain(
                anomaly_type="alert.behind_schedule", facts=facts
            ),
        )

    def _weather_risk(
        self, project: Project, ctx: ProjectContext
    ) -> Anomaly | None:
        forecast = ctx.weather_forecast
        if not forecast:
            return None
        # Window: from today (or project start, whichever is later) looking
        # 14 days ahead. We deliberately do NOT cap at project.end_date so
        # storms that arrive while a project is already overdue still alert.
        from datetime import timedelta as _td

        start = ctx.today
        if project.start_date is not None and project.start_date > start:
            start = project.start_date
        end = ctx.today + _td(days=14)
        severe: list[dict] = []
        for entry in forecast:
            try:
                d = date.fromisoformat(entry["date"])
            except (KeyError, ValueError):
                continue
            if d < start or d > end:
                continue
            cond = str(entry.get("condition", "")).lower()
            wind = entry.get("wind_kmh", 0) or 0
            if cond in _SEVERE_CONDITIONS or wind >= _SEVERE_WIND_KMH:
                severe.append(entry)
        if not severe:
            return None
        facts = {"project": project.name, "severe_days": severe}
        return Anomaly(
            type="alert.weather_risk",
            severity="medium",
            title=f"Weather risk for {project.name}",
            facts=facts,
            reasoning=self.reasoner.explain(
                anomaly_type="alert.weather_risk", facts=facts
            ),
        )

    # -- public API -----------------------------------------------------------

    def scan_project(
        self, project: Project, ctx: ProjectContext
    ) -> list[Anomaly]:
        candidates = [
            self._over_budget(project, ctx),
            self._behind_schedule(project, ctx),
            self._weather_risk(project, ctx),
        ]
        return [a for a in candidates if a is not None]

    async def scan_and_dispatch(
        self,
        db: AsyncSession,
        *,
        dispatcher: NotificationDispatcher,
        project: Project,
        recipient_user_id: uuid.UUID,
        context: ProjectContext,
    ) -> list[Notification]:
        anomalies = self.scan_project(project, context)
        sent: list[Notification] = []
        for a in anomalies:
            n = await dispatcher.dispatch(
                db,
                user_id=recipient_user_id,
                type=a.type,
                title=a.title,
                body=a.reasoning,
                data={
                    "project_id": str(project.id),
                    "severity": a.severity,
                    "facts": a.facts,
                },
            )
            sent.append(n)
        return sent


# ---------------------------------------------------------------------------
# Scheduled job hook
# ---------------------------------------------------------------------------


ContextProvider = Callable[[Project], ProjectContext | Awaitable[ProjectContext]]


async def _resolve_context(provider: ContextProvider, project: Project) -> ProjectContext:
    result = provider(project)
    if hasattr(result, "__await__"):
        return await result  # type: ignore[return-value]
    return result  # type: ignore[return-value]


async def run_scheduled_scan(
    db: AsyncSession,
    *,
    detector: AnomalyDetector,
    dispatcher: NotificationDispatcher,
    context_provider: ContextProvider,
) -> list[dict]:
    """Iterate active projects, scan each, dispatch anomaly notifications.

    Returns a list of `{project_id, project_name, notifications}` dicts so
    callers (cron job, admin endpoints) can log/inspect outcomes.
    """
    rows = (
        await db.execute(
            select(Project).where(
                Project.deleted_at.is_(None),
                Project.status == "active",
            )
        )
    ).scalars().all()

    summary: list[dict] = []
    for project in rows:
        ctx = await _resolve_context(context_provider, project)
        sent = await detector.scan_and_dispatch(
            db,
            dispatcher=dispatcher,
            project=project,
            recipient_user_id=project.owner_id,
            context=ctx,
        )
        if sent:
            summary.append(
                {
                    "project_id": str(project.id),
                    "project_name": project.name,
                    "notifications": sent,
                }
            )
    return summary
