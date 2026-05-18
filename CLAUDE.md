# foreman

AI-powered construction management platform for Dutch bouwbedrijven (construction companies). Full business suite: project planning with AI scheduling, process tracking with photo recognition, Dutch e-invoicing (UBL/Peppol), financial bookkeeping, staff management, customer reports, voice-driven AI assistant (Nvidia Personaplex), Google Reviews, notifications, and hardware store price comparisons. Mobile + desktop. Freemium SaaS model.

## Stack
- **Backend**: Python 3.12 + FastAPI + SQLAlchemy + Alembic + PostgreSQL
- **Frontend**: Next.js 16 (TypeScript) + Tailwind CSS + shadcn/ui
- **AI**: OpenAI API / local LLM for planning agent reasoning
- **Voice**: Nvidia Personaplex / Riva for voice prompting, Whisper for transcription
- **Invoicing**: UBL 2.1 XML generation, PDF rendering (WeasyPrint or similar)
- **Payments**: Mollie (Dutch payment provider) for subscriptions
- **Mobile**: PWA or React Native (TBD Phase 16 evaluation)
- **Monorepo layout**: `src/backend/` and `src/frontend/`
- **Deploy**: kubernetes (`deploy: kubernetes`)

## Agent Team
| Agent | Role |
|-------|------|
| foreman-backend-engineer | FastAPI backend, DB models, AI planning engine, store integrations |
| foreman-frontend-engineer | Next.js dashboard, Gantt view, financial charts, material search UI |
| architect | Maintains architecture diagrams in `docs/architecture/` |

## Conventions
- Test-first: write tests before implementation (red-green-refactor). No exceptions.
- PRs only: never push to main — every todo item gets its own PR.
- Backend tests live in `tests/backend/`, frontend tests in `tests/frontend/`.
- All monetary values stored as **integer euro cents** (e.g., €1.23 = 123).
- Display money as Dutch locale: `€1.234,56`.
- Dates stored ISO 8601; displayed as `dd-MM-yyyy` (Dutch locale).
- VAT rates: 21% (standard), 9% (reduced), 0% (exempt). Store as integer basis points.
- Material quantities in SI units (meters, kg, liters); never imperial.
- Hardware store scrapers must respect rate limits — use `asyncio.sleep` between requests.
- AI planning outputs must include human-readable reasoning for every decision.
- Config is 100% environment-driven (see `src/backend/app/core/config.py`); no secrets in repo.
- SQLAlchemy models use UUID primary keys.

## Imports
@.claude/rules/test-first.md
@.claude/rules/pr-workflow.md
@.claude/rules/karpathy-guidelines.md
