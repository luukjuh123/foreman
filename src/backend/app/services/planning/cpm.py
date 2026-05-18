"""Critical Path Method (CPM) algorithm for construction task scheduling."""

from collections import deque
from dataclasses import dataclass, field


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
            task.early_start = max(
                task_map[dep_id].early_finish for dep_id in task.dependencies
            )
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
