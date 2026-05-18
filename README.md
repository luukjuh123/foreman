# foreman

![CI](https://github.com/luukjuh123/foreman/actions/workflows/ci.yml/badge.svg)

> AI-powered construction building planning software for construction planners and DIY home builders.

## What this is

Foreman is a full-stack platform that brings AI-driven task scheduling, material cost intelligence, and financial tracking to construction projects. AI agents analyze your project specs and generate optimal task ordering, critical paths, and schedules that account for dependencies, resource availability, and weather constraints. Hardware store integrations (Hornbach, Gamma, Praxis, Bouwmaat) provide real-time material pricing and availability.

## Getting started

```bash
# Backend
cd src/backend
uv sync
uv run uvicorn app.main:app --reload

# Frontend
cd src/frontend
npm install
npm run dev

# Tests
cd tests/backend && uv run pytest
cd tests/frontend && npm run test
```

## Agent team

| Agent | Role |
|-------|------|
| `foreman-backend-engineer` | FastAPI, DB, AI planning engine, store scrapers |
| `foreman-frontend-engineer` | Next.js dashboard, Gantt, financial charts |
| `architect` | Architecture diagrams and DESIGN.md maintenance |

## Atlas constellation

This galaxy is managed by the Atlas orchestrator workspace at `universe/`.
