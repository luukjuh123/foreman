"""AI agent service — analyze project specs and propose an optimal task ordering.

The agent takes a `ProjectSpec` (name, description, raw task list) and asks an
`LLMClient` to suggest dependencies + ordering. The response is validated and
returned as an `AgentPlan`. Every task carries a human-readable `reasoning`
string per the foreman convention.

The agent does NOT touch the database. The router layer is responsible for
persisting any accepted plan.
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass, field

from app.services.planning.llm import LLMClient


@dataclass
class AgentTaskSpec:
    """Raw task input — just a name (and optional notes) before the agent runs."""

    name: str
    notes: str = ""


@dataclass
class ProjectSpec:
    """Project description fed to the agent."""

    name: str
    description: str
    tasks: list[AgentTaskSpec] = field(default_factory=list)


@dataclass
class OrderedTask:
    """One task in the agent's proposed ordering."""

    name: str
    depends_on: list[str]
    reasoning: str


@dataclass
class AgentPlan:
    """Result of `AIAgent.plan()`."""

    ordered_tasks: list[OrderedTask]
    summary: str = ""


_SYSTEM_PROMPT = (
    "You are an expert construction planner. Given a project description and a "
    "list of tasks, return a JSON object with the optimal execution ordering "
    "and explicit dependencies. Required schema:\n"
    '{"ordered_tasks": [{"name": str, "depends_on": [str, ...], '
    '"reasoning": str}], "summary": str}\n'
    "Every task MUST include a non-empty `reasoning` field explaining why it is "
    "placed where it is. Dependencies MUST reference task names from the input."
)


def _build_user_prompt(spec: ProjectSpec) -> str:
    payload = {
        "project_name": spec.name,
        "description": spec.description,
        "tasks": [{"name": t.name, "notes": t.notes} for t in spec.tasks],
    }
    return json.dumps(payload, ensure_ascii=False)


def _validate_no_cycle(tasks: list[OrderedTask]) -> None:
    name_set = {t.name for t in tasks}
    in_degree = {t.name: 0 for t in tasks}
    successors: dict[str, list[str]] = {t.name: [] for t in tasks}
    for t in tasks:
        for dep in t.depends_on:
            if dep not in name_set:
                msg = f"Unknown dependency '{dep}' for task '{t.name}'"
                raise ValueError(msg)
            in_degree[t.name] += 1
            successors[dep].append(t.name)

    queue: deque[str] = deque(n for n, d in in_degree.items() if d == 0)
    visited = 0
    while queue:
        cur = queue.popleft()
        visited += 1
        for succ in successors[cur]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                queue.append(succ)
    if visited != len(tasks):
        msg = "Dependency cycle detected in agent ordering"
        raise ValueError(msg)


class AIAgent:
    """Coordinates LLM calls to produce a validated task ordering."""

    def __init__(self, *, llm: LLMClient) -> None:
        self._llm = llm

    async def plan(self, spec: ProjectSpec) -> AgentPlan:
        if not spec.tasks:
            return AgentPlan(ordered_tasks=[], summary="")

        raw = await self._llm.complete_json(_SYSTEM_PROMPT, _build_user_prompt(spec))
        ordered_raw = raw.get("ordered_tasks", [])
        if not isinstance(ordered_raw, list):
            msg = "LLM response 'ordered_tasks' must be a list"
            raise ValueError(msg)

        ordered: list[OrderedTask] = []
        for item in ordered_raw:
            if not isinstance(item, dict):
                msg = "Each ordered_tasks entry must be a JSON object"
                raise ValueError(msg)
            name = item.get("name")
            reasoning = item.get("reasoning")
            depends_on = item.get("depends_on", [])
            if not name or not isinstance(name, str):
                msg = "Task entry missing 'name'"
                raise ValueError(msg)
            if not reasoning or not isinstance(reasoning, str):
                msg = f"Task '{name}' missing human-readable reasoning"
                raise ValueError(msg)
            if not isinstance(depends_on, list) or not all(isinstance(d, str) for d in depends_on):
                msg = f"Task '{name}' has invalid depends_on"
                raise ValueError(msg)
            ordered.append(OrderedTask(name=name, depends_on=list(depends_on), reasoning=reasoning))

        _validate_no_cycle(ordered)
        summary = raw.get("summary", "")
        if not isinstance(summary, str):
            summary = ""
        return AgentPlan(ordered_tasks=ordered, summary=summary)
