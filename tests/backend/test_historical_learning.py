"""Tests for AI historical learning — predict task durations from past data."""

from __future__ import annotations

import pytest

from app.services.planning.historical_learning import (
    DurationObservation,
    HistoricalLearner,
    InMemoryHistoryStore,
)

H_S = 3_600


def _obs(name: str, hours: float, estimated_hours: float | None = None) -> DurationObservation:
    return DurationObservation(
        task_name=name,
        actual_duration_s=int(hours * H_S),
        estimated_duration_s=int(estimated_hours * H_S) if estimated_hours else None,
    )


@pytest.mark.asyncio
async def test_predict_uses_exact_name_median() -> None:
    store = InMemoryHistoryStore()
    for h in [4, 6, 8, 10, 12]:  # median = 8h
        await store.add(_obs("Tile bathroom floor", h))
    learner = HistoricalLearner(store=store)
    pred = await learner.predict("Tile bathroom floor", default_duration_s=2 * H_S)
    assert pred.duration_s == 8 * H_S
    assert pred.sample_size == 5
    assert pred.confidence > 0.5
    assert "median" in pred.reasoning.lower() or "historical" in pred.reasoning.lower()


@pytest.mark.asyncio
async def test_predict_falls_back_to_default_when_no_history() -> None:
    learner = HistoricalLearner(store=InMemoryHistoryStore())
    pred = await learner.predict("Brand new task", default_duration_s=5 * H_S)
    assert pred.duration_s == 5 * H_S
    assert pred.sample_size == 0
    assert pred.confidence == 0.0
    assert "default" in pred.reasoning.lower() or "no historical" in pred.reasoning.lower()


@pytest.mark.asyncio
async def test_predict_uses_fuzzy_match_when_exact_missing() -> None:
    store = InMemoryHistoryStore()
    for h in [3, 4, 5]:
        await store.add(_obs("Paint living room walls", h))
    learner = HistoricalLearner(store=store)
    pred = await learner.predict("Paint kitchen walls", default_duration_s=10 * H_S)
    # Token overlap "paint" + "walls" should pull in the living room data.
    assert pred.duration_s == 4 * H_S
    assert "fuzzy" in pred.reasoning.lower() or "similar" in pred.reasoning.lower()
    assert pred.sample_size == 3


@pytest.mark.asyncio
async def test_confidence_grows_with_sample_size() -> None:
    store = InMemoryHistoryStore()
    learner = HistoricalLearner(store=store)
    await store.add(_obs("Demolition", 4))
    p1 = await learner.predict("Demolition", default_duration_s=H_S)
    for _ in range(10):
        await store.add(_obs("Demolition", 4))
    p11 = await learner.predict("Demolition", default_duration_s=H_S)
    assert p11.confidence > p1.confidence


@pytest.mark.asyncio
async def test_predict_applies_estimation_bias_correction() -> None:
    """If history shows actual = 2 * estimated consistently, predictions should
    scale a caller-provided estimate by that factor."""
    store = InMemoryHistoryStore()
    # 5 tasks where actual is 2x the estimate
    for _ in range(5):
        await store.add(_obs("Foundation pour", 8.0, estimated_hours=4.0))
    learner = HistoricalLearner(store=store)
    pred = await learner.predict_from_estimate(
        "Foundation pour for new house", estimated_duration_s=6 * H_S,
    )
    # Bias 2.0 applied: 6h estimate -> 12h prediction
    assert pred.duration_s == 12 * H_S
    assert "bias" in pred.reasoning.lower() or "2.0" in pred.reasoning


@pytest.mark.asyncio
async def test_bulk_predict_for_task_list() -> None:
    store = InMemoryHistoryStore()
    for h in [4, 4, 4]:
        await store.add(_obs("Paint", h))
    learner = HistoricalLearner(store=store)
    preds = await learner.predict_many(
        [("Paint", H_S), ("Unknown", 2 * H_S)],
    )
    assert preds["Paint"].duration_s == 4 * H_S
    assert preds["Unknown"].duration_s == 2 * H_S


@pytest.mark.asyncio
async def test_observation_durations_are_in_seconds_integer() -> None:
    store = InMemoryHistoryStore()
    await store.add(_obs("X", 1.5))
    rows = await store.observations_for("X")
    assert isinstance(rows[0].actual_duration_s, int)
    assert rows[0].actual_duration_s == int(1.5 * H_S)


@pytest.mark.asyncio
async def test_prediction_always_includes_human_reasoning() -> None:
    store = InMemoryHistoryStore()
    await store.add(_obs("A", 2))
    learner = HistoricalLearner(store=store)
    p1 = await learner.predict("A", default_duration_s=H_S)
    p2 = await learner.predict("Never seen", default_duration_s=H_S)
    assert isinstance(p1.reasoning, str) and p1.reasoning
    assert isinstance(p2.reasoning, str) and p2.reasoning


@pytest.mark.asyncio
async def test_negative_or_zero_default_rejected() -> None:
    learner = HistoricalLearner(store=InMemoryHistoryStore())
    with pytest.raises(ValueError):
        await learner.predict("X", default_duration_s=0)
    with pytest.raises(ValueError):
        await learner.predict("X", default_duration_s=-1)
