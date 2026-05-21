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


def compute_critical_path(tasks: list[CpmTask]) -> list[CpmTask]:
    """Compute early/late start/finish and float for each task.

    Returns tasks with CPM fields populated. Tasks on the critical path
    have `is_critical == True`.

    Raises ValueError if a dependency cycle is detected.
    """
    task_map = {t.id: t for t in tasks}

    # Build reverse adjacency map and in-degree in one pass — O(n)
    in_degree: dict[str, int] = {t.id: 0 for t in tasks}
    successors: dict[str, list[str]] = {t.id: [] for t in tasks}
    for task in tasks:
        for dep_id in task.dependencies:
            if dep_id not in task_map:
                msg = f"Unknown dependency: {dep_id}"
                raise ValueError(msg)
            in_degree[task.id] += 1
            successors[dep_id].append(task.id)

    # Topological sort (Kahn's algorithm) using deque — O(n)
    queue: deque[str] = deque(t.id for t in tasks if in_degree[t.id] == 0)
    order: list[str] = []

    while queue:
        current_id = queue.popleft()
        order.append(current_id)
        for successor_id in successors[current_id]:
            in_degree[successor_id] -= 1
            if in_degree[successor_id] == 0:
                queue.append(successor_id)

    if len(order) != len(tasks):
        msg = "Dependency cycle detected in task graph"
        raise ValueError(msg)

    # Forward pass
    for task_id in order:
        task = task_map[task_id]
        if not task.dependencies:
            task.early_start = 0.0
        else:
            task.early_start = max(task_map[dep_id].early_finish for dep_id in task.dependencies)
        task.early_finish = task.early_start + task.duration_hours

    # Project duration
    project_duration = max(t.early_finish for t in tasks)

    # Backward pass — uses successors map, no O(n) scan
    for task_id in reversed(order):
        task = task_map[task_id]
        successor_tasks = [task_map[s] for s in successors[task_id]]
        if not successor_tasks:
            task.late_finish = project_duration
        else:
            task.late_finish = min(s.late_start for s in successor_tasks)
        task.late_start = task.late_finish - task.duration_hours
        task.total_float = task.late_start - task.early_start

    return tasks


def resolve_dependencies(tasks: list[CpmTask]) -> list[CpmTask]:
    """Return tasks in a valid execution order.

    Produces a topological ordering of the dependency graph. Among tasks that
    are simultaneously ready (in-degree zero at the same step), critical-path
    tasks come first — schedulers should prefer them to avoid pushing out the
    project end date.

    Raises ValueError on a dependency cycle.
    """
    if not tasks:
        return []

    # Snapshot to avoid mutating the caller's task objects (compute_critical_path
    # populates early_finish in-place, which we use for tie-breaking).
    snapshot = [
        CpmTask(
            id=t.id,
            name=t.name,
            duration_hours=t.duration_hours,
            dependencies=list(t.dependencies),
        )
        for t in tasks
    ]
    compute_critical_path(snapshot)
    task_map = {t.id: t for t in snapshot}
    original_map = {t.id: t for t in tasks}

    in_degree: dict[str, int] = {t.id: 0 for t in snapshot}
    successors: dict[str, list[str]] = {t.id: [] for t in snapshot}
    for t in snapshot:
        for dep_id in t.dependencies:
            in_degree[t.id] += 1
            successors[dep_id].append(t.id)

    # Ready set, ordered by (not critical first, then -early_finish) so the
    # most-critical / longest tasks come out first.
    def sort_key(task_id: str) -> tuple[int, float, str]:
        task = task_map[task_id]
        return (0 if task.is_critical else 1, -task.early_finish, task.id)

    ready = sorted([t.id for t in snapshot if in_degree[t.id] == 0], key=sort_key)
    ordered: list[CpmTask] = []
    while ready:
        cur = ready.pop(0)
        ordered.append(original_map[cur])
        new_ready: list[str] = []
        for succ in successors[cur]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                new_ready.append(succ)
        if new_ready:
            ready.extend(new_ready)
            ready.sort(key=sort_key)

    if len(ordered) != len(snapshot):
        msg = "Dependency cycle detected in task graph"
        raise ValueError(msg)
    return ordered


def critical_path_sequence(tasks: list[CpmTask]) -> list[CpmTask]:
    """Return one valid critical-path chain from start to end.

    Walks from a critical task with no dependencies to a critical task whose
    early_finish equals the project duration, always following a critical
    predecessor/successor edge. If multiple chains are tied, returns one of
    them (deterministically by task id).
    """
    if not tasks:
        return []

    snapshot = [
        CpmTask(
            id=t.id,
            name=t.name,
            duration_hours=t.duration_hours,
            dependencies=list(t.dependencies),
        )
        for t in tasks
    ]
    compute_critical_path(snapshot)
    task_map = {t.id: t for t in snapshot}
    original_map = {t.id: t for t in tasks}

    # Find a critical starter: critical, no critical predecessor.
    critical_ids = {t.id for t in snapshot if t.is_critical}
    successors: dict[str, list[str]] = {t.id: [] for t in snapshot}
    for t in snapshot:
        for dep in t.dependencies:
            successors[dep].append(t.id)

    def critical_starts() -> list[str]:
        starts = []
        for tid in critical_ids:
            preds = [d for d in task_map[tid].dependencies if d in critical_ids]
            if not preds:
                starts.append(tid)
        return sorted(starts)

    chain: list[str] = []
    starts = critical_starts()
    if not starts:
        return []
    cur = starts[0]
    while True:
        chain.append(cur)
        next_critical = sorted(s for s in successors[cur] if s in critical_ids)
        if not next_critical:
            break
        cur = next_critical[0]

    return [original_map[tid] for tid in chain]


async def detect_cycle(task_id: uuid.UUID, depends_on_task_id: uuid.UUID, db: AsyncSession) -> bool:
    """Return True if adding task_id -> depends_on_task_id would create a cycle.

    We DFS from depends_on_task_id following existing depends_on edges.
    If we reach task_id, a cycle would form.
    """
    from app.models.project import TaskDependency  # local import to avoid circular

    result = await db.execute(select(TaskDependency))
    all_deps = result.scalars().all()

    # adjacency: task_id -> list of depends_on_task_id (i.e. "task depends on these")
    # To detect cycle: we walk the graph from depends_on_task_id through its own dependencies.
    # If we reach task_id, adding the edge would form a cycle.
    adj: dict[uuid.UUID, list[uuid.UUID]] = {}
    for dep in all_deps:
        adj.setdefault(dep.task_id, []).append(dep.depends_on_task_id)

    # DFS from depends_on_task_id
    visited: set[uuid.UUID] = set()
    stack = [depends_on_task_id]
    while stack:
        current = stack.pop()
        if current == task_id:
            return True
        if current in visited:
            continue
        visited.add(current)
        for neighbor in adj.get(current, []):
            stack.append(neighbor)
    return False
