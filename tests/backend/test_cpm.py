"""Tests for the Critical Path Method algorithm."""

import pytest

from app.services.planning.cpm import CpmTask, compute_critical_path


def test_single_task_is_critical() -> None:
    tasks = [CpmTask(id="t1", name="Foundation", duration_hours=8.0)]
    result = compute_critical_path(tasks)
    assert result[0].is_critical
    assert result[0].early_start == 0.0
    assert result[0].early_finish == 8.0


def test_sequential_tasks_all_critical() -> None:
    tasks = [
        CpmTask(id="t1", name="Excavation", duration_hours=4.0),
        CpmTask(id="t2", name="Foundation", duration_hours=8.0, dependencies=["t1"]),
        CpmTask(id="t3", name="Framing", duration_hours=6.0, dependencies=["t2"]),
    ]
    result = compute_critical_path(tasks)
    task_map = {t.id: t for t in result}
    assert task_map["t1"].early_finish == 4.0
    assert task_map["t2"].early_start == 4.0
    assert task_map["t2"].early_finish == 12.0
    assert task_map["t3"].early_finish == 18.0
    assert all(t.is_critical for t in result)


def test_parallel_tasks_only_longest_is_critical() -> None:
    tasks = [
        CpmTask(id="t1", name="Foundation", duration_hours=8.0),
        CpmTask(id="t2a", name="Plumbing", duration_hours=4.0, dependencies=["t1"]),
        CpmTask(id="t2b", name="Electrical", duration_hours=6.0, dependencies=["t1"]),
        CpmTask(id="t3", name="Drywall", duration_hours=3.0, dependencies=["t2a", "t2b"]),
    ]
    result = compute_critical_path(tasks)
    task_map = {t.id: t for t in result}
    # t1 → t2b (6h) → t3 is critical; t2a (4h) has float
    assert task_map["t2b"].is_critical
    assert not task_map["t2a"].is_critical
    assert task_map["t2a"].total_float == pytest.approx(2.0)


def test_cycle_raises_value_error() -> None:
    tasks = [
        CpmTask(id="t1", name="A", duration_hours=1.0, dependencies=["t2"]),
        CpmTask(id="t2", name="B", duration_hours=1.0, dependencies=["t1"]),
    ]
    with pytest.raises(ValueError, match="cycle"):
        compute_critical_path(tasks)


def test_unknown_dependency_raises_value_error() -> None:
    tasks = [CpmTask(id="t1", name="A", duration_hours=1.0, dependencies=["nonexistent"])]
    with pytest.raises(ValueError, match="Unknown dependency"):
        compute_critical_path(tasks)


def test_large_chain_correctness() -> None:
    """100-task chain: verifies correctness at scale (each task depends on previous)."""
    n = 100
    tasks = [CpmTask(id=f"t{i}", name=f"Task {i}", duration_hours=2.0) for i in range(n)]
    for i in range(1, n):
        tasks[i].dependencies = [f"t{i - 1}"]
    result = compute_critical_path(tasks)
    task_map = {t.id: t for t in result}
    # All tasks are on the single chain — all critical
    assert all(t.is_critical for t in result)
    # Last task finishes at n * 2.0 hours
    assert task_map[f"t{n - 1}"].early_finish == pytest.approx(n * 2.0)


def test_large_diamond_correctness() -> None:
    """Diamond pattern with 100 parallel branches: only the longest branch is critical."""
    n = 100
    # source → n parallel tasks (durations 1..n) → sink
    source = CpmTask(id="source", name="Source", duration_hours=0.0)
    sink = CpmTask(id="sink", name="Sink", duration_hours=0.0, dependencies=[f"p{i}" for i in range(n)])
    parallel = [
        CpmTask(id=f"p{i}", name=f"Parallel {i}", duration_hours=float(i + 1), dependencies=["source"])
        for i in range(n)
    ]
    tasks = [source, *parallel, sink]
    result = compute_critical_path(tasks)
    task_map = {t.id: t for t in result}
    # Only p{n-1} (longest) is critical
    assert task_map[f"p{n - 1}"].is_critical
    # All shorter branches are not critical
    for i in range(n - 1):
        assert not task_map[f"p{i}"].is_critical
