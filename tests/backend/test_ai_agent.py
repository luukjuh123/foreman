"""Tests for the AI agent service — analyze project specs and propose task ordering."""

from __future__ import annotations

from typing import Any

import pytest

from app.services.planning.agent import AIAgent, AgentTaskSpec, ProjectSpec
from app.services.planning.llm import LLMClient


class FakeLLM:
    """Records the last prompt and returns a scripted response."""

    def __init__(self, response: dict[str, Any]) -> None:
        self.response = response
        self.last_system: str | None = None
        self.last_user: str | None = None
        self.calls = 0

    async def complete_json(self, system: str, user: str) -> dict[str, Any]:
        self.last_system = system
        self.last_user = user
        self.calls += 1
        return self.response


def _spec(*names: str) -> ProjectSpec:
    return ProjectSpec(
        name="House Renovation",
        description="Full kitchen + bathroom renovation",
        tasks=[AgentTaskSpec(name=n) for n in names],
    )


@pytest.mark.asyncio
async def test_agent_returns_ordered_tasks_with_reasoning() -> None:
    llm = FakeLLM({
        "ordered_tasks": [
            {"name": "Demolition", "depends_on": [], "reasoning": "Must clear space first"},
            {"name": "Plumbing rough-in", "depends_on": ["Demolition"], "reasoning": "Open walls needed"},
            {"name": "Drywall", "depends_on": ["Plumbing rough-in"], "reasoning": "After utilities"},
        ],
        "summary": "Three-phase sequential plan",
    })
    agent = AIAgent(llm=llm)
    plan = await agent.plan(_spec("Demolition", "Plumbing rough-in", "Drywall"))

    assert [t.name for t in plan.ordered_tasks] == ["Demolition", "Plumbing rough-in", "Drywall"]
    assert plan.ordered_tasks[1].depends_on == ["Demolition"]
    assert all(t.reasoning for t in plan.ordered_tasks)
    assert plan.summary == "Three-phase sequential plan"


@pytest.mark.asyncio
async def test_agent_prompt_includes_project_name_and_task_names() -> None:
    llm = FakeLLM({"ordered_tasks": [{"name": "A", "depends_on": [], "reasoning": "only task"}]})
    agent = AIAgent(llm=llm)
    await agent.plan(_spec("A"))
    assert "House Renovation" in (llm.last_user or "")
    assert "A" in (llm.last_user or "")


@pytest.mark.asyncio
async def test_agent_rejects_response_missing_reasoning() -> None:
    llm = FakeLLM({"ordered_tasks": [{"name": "A", "depends_on": []}]})
    agent = AIAgent(llm=llm)
    with pytest.raises(ValueError, match="reasoning"):
        await agent.plan(_spec("A"))


@pytest.mark.asyncio
async def test_agent_rejects_unknown_dependency_names() -> None:
    llm = FakeLLM({"ordered_tasks": [
        {"name": "A", "depends_on": ["NonExistent"], "reasoning": "x"},
    ]})
    agent = AIAgent(llm=llm)
    with pytest.raises(ValueError, match="Unknown"):
        await agent.plan(_spec("A"))


@pytest.mark.asyncio
async def test_agent_rejects_cycle_in_ordering() -> None:
    llm = FakeLLM({"ordered_tasks": [
        {"name": "A", "depends_on": ["B"], "reasoning": "x"},
        {"name": "B", "depends_on": ["A"], "reasoning": "y"},
    ]})
    agent = AIAgent(llm=llm)
    with pytest.raises(ValueError, match="cycle"):
        await agent.plan(_spec("A", "B"))


@pytest.mark.asyncio
async def test_agent_empty_spec_returns_empty_plan() -> None:
    llm = FakeLLM({"ordered_tasks": []})
    agent = AIAgent(llm=llm)
    plan = await agent.plan(ProjectSpec(name="empty", description="", tasks=[]))
    assert plan.ordered_tasks == []
    assert llm.calls == 0


def test_llm_client_protocol_is_satisfied_by_fake() -> None:
    fake: LLMClient = FakeLLM({})
    assert fake is not None


def test_static_llm_client_returns_configured_response() -> None:
    import asyncio

    from app.services.planning.llm import StaticLLMClient

    canned = {"foo": "bar"}
    client = StaticLLMClient(canned)
    result = asyncio.run(client.complete_json("s", "u"))
    assert result == canned
    # Returns a copy, not the same dict
    assert result is not canned
