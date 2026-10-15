# Feature Specification: Foreman — Baseline v1

**Created**: 2026-10-15
**Status**: Baseline

Foreman is an AI-powered construction management platform for Dutch bouwbedrijven (and DIY home builders): project planning with AI scheduling, process tracking with photo recognition, Dutch e-invoicing, bookkeeping, staff and subcontractor management, reports, notifications, voice-driven assistance and hardware-store price comparison. Freemium SaaS; Python 3.12 FastAPI + PostgreSQL backend and Next.js 16 frontend.

## User Scenarios & Testing

### User Story 1 - Plan a project with AI scheduling (Priority: P1)
A construction planner defines phases and tasks and lets the AI generate an optimal schedule.

**Acceptance Scenarios**:
1. **Given** tasks with dependencies, **When** the planner is triggered, **Then** a task ordering, critical path and Gantt schedule are returned with human-readable reasoning per decision.
2. **Given** a dependency cycle, **When** saved, **Then** validation rejects it.
3. **Given** AI suggestions, **When** shown, **Then** the user can accept or reject them.

### User Story 2 - Quote, invoice and get paid (Priority: P1)
A contractor sends an offerte, converts it to a project and invoices in Dutch e-invoice format.

**Acceptance Scenarios**:
1. **Given** a quote with line items, **When** sent and accepted, **Then** `convert` creates a project and an optional draft invoice.
2. **Given** an invoice, **When** exported, **Then** a UBL 2.1 XML and PDF are produced with VAT in basis points.
3. **Given** amounts, **When** displayed, **Then** the Dutch money format `€1.234,56` is used.

### User Story 3 - Track processes, time and photos (Priority: P2)
A site worker logs time per process and uploads photos.

**Acceptance Scenarios**:
1. **Given** a running timer, **When** stopped, **Then** the duration is stored for historical averaging.
2. **Given** a site photo, **When** uploaded, **Then** the AI identifies the process and estimates completion %.
3. **Given** historical data, **When** planning, **Then** predicted durations use past process averages.

### User Story 4 - Manage finances, staff and subcontractors (Priority: P2)
A business owner tracks costs, bookkeeping, staff and subcontractor spending.

**Acceptance Scenarios**:
1. **Given** project costs and invoices, **When** the financial dashboard loads, **Then** revenue, outstanding invoices and margins are shown.
2. **Given** a subcontractor assignment, **When** hours are logged, **Then** costs are tracked separately from staff and certification expiry warnings are shown.

### User Story 5 - Materials and hardware-store prices (Priority: P2)
A builder compares material prices across Hornbach, Gamma, Praxis and Bouwmaat.

**Acceptance Scenarios**:
1. **Given** a material search, **When** executed, **Then** prices and availability from supported stores are returned within rate limits.
2. **Given** a CSV of materials, **When** imported, **Then** fuzzy-matched shopping lists are created.

### User Story 6 - Operate the SaaS (Priority: P3)
An operator runs, secures and bills the platform.

**Acceptance Scenarios**:
1. **Given** a new user, **When** registered, **Then** an onboarding tour is shown and a free trial starts; upgrades go through Mollie.
2. **Given** excessive requests, **When** limits are hit, **Then** slowapi throttles (100/15 min general, 10/15 min auth).
3. **Given** project events, **When** configured, **Then** webhooks notify external systems.

## Requirements

### Functional Requirements
- **FR-001**: System MUST provide JWT authentication (bcrypt) with register/login and multi-user data scoping.
- **FR-002**: System MUST provide CRUD for projects, phases and tasks with pagination, dependency graphs, cycle detection and CPM critical path.
- **FR-003**: System MUST provide an AI planning engine (task ordering, schedule optimisation with weather/resource constraints, decision reasoning, learning from history).
- **FR-004**: System MUST track processes, time and photos, with photo recognition and historical analytics.
- **FR-005**: System MUST provide quotes (OFF-YYYY-NNNN) with send/accept/convert, and invoices with UBL 2.1 and PDF output.
- **FR-006**: System MUST provide costs, bookkeeping, financial dashboards, staff management, subcontractor management and reports.
- **FR-007**: System MUST provide notifications, an agenda, document management with versioning (S3-compatible), audit log, data export (ZIP) and webhooks.
- **FR-008**: System MUST integrate hardware store price search and a material calculator in SI units.
- **FR-009**: System MUST support voice prompting (Personaplex/Riva, Whisper), Google Reviews, and Mollie subscription billing.
- **FR-010**: Frontend MUST provide a Next.js 16 dashboard with Gantt (including multi-project), kanban, financial charts, dark/light theme, onboarding and grouped navigation; mobile via PWA/React Native evaluation.
- **FR-011**: System MUST be deployable with Docker, Helm, nginx and Kubernetes manifests.

### Key Entities
- **Project / Phase / Task**: Planning hierarchy with dependencies.
- **Process**: Reusable template (e.g. stucen, tegelen) with time entries and photos.
- **Quote / Invoice**: Commercial documents with line items in cents and VAT in basis points.
- **Material / Store price**: Items with SI quantities and store listings.
- **Staff / Subcontractor**: Workers with rates, certifications (VCA, BRL), ratings.
- **Document / Audit event / Webhook**: Supporting records.

## Success Criteria
- **SC-001**: Backend and frontend test suites and CI pass.
- **SC-002**: Every AI scheduling decision includes reasoning text.
- **SC-003**: All stored monetary values are integer cents (no floats), verified by tests.
- **SC-004**: Cycle-creating dependencies are rejected in 100% of tested cases.
- **SC-005**: Store scrapers never exceed configured rate limits.

## Assumptions
- Phases 1–21 and most of phase 22 (admin hubs, quotes) are delivered; open `todo.md` items include rebuilding a purpose-built field-worker frontend and the full `LAWS.bend` (32 laws), plus the open production-readiness work.
- AI uses the OpenAI API or a local LLM; the voice stack depends on Nvidia services.
- The mobile approach (PWA vs React Native) was evaluated in phase 16.
- Freemium pricing tiers are handled by the billing module.
