"""Tests for new dependency resolution utilities on top of CPM."""

from __future__ import annotations

import pytest

from app.services.planning.cpm import (
    CpmTask,
    critical_path_sequence,
    resolve_dependencies,
)


def _tasks() -> list[CpmTask]:
    # Diamond:
    #   t1 -> t2a (4h)  \
    #   t1 -> t2b (6h)   -> t3
    return [
        CpmTask(id="t1", name="Foundation", duration_hours=8.0),
        CpmTask(id="t2a", name="Plumbing", duration_hours=4.0, dependencies=["t1"]),
        CpmTask(id="t2b", name="Electrical", duration_hours=6.0, dependencies=["t1"]),
        CpmTask(id="t3", name="Drywall", duration_hours=3.0, dependencies=["t2a", "t2b"]),
    ]


def test_resolve_dependencies_returns_topological_order() -> None:
    order = [t.id for t in resolve_dependencies(_tasks())]
    assert order.index("t1") < order.index("t2a")
    assert order.index("t1") < order.index("t2b")
    assert order.index("t2a") < order.index("t3")
    assert order.index("t2b") < order.index("t3")


def test_resolve_dependencies_critical_first_among_ties() -> None:
    """When two tasks are both ready, the one on the critical path comes first."""
    resolved = resolve_dependencies(_tasks())
    # After t1, t2a and t2b are both ready. t2b is critical (longer); it must come before t2a.
    idx = {t.id: i for i, t in enumerate(resolved)}
    assert idx["t2b"] < idx["t2a"]


def test_resolve_dependencies_empty_input() -> None:
    assert resolve_dependencies([]) == []


def test_resolve_dependencies_raises_on_cycle() -> None:
    tasks = [
        CpmTask(id="a", name="A", duration_hours=1.0, dependencies=["b"]),
        CpmTask(id="b", name="B", duration_hours=1.0, dependencies=["a"]),
    ]
    with pytest.raises(ValueError, match="cycle"):
        resolve_dependencies(tasks)


def test_critical_path_sequence_returns_chain() -> None:
    seq = [t.id for t in critical_path_sequence(_tasks())]
    # The critical chain is t1 -> t2b -> t3 (longest path)
    assert seq == ["t1", "t2b", "t3"]


def test_critical_path_sequence_single_task() -> None:
    tasks = [CpmTask(id="solo", name="Solo", duration_hours=5.0)]
    seq = critical_path_sequence(tasks)
    assert [t.id for t in seq] == ["solo"]


def test_critical_path_sequence_empty() -> None:
    assert critical_path_sequence([]) == []


def test_critical_path_sequence_picks_longest_when_multiple_critical_chains() -> None:
    # Two parallel branches with identical durations — both are critical.
    # The function must still return ONE valid critical sequence end-to-end.
    tasks = [
        CpmTask(id="s", name="Start", duration_hours=1.0),
        CpmTask(id="a", name="A", duration_hours=5.0, dependencies=["s"]),
        CpmTask(id="b", name="B", duration_hours=5.0, dependencies=["s"]),
        CpmTask(id="e", name="End", duration_hours=1.0, dependencies=["a", "b"]),
    ]
    seq = [t.id for t in critical_path_sequence(tasks)]
    assert seq[0] == "s"
    assert seq[-1] == "e"
    assert len(seq) == 3  # s, (a or b), e
    assert seq[1] in {"a", "b"}
