# Foreman Constitution

## Core Principles

### I. Money Is Integer Cents, Dutch Locale on Display
All monetary values are stored as integer euro cents (€1.23 = 123) and displayed in Dutch locale (`€1.234,56`). VAT rates (21% standard, 9% reduced, 0% exempt) are stored as integer basis points. Dates are stored ISO 8601 and displayed `dd-MM-yyyy`.

### II. Explainable AI Planning
AI planning outputs must include human-readable reasoning for every decision. Scheduling accounts for dependencies, resources and weather, and learns from historical process durations. Dependency graphs are cycle-checked and critical paths computed deterministically (CPM), not left to the model.

### III. SI Units Only
Material quantities are in SI units (meters, kg, liters) — never imperial.

### IV. Respectful Integrations
Hardware store scrapers (Hornbach, Gamma, Praxis, Bouwmaat) respect rate limits (`asyncio.sleep` between requests). Voice (Personaplex/Riva, Whisper), payments (Mollie) and AI providers are accessed through configuration, never hard-coded.

### V. Environment-Driven Configuration, No Secrets
Config is 100% environment-driven (`src/backend/app/core/config.py`). No secrets live in the repo. SQLAlchemy models use UUID primary keys.

### VI. Dutch Compliance
Invoicing produces UBL 2.1 XML (Peppol) and PDFs for Dutch bouwbedrijven. The audit log tracks create/update/delete actions across projects, invoices, staff and subcontractors. Rate limiting and webhook delivery protect the API.

### VII. Test-First
Tests precede implementation (red-green-refactor, no exceptions). Backend tests live in `tests/backend/`, frontend tests in `tests/frontend/`. Changes follow the Karpathy guidelines (simple, surgical, goal-driven).

## Quality Gates

Before merge:
- Backend: `cd tests/backend && uv run pytest`
- Frontend: `cd tests/frontend && npm run test` plus build
- CI (`ci.yml`) passes
- Alembic migrations apply cleanly
- Bend laws (`LAWS.bend`, `PROOF.bend`) remain valid where touched

## Development Workflow

- Work is drained from `todo.md`; one PR per item; never push to `main`
- Architecture diagrams in `docs/architecture/` and `DESIGN.md` are kept current by the architect agent
- Deploy target is Kubernetes (Helm chart in `helm/`, manifests in `k8s/`, nginx proxy in `nginx/`)

## Governance

This constitution governs the foreman galaxy. Amendments require a PR and version bump.

**Version**: 1.0.0 | **Ratified**: 2026-10-15 | **Last Amended**: 2026-10-15
