from __future__ import annotations

import inspect
import logging
import uuid
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.models.notification import Notification
from app.models.project import Project
from app.services.notifications.engine import NotificationDispatcher
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class Reasoner(ABC):
    @abstractmethod
    def explain(self, *, anomaly_type: str, facts: dict) -> str: ...


class FakeReasoner(Reasoner):
    def explain(self, *, anomaly_type: str, facts: dict) -> str:
        return f"[{anomaly_type}] " + ", ".join(f"{k}={facts[k]}" for k in sorted(facts))


class OpenAIReasoner(Reasoner):  # pragma: no cover - thin shim, not unit-tested
    def __init__(self, *, model: str, api_key: str) -> None:
        self.model = model
        self.api_key = api_key

    def _fallback(self, anomaly_type: str, facts: dict) -> str:
        return FakeReasoner().explain(anomaly_type=anomaly_type, facts=facts)

    def explain(self, *, anomaly_type: str, facts: dict) -> str:
        try:
            from openai import OpenAI  # type: ignore[import-not-found]
        except Exception:
            return self._fallback(anomaly_type, facts)
        try:
            client = OpenAI(api_key=self.api_key)
            resp = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You explain construction project anomalies to a site foreman in 1-2 sentences. Be concrete."},
                    {"role": "user", "content": f"Anomaly: {anomaly_type}\nFacts: {facts}"},
                ],
                temperature=0.2,
            )
            return resp.choices[0].message.content or ""
        except Exception:
            logger.exception("openai_reasoner_failed")
            return self._fallback(anomaly_type, facts)


@dataclass(frozen=True)
class Anomaly:
    type: str
    severity: str
    title: str
    facts: dict
    reasoning: str


@dataclass
class ProjectContext:
    spent_cents: int
    today: date
    weather_forecast: list[dict] | None = None
    notes: dict = field(default_factory=dict)


_SEVERE_CONDITIONS = {"storm", "heavy_rain", "snow", "hail", "ice"}
_SEVERE_WIND_KMH = 60


class AnomalyDetector:
    def __init__(self, reasoner: Reasoner) -> None:
        self.reasoner = reasoner

    def _anomaly(self, type: str, severity: str, title: str, facts: dict) -> Anomaly:
        return Anomaly(type=type, severity=severity, title=title, facts=facts,
                       reasoning=self.reasoner.explain(anomaly_type=type, facts=facts))

    def _over_budget(self, project: Project, ctx: ProjectContext) -> Anomaly | None:
        budget = project.budget_cents or 0
        if budget <= 0 or ctx.spent_cents <= budget:
            return None
        overrun = ctx.spent_cents - budget
        return self._anomaly("alert.over_budget", "high", f"{project.name} is over budget",
                             {"project": project.name, "budget_cents": budget,
                              "spent_cents": ctx.spent_cents, "overrun_cents": overrun})

    def _behind_schedule(self, project: Project, ctx: ProjectContext) -> Anomaly | None:
        if project.end_date is None or project.status in {"completed", "archived"} or ctx.today <= project.end_date:
            return None
        days_overdue = (ctx.today - project.end_date).days
        return self._anomaly(
            "alert.behind_schedule", "high" if days_overdue > 14 else "medium",
            f"{project.name} is {days_overdue} days behind schedule",
            {"project": project.name, "end_date": project.end_date.isoformat(),
             "today": ctx.today.isoformat(), "days_overdue": days_overdue})

    def _weather_risk(self, project: Project, ctx: ProjectContext) -> Anomaly | None:
        if not ctx.weather_forecast:
            return None
        start = max(ctx.today, project.start_date) if project.start_date and project.start_date > ctx.today else ctx.today
        end = ctx.today + timedelta(days=14)
        severe = []
        for entry in ctx.weather_forecast:
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
        return self._anomaly("alert.weather_risk", "medium", f"Weather risk for {project.name}",
                             {"project": project.name, "severe_days": severe})

    def scan_project(self, project: Project, ctx: ProjectContext) -> list[Anomaly]:
        return [a for a in (self._over_budget(project, ctx), self._behind_schedule(project, ctx),
                            self._weather_risk(project, ctx)) if a is not None]

    async def scan_and_dispatch(
        self, db: AsyncSession, *, dispatcher: NotificationDispatcher,
        project: Project, recipient_user_id: uuid.UUID, context: ProjectContext,
    ) -> list[Notification]:
        sent: list[Notification] = []
        for a in self.scan_project(project, context):
            sent.append(await dispatcher.dispatch(
                db, user_id=recipient_user_id, type=a.type, title=a.title, body=a.reasoning,
                data={"project_id": str(project.id), "severity": a.severity, "facts": a.facts},
            ))
        return sent


ContextProvider = Callable[[Project], ProjectContext | Awaitable[ProjectContext]]


async def _resolve_context(provider: ContextProvider, project: Project) -> ProjectContext:
    result = provider(project)
    return await result if inspect.isawaitable(result) else result  # type: ignore[return-value]


async def run_scheduled_scan(
    db: AsyncSession, *, detector: AnomalyDetector,
    dispatcher: NotificationDispatcher, context_provider: ContextProvider,
) -> list[dict]:
    rows = (await db.execute(select(Project).where(
        Project.deleted_at.is_(None), Project.status == "active",
    ))).scalars().all()
    summary: list[dict] = []
    for project in rows:
        ctx = await _resolve_context(context_provider, project)
        sent = await detector.scan_and_dispatch(
            db, dispatcher=dispatcher, project=project,
            recipient_user_id=project.owner_id, context=ctx,
        )
        if sent:
            summary.append({"project_id": str(project.id), "project_name": project.name, "notifications": sent})
    return summary
