"""AI schedule optimizer — assigns task start/end times subject to constraints.

Constraints honored:
  - Dependencies: a task cannot start before all of its predecessors finish.
  - Weather: outdoor tasks cannot run on days flagged "bad" by a WeatherProvider.
  - Resources: tasks competing for a finite resource pool serialize automatically.

All time values are stored in **seconds** (foreman convention).

The optimizer returns a `ScheduleResult` whose `scheduled` entries each carry
a human-readable `reasoning` string per the foreman convention.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.services.planning.cpm import CpmTask, compute_critical_path

_HOUR_S = 3_600
_DAY_S = 86_400


class WeatherProvider(Protocol):
    """Tells the optimizer whether a given day is unsafe for outdoor work."""

    async def is_bad(self, day_index: int) -> bool:
        """Return True if outdoor work on `day_index` (0-based from project start) is unsafe."""
        ...


class ConstantWeatherProvider:
    """Trivial provider — every day has the same flag. Useful as a safe default."""

    def __init__(self, *, bad: bool = False) -> None:
        self._bad = bad

    async def is_bad(self, day_index: int) -> bool:
        return self._bad


@dataclass
class ResourcePool:
    """Simple resource model: a dict of resource_name -> capacity (count)."""

    capacity: dict[str, int] = field(default_factory=dict)

    def cap(self, name: str) -> int:
        # Resources not declared are treated as unlimited.
        return self.capacity.get(name, 10**9)


@dataclass
class SchedulingInput:
    """Input row to the optimizer — wraps a CpmTask with side constraints."""

    task: CpmTask
    outdoor: bool = False
    required_resources: list[str] = field(default_factory=list)


@dataclass
class ScheduledTask:
    """Output row — when a task is scheduled and why."""

    task_id: str
    start_time_s: int
    end_time_s: int
    reasoning: str


@dataclass
class ScheduleResult:
    scheduled: list[ScheduledTask]
    makespan_s: int


def _topo_sort_critical_first(tasks: list[CpmTask]) -> list[CpmTask]:
    """Topological sort that ties-breaks by criticality + early_finish (longest first)."""
    if not tasks:
        return []
    snapshot = [
        CpmTask(id=t.id, name=t.name, duration_hours=t.duration_hours, dependencies=list(t.dependencies)) for t in tasks
    ]
    compute_critical_path(snapshot)
    task_map = {t.id: t for t in snapshot}
    in_degree: dict[str, int] = {t.id: 0 for t in snapshot}
    successors: dict[str, list[str]] = {t.id: [] for t in snapshot}
    for t in snapshot:
        for d in t.dependencies:
            in_degree[t.id] += 1
            successors[d].append(t.id)

    def key(tid: str) -> tuple[int, float, str]:
        snap = task_map[tid]
        return (0 if snap.is_critical else 1, -snap.early_finish, snap.id)

    ready = sorted([t.id for t in snapshot if in_degree[t.id] == 0], key=key)
    out: list[str] = []
    while ready:
        cur = ready.pop(0)
        out.append(cur)
        promoted: list[str] = []
        for s in successors[cur]:
            in_degree[s] -= 1
            if in_degree[s] == 0:
                promoted.append(s)
        if promoted:
            ready.extend(promoted)
            ready.sort(key=key)

    if len(out) != len(snapshot):
        msg = "Dependency cycle detected"
        raise ValueError(msg)
    original_map = {t.id: t for t in tasks}
    return [original_map[i] for i in out]


class ScheduleOptimizer:
    """Schedules a list of CpmTask-derived inputs subject to constraints."""

    def __init__(
        self,
        *,
        weather: WeatherProvider | None = None,
        resources: ResourcePool | None = None,
    ) -> None:
        self._weather = weather or ConstantWeatherProvider(bad=False)
        self._resources = resources or ResourcePool()

    async def optimize(
        self,
        inputs: list[SchedulingInput],
        *,
        working_hours_per_day: int = 8,
    ) -> ScheduleResult:
        if not inputs:
            return ScheduleResult(scheduled=[], makespan_s=0)

        # Topological order with critical tasks prioritized.
        cpm_tasks = [si.task for si in inputs]
        ordered = _topo_sort_critical_first(cpm_tasks)
        input_by_id = {si.task.id: si for si in inputs}

        # Cache weather lookups to avoid repeated awaits.
        weather_cache: dict[int, bool] = {}

        async def is_bad(day: int) -> bool:
            if day not in weather_cache:
                weather_cache[day] = await self._weather.is_bad(day)
            return weather_cache[day]

        finish_by_id: dict[str, int] = {}
        # Per-resource list of (start_s, end_s) occupied intervals.
        usage: dict[str, list[tuple[int, int]]] = {}

        def first_resource_free_after(name: str, earliest: int, duration: int) -> int:
            """Find earliest start >= `earliest` where capacity[name] is not exceeded."""
            cap = self._resources.cap(name)
            intervals = usage.get(name, [])
            cur = earliest
            # Sweep candidate starts: try `cur`, and if a slot would exceed cap,
            # bump to the soonest endpoint that frees space.
            while True:
                end = cur + duration
                # Count overlaps with [cur, end)
                overlapping = [iv for iv in intervals if iv[0] < end and iv[1] > cur]
                if len(overlapping) < cap:
                    return cur
                # Move cur to the earliest overlap end and retry
                cur = min(iv[1] for iv in overlapping)

        scheduled: list[ScheduledTask] = []
        for cpm in ordered:
            si = input_by_id[cpm.id]
            duration_s = round(cpm.duration_hours * _HOUR_S)

            # Dependency lower bound
            dep_finishes = [finish_by_id[d] for d in cpm.dependencies if d in finish_by_id]
            earliest = max(dep_finishes) if dep_finishes else 0
            reasons: list[str] = []
            if dep_finishes:
                reasons.append(
                    f"starts after dependencies finish at {earliest // _HOUR_S}h",
                )
            else:
                reasons.append("no dependencies — eligible to start at project start")

            # Resource lower bound
            for res in si.required_resources:
                free_at = first_resource_free_after(res, earliest, duration_s)
                if free_at > earliest:
                    reasons.append(
                        f"waited for resource '{res}' (capacity "
                        f"{self._resources.cap(res)}) to free at {free_at // _HOUR_S}h",
                    )
                earliest = max(earliest, free_at)

            # Weather lower bound (outdoor only)
            if si.outdoor:
                # Check days iteratively without recomputing inside helper
                cur = earliest
                pushed = False
                for _ in range(366):
                    day_idx = cur // _DAY_S
                    if not await is_bad(day_idx):
                        break
                    cur = (day_idx + 1) * _DAY_S
                    pushed = True
                else:
                    msg = "No clear weather window found within 366 days"
                    raise RuntimeError(msg)
                if pushed:
                    reasons.append(
                        f"shifted to day {cur // _DAY_S} due to bad weather on prior day(s)",
                    )
                earliest = cur

            start_s = earliest
            end_s = start_s + duration_s

            # Reserve resource intervals
            for res in si.required_resources:
                usage.setdefault(res, []).append((start_s, end_s))

            finish_by_id[cpm.id] = end_s
            scheduled.append(
                ScheduledTask(
                    task_id=cpm.id,
                    start_time_s=start_s,
                    end_time_s=end_s,
                    reasoning="; ".join(reasons),
                )
            )

        # Preserve input task order in output
        order_index = {si.task.id: i for i, si in enumerate(inputs)}
        scheduled.sort(key=lambda s: order_index[s.task_id])

        makespan = max((s.end_time_s for s in scheduled), default=0)
        return ScheduleResult(scheduled=scheduled, makespan_s=makespan)
