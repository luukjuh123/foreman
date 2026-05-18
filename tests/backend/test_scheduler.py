"""Tests for the AI schedule optimizer (weather / resource / dependency constraints)."""

from __future__ import annotations

import pytest

from app.services.planning.cpm import CpmTask
from app.services.planning.scheduler import (
    ConstantWeatherProvider,
    ResourcePool,
    ScheduleOptimizer,
    SchedulingInput,
    WeatherProvider,
)

DAY_S = 86_400  # one day in seconds
H_S = 3_600


def _task(tid: str, hours: float, deps: list[str] | None = None, outdoor: bool = False,
          resources: list[str] | None = None) -> SchedulingInput:
    return SchedulingInput(
        task=CpmTask(id=tid, name=tid, duration_hours=hours, dependencies=deps or []),
        outdoor=outdoor,
        required_resources=resources or [],
    )


@pytest.mark.asyncio
async def test_simple_two_task_chain_respects_dependency() -> None:
    inputs = [_task("a", 4), _task("b", 2, deps=["a"])]
    opt = ScheduleOptimizer(weather=ConstantWeatherProvider(bad=False))
    result = await opt.optimize(inputs, working_hours_per_day=8)
    sched = {s.task_id: s for s in result.scheduled}
    assert sched["a"].start_time_s == 0
    assert sched["a"].end_time_s == 4 * H_S
    # b can start the same day right after a (continuous hour-based schedule)
    assert sched["b"].start_time_s >= sched["a"].end_time_s
    assert all(s.reasoning for s in result.scheduled)


@pytest.mark.asyncio
async def test_outdoor_task_skips_bad_weather_days() -> None:
    class BadOnDay0(WeatherProvider):
        async def is_bad(self, day_index: int) -> bool:
            return day_index == 0

    inputs = [_task("roof", 8, outdoor=True)]
    opt = ScheduleOptimizer(weather=BadOnDay0())
    result = await opt.optimize(inputs, working_hours_per_day=8)
    sched = result.scheduled[0]
    # Day 0 unsafe — must start at day 1 (offset 86400s)
    assert sched.start_time_s == DAY_S
    assert "weather" in sched.reasoning.lower()


@pytest.mark.asyncio
async def test_indoor_task_ignores_weather() -> None:
    class AlwaysBad(WeatherProvider):
        async def is_bad(self, day_index: int) -> bool:  # noqa: ARG002
            return True

    inputs = [_task("drywall", 8, outdoor=False)]
    opt = ScheduleOptimizer(weather=AlwaysBad())
    result = await opt.optimize(inputs, working_hours_per_day=8)
    assert result.scheduled[0].start_time_s == 0


@pytest.mark.asyncio
async def test_resource_contention_serializes_tasks() -> None:
    # Two tasks both need 'crane', pool has capacity 1, no dependency between them
    inputs = [_task("a", 4, resources=["crane"]), _task("b", 4, resources=["crane"])]
    pool = ResourcePool(capacity={"crane": 1})
    opt = ScheduleOptimizer(weather=ConstantWeatherProvider(bad=False), resources=pool)
    result = await opt.optimize(inputs, working_hours_per_day=8)
    sched = {s.task_id: s for s in result.scheduled}
    # They must not overlap
    a_int = (sched["a"].start_time_s, sched["a"].end_time_s)
    b_int = (sched["b"].start_time_s, sched["b"].end_time_s)
    assert a_int[1] <= b_int[0] or b_int[1] <= a_int[0]
    # The deferred one mentions resource contention in reasoning
    deferred = sched["a"] if a_int[0] > 0 else sched["b"]
    assert "crane" in deferred.reasoning.lower() or "resource" in deferred.reasoning.lower()


@pytest.mark.asyncio
async def test_resource_pool_allows_parallel_when_capacity_sufficient() -> None:
    inputs = [_task("a", 4, resources=["worker"]), _task("b", 4, resources=["worker"])]
    pool = ResourcePool(capacity={"worker": 2})
    opt = ScheduleOptimizer(weather=ConstantWeatherProvider(bad=False), resources=pool)
    result = await opt.optimize(inputs, working_hours_per_day=8)
    sched = {s.task_id: s for s in result.scheduled}
    # Both start at 0
    assert sched["a"].start_time_s == 0
    assert sched["b"].start_time_s == 0


@pytest.mark.asyncio
async def test_dependency_cycle_raises() -> None:
    inputs = [_task("a", 1, deps=["b"]), _task("b", 1, deps=["a"])]
    opt = ScheduleOptimizer(weather=ConstantWeatherProvider(bad=False))
    with pytest.raises(ValueError, match="cycle"):
        await opt.optimize(inputs, working_hours_per_day=8)


@pytest.mark.asyncio
async def test_empty_input_returns_empty_schedule() -> None:
    opt = ScheduleOptimizer(weather=ConstantWeatherProvider(bad=False))
    result = await opt.optimize([], working_hours_per_day=8)
    assert result.scheduled == []
    assert result.makespan_s == 0


@pytest.mark.asyncio
async def test_time_values_are_in_seconds_integer() -> None:
    inputs = [_task("a", 1.5)]  # 1.5h
    opt = ScheduleOptimizer(weather=ConstantWeatherProvider(bad=False))
    result = await opt.optimize(inputs, working_hours_per_day=8)
    s = result.scheduled[0]
    assert isinstance(s.start_time_s, int)
    assert isinstance(s.end_time_s, int)
    assert s.end_time_s - s.start_time_s == int(1.5 * H_S)


@pytest.mark.asyncio
async def test_every_scheduled_task_has_human_readable_reasoning() -> None:
    inputs = [_task("a", 2), _task("b", 2, deps=["a"])]
    opt = ScheduleOptimizer(weather=ConstantWeatherProvider(bad=False))
    result = await opt.optimize(inputs, working_hours_per_day=8)
    for s in result.scheduled:
        assert isinstance(s.reasoning, str)
        assert len(s.reasoning) > 0
