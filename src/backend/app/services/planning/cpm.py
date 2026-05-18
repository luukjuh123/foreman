"""Critical Path Method (CPM) algorithm for construction task scheduling."""

import uuid
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

    # Topological sort (Kahn's algorithm)
    in_degree: dict[str, int] = {t.id: 0 for t in tasks}
    for task in tasks:
        for dep_id in task.dependencies:
            if dep_id not in task_map:
                msg = f"Unknown dependency: {dep_id}"
                raise ValueError(msg)
            in_degree[task.id] += 1

    queue = [t.id for t in tasks if in_degree[t.id] == 0]
    order: list[str] = []

    while queue:
        current_id = queue.pop(0)
        order.append(current_id)
        for task in tasks:
            if current_id in task.dependencies:
                in_degree[task.id] -= 1
                if in_degree[task.id] == 0:
                    queue.append(task.id)

    if len(order) != len(tasks):
        msg = "Dependency cycle detected in task graph"
        raise ValueError(msg)

    # Forward pass
    for task_id in order:
        task = task_map[task_id]
        if not task.dependencies:
            task.early_start = 0.0
        else:
            task.early_start = max(
                task_map[dep_id].early_finish for dep_id in task.dependencies
            )
        task.early_finish = task.early_start + task.duration_hours

    # Project duration
    project_duration = max(t.early_finish for t in tasks)

    # Backward pass
    for task_id in reversed(order):
        task = task_map[task_id]
        successors = [t for t in tasks if task_id in t.dependencies]
        if not successors:
            task.late_finish = project_duration
        else:
            task.late_finish = min(s.late_start for s in successors)
        task.late_start = task.late_finish - task.duration_hours
        task.total_float = task.late_start - task.early_start

    return tasks


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
