"""Critical Path Method (CPM) algorithm for construction task scheduling."""

import uuid
from collections import deque
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class CpmTask:
    """A task node in the CPM network."""

    id: str
    name: str
    duration_hours: float
    dependencies: list[str] = field(default_factory=list)

    # Computed by CPM
    early_start: float = 0.0
    early_finish: float = 0.0
    late_start: float = 0.0
    late_finish: float = 0.0
    total_float: float = 0.0

    @property
    def is_critical(self) -> bool:
        return abs(self.total_float) < 1e-9


def _build_graph(tasks: list[CpmTask]) -> tuple[dict[str, CpmTask], dict[str, int], dict[str, list[str]]]:
    task_map = {t.id: t for t in tasks}
    in_degree: dict[str, int] = {t.id: 0 for t in tasks}
    successors: dict[str, list[str]] = {t.id: [] for t in tasks}
    for task in tasks:
        for dep_id in task.dependencies:
            if dep_id not in task_map:
                raise ValueError(f"Unknown dependency: {dep_id}")
            in_degree[task.id] += 1
            successors[dep_id].append(task.id)
    return task_map, in_degree, successors


def _kahn_sort(in_degree: dict[str, int], successors: dict[str, list[str]]) -> list[str]:
    in_deg = dict(in_degree)
    queue: deque[str] = deque(tid for tid, d in in_deg.items() if d == 0)
    order: list[str] = []
    while queue:
        cur = queue.popleft()
        order.append(cur)
        for s in successors[cur]:
            in_deg[s] -= 1
            if in_deg[s] == 0:
                queue.append(s)
    if len(order) != len(in_degree):
        raise ValueError("Dependency cycle detected in task graph")
    return order


def compute_critical_path(tasks: list[CpmTask]) -> list[CpmTask]:
    """Compute early/late start/finish and float for each task.

    Returns tasks with CPM fields populated. Tasks on the critical path
    have `is_critical == True`.

    Raises ValueError if a dependency cycle is detected.
    """
    task_map, in_degree, successors = _build_graph(tasks)
    order = _kahn_sort(in_degree, successors)

    for task_id in order:
        t = task_map[task_id]
        t.early_start = max((task_map[d].early_finish for d in t.dependencies), default=0.0)
        t.early_finish = t.early_start + t.duration_hours
    project_duration = max(t.early_finish for t in tasks)
    for task_id in reversed(order):
        t = task_map[task_id]
        succs = [task_map[s] for s in successors[task_id]]
        t.late_finish = min((s.late_start for s in succs), default=project_duration)
        t.late_start = t.late_finish - t.duration_hours
        t.total_float = t.late_start - t.early_start
    return tasks


def _snapshot(tasks: list[CpmTask]) -> list[CpmTask]:
    """Create a deep-enough copy of tasks for CPM computation without mutating originals."""
    return [CpmTask(id=t.id, name=t.name, duration_hours=t.duration_hours, dependencies=list(t.dependencies)) for t in tasks]


def _critical_topo_sort(tasks: list[CpmTask]) -> list[str]:
    """Topological sort prioritizing critical tasks, returns ordered task IDs.

    Raises ValueError on dependency cycle.
    """
    snapshot = _snapshot(tasks)
    compute_critical_path(snapshot)
    task_map, in_degree, successors = _build_graph(snapshot)

    key = lambda tid: (0 if task_map[tid].is_critical else 1, -task_map[tid].early_finish, tid)
    ready = sorted([tid for tid, d in in_degree.items() if d == 0], key=key)
    order: list[str] = []
    while ready:
        cur = ready.pop(0)
        order.append(cur)
        for s in successors[cur]:
            in_degree[s] -= 1
            if in_degree[s] == 0:
                ready.append(s)
        ready.sort(key=key)

    if len(order) != len(snapshot):
        raise ValueError("Dependency cycle detected in task graph")
    return order


def resolve_dependencies(tasks: list[CpmTask]) -> list[CpmTask]:
    if not tasks:
        return []
    m = {t.id: t for t in tasks}
    return [m[tid] for tid in _critical_topo_sort(tasks)]


def critical_path_sequence(tasks: list[CpmTask]) -> list[CpmTask]:
    if not tasks:
        return []
    snap = _snapshot(tasks)
    compute_critical_path(snap)
    m = {t.id: t for t in tasks}
    tm, _, succs = _build_graph(snap)
    crit = {t.id for t in snap if t.is_critical}
    starts = sorted(tid for tid in crit if not any(d in crit for d in tm[tid].dependencies))
    if not starts:
        return []
    chain, cur = [], starts[0]
    while cur:
        chain.append(cur)
        cur = next(iter(sorted(s for s in succs[cur] if s in crit)), None)
    return [m[tid] for tid in chain]


async def detect_cycle(task_id: uuid.UUID, depends_on_task_id: uuid.UUID, db: AsyncSession) -> bool:
    from app.models.project import TaskDependency
    adj: dict[uuid.UUID, list[uuid.UUID]] = {}
    for dep in (await db.execute(select(TaskDependency))).scalars().all():
        adj.setdefault(dep.task_id, []).append(dep.depends_on_task_id)
    visited: set[uuid.UUID] = set()
    stack = [depends_on_task_id]
    while stack:
        if (current := stack.pop()) == task_id:
            return True
        if current not in visited:
            visited.add(current)
            stack.extend(adj.get(current, []))
    return False
