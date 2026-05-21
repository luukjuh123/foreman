"""AI historical learning — predict task durations from past observations.

A `HistoryStore` records `DurationObservation`s (task_name + actual seconds,
optionally also the estimate at the time). The `HistoricalLearner` consumes
that store and predicts a duration for a new task name.

Strategy (deterministic, ML-free for now — easy to swap later):
  1. Exact-name match → median of actual durations.
  2. Fuzzy match (token Jaccard ≥ 0.5) → median across all matched rows.
  3. Caller-provided default.

`predict_from_estimate` additionally applies a *bias correction* learned from
rows that carried both an estimate and an actual: `bias = median(actual/estimate)`.

All durations are in **seconds** (foreman convention). Every prediction carries
a human-readable `reasoning` field.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class DurationObservation:
    """One completed task — what was estimated and what actually happened."""

    task_name: str
    actual_duration_s: int
    estimated_duration_s: int | None = None


@dataclass
class Prediction:
    duration_s: int
    confidence: float
    sample_size: int
    reasoning: str


class HistoryStore(Protocol):
    async def add(self, obs: DurationObservation) -> None: ...
    async def observations_for(self, task_name: str) -> list[DurationObservation]: ...
    async def all_observations(self) -> list[DurationObservation]: ...


@dataclass
class InMemoryHistoryStore:
    """In-memory implementation used by tests and as a default."""

    _rows: list[DurationObservation] = field(default_factory=list)

    async def add(self, obs: DurationObservation) -> None:
        self._rows.append(obs)

    async def observations_for(self, task_name: str) -> list[DurationObservation]:
        key = task_name.strip().lower()
        return [r for r in self._rows if r.task_name.strip().lower() == key]

    async def all_observations(self) -> list[DurationObservation]:
        return list(self._rows)


def _tokens(name: str) -> set[str]:
    return {t for t in (w.strip().lower() for w in name.split()) if t}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _confidence(n: int) -> float:
    """Map sample size to a 0..1 confidence (saturating)."""
    if n <= 0:
        return 0.0
    # n=1 -> 0.2, n=5 -> ~0.71, n=10 -> ~0.83, asymptote 1.0
    return n / (n + 4)


class HistoricalLearner:
    """Predicts durations from a HistoryStore."""

    FUZZY_THRESHOLD = 0.4

    def __init__(self, *, store: HistoryStore) -> None:
        self._store = store

    async def predict(self, task_name: str, *, default_duration_s: int) -> Prediction:
        if default_duration_s <= 0:
            msg = "default_duration_s must be positive"
            raise ValueError(msg)

        exact = await self._store.observations_for(task_name)
        if exact:
            median_s = int(statistics.median(r.actual_duration_s for r in exact))
            return Prediction(
                duration_s=median_s,
                confidence=_confidence(len(exact)),
                sample_size=len(exact),
                reasoning=(
                    f"Predicted from {len(exact)} historical record(s) of '{task_name}' (median of past actuals)."
                ),
            )

        # Fuzzy match across all rows
        all_rows = await self._store.all_observations()
        target_tokens = _tokens(task_name)
        matched: list[DurationObservation] = []
        best_score = 0.0
        for r in all_rows:
            score = _jaccard(target_tokens, _tokens(r.task_name))
            if score >= self.FUZZY_THRESHOLD:
                matched.append(r)
                best_score = max(best_score, score)
        if matched:
            median_s = int(statistics.median(r.actual_duration_s for r in matched))
            return Prediction(
                duration_s=median_s,
                confidence=_confidence(len(matched)) * best_score,
                sample_size=len(matched),
                reasoning=(
                    f"Predicted from {len(matched)} similar (fuzzy match, "
                    f"Jaccard ≥ {self.FUZZY_THRESHOLD}) historical task(s)."
                ),
            )

        return Prediction(
            duration_s=default_duration_s,
            confidence=0.0,
            sample_size=0,
            reasoning=f"No historical data for '{task_name}' — using default estimate.",
        )

    async def predict_from_estimate(
        self,
        task_name: str,
        *,
        estimated_duration_s: int,
    ) -> Prediction:
        """Apply learned estimate-vs-actual bias to a caller-supplied estimate.

        Bias = median(actual / estimated) across all rows that carry both.
        """
        if estimated_duration_s <= 0:
            msg = "estimated_duration_s must be positive"
            raise ValueError(msg)

        rows = [
            r for r in await self._store.all_observations() if r.estimated_duration_s and r.estimated_duration_s > 0
        ]
        if not rows:
            # No estimate/actual pairs — just return the estimate.
            return Prediction(
                duration_s=estimated_duration_s,
                confidence=0.0,
                sample_size=0,
                reasoning="No historical estimate/actual pairs — using caller estimate as-is.",
            )

        ratios = [r.actual_duration_s / r.estimated_duration_s for r in rows]
        bias = statistics.median(ratios)
        corrected = round(estimated_duration_s * bias)
        return Prediction(
            duration_s=corrected,
            confidence=_confidence(len(rows)),
            sample_size=len(rows),
            reasoning=(f"Applied historical estimate→actual bias of {bias:.2f} (median over {len(rows)} pair(s))."),
        )

    async def predict_many(
        self,
        tasks: list[tuple[str, int]],
    ) -> dict[str, Prediction]:
        """Bulk predict — returns {task_name: Prediction}. Convenience wrapper."""
        out: dict[str, Prediction] = {}
        for name, default_s in tasks:
            out[name] = await self.predict(name, default_duration_s=default_s)
        return out
