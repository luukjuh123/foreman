# foreman — Todo

## Priority: High (Phase 1 — Foundation)

- [ ] Backend: FastAPI app skeleton with /healthz, CORS, env config, structured logging
- [x] Backend: Database models (Project, Phase, Task, Material, User) with SQLAlchemy + UUID PKs + Alembic migrations — PR #2
- [ ] Backend: User authentication — JWT-based login/register endpoints (bcrypt passwords)
- [ ] Frontend: Next.js 16 app skeleton with Tailwind CSS, shadcn/ui, dark theme config
- [ ] Frontend: Auth pages (login/register) with API integration and token storage
- [ ] Frontend: Main dashboard layout with sidebar navigation and route structure
- [ ] Verify CI passes on first PR

## Priority: High (Phase 2 — Project Management + Planning)

- [ ] Backend: CRUD endpoints for projects, phases, tasks (with pagination)
- [x] Backend: Task dependency graph model and cycle-detection validation — PR #12
- [ ] Frontend: Project creation wizard (multi-step form: name -> phases -> tasks)
- [ ] Frontend: Project overview dashboard with phase cards and progress bars
- [ ] Frontend: Task board (kanban-style) per project phase
- [x] Frontend: Gantt chart / timeline view with drag-and-drop rescheduling — PR #17
- [x] Backend: AI auto-fill planning — generate Gantt schedule from todo list + historical process durations — PR #16
- [ ] Frontend: AI planning panel — trigger planning, stream agent reasoning, accept/reject suggestions

## Priority: High (Phase 3 — History + Process Tracking)

- [x] Backend: Process model — reusable process templates coupled to projects (e.g. "stucen", "tegelen", "schilderen") — PR #75
- [x] Backend: Time tracking — start/stop per process per project, stored durations for historical averaging — PR #76
- [x] Backend: Photo recognition service — upload site photos, AI identifies which process is being done + estimates completion % — PR #78
- [x] Backend: Historical analytics — average duration per process type across all projects (feeds AI planning) — PR #79
- [ ] Frontend: Process timeline per project — visual history of what was done when, with photos
- [ ] Frontend: Time tracking widget — start/stop timer, attach photos, notes
- [ ] Frontend: Process library — browse all known processes with avg durations and costs

## Priority: High (Phase 4 — AI Planning Engine)

- [x] Backend: AI agent service — analyze project specs and generate optimal task ordering — PR #23
- [x] Backend: Critical path calculation (CPM algorithm) and dependency resolution — PR #27
- [x] Backend: AI schedule optimizer accounting for weather, resource, and dependency constraints — PR #31
- [x] Backend: Agent decision engine — returns prioritized task list with human-readable reasoning per decision — PR #34
- [x] Backend: AI learns from historical process data — uses past durations to predict future schedules — PR #35

## Priority: High (Phase 5 — Agenda)

- [x] Backend: Agenda endpoints — weekly/daily view of scheduled tasks across all projects — PR `feat/agenda-endpoints`
- [x] Backend: Calendar sync — iCal export for external calendar integration — PR `feat/ical-export`
- [ ] Frontend: Beautiful weekly agenda view — day columns with time blocks per project (color-coded)
- [ ] Frontend: Daily view with task details, assigned staff, location
- [ ] Frontend: Drag-and-drop rescheduling from agenda view (syncs with Gantt)

## Priority: High (Phase 6 — Invoices — Dutch e-Invoicing)

- [x] Backend: Invoice model — line items, VAT (BTW 21%/9%), payment terms, invoice numbering (PR #TBD-invoice-model)
- [x] Backend: UBL 2.1 invoice XML generation (Dutch e-invoicing standard / Peppol) (PR #TBD-invoice-ubl-export)
- [x] Backend: PDF invoice generation — branded template with company details, KVK, BTW-nummer (PR #TBD-invoice-pdf-generation)
- [x] Backend: Invoice status tracking — draft, sent, paid, overdue, with reminders (PR #TBD-invoice-status-tracking)
- [x] Backend: Link invoices to projects — auto-populate from project costs/materials (PR #TBD-invoice-project-link)
- [ ] Frontend: Invoice creation form — customer, line items, VAT, discounts, payment terms
- [ ] Frontend: Invoice list with status filters (draft/sent/paid/overdue)
- [ ] Frontend: Invoice PDF preview and send-via-email flow

## Priority: Medium (Phase 7 — Costs + Financial Dashboard)

- [x] Backend: Budget model and cost tracking endpoints (all values in euro cents) — PR feat/budget-model
- [x] Backend: Material cost aggregation from store integration prices — PR feat/material-cost-aggregation
- [x] Backend: Labor cost estimation service (hourly rates x estimated hours per task) — PR feat/labor-cost-estimation
- [x] Backend: Per-project total cost calculation — materials + labor + equipment + overhead — PR feat/project-total-cost
- [ ] Frontend: Financial overview dashboard — total budget, spent, remaining, variance
- [ ] Frontend: Cost breakdown charts per phase and category (materials, labor, equipment)
- [ ] Frontend: Material cost tracker with live price update badges
- [ ] Frontend: Profit margin calculator for professional planners

## Priority: Medium (Phase 8 — Full Financials)

- [x] Backend: Chart of accounts model — standard Dutch boekhoudschema (rekeningschema) (PR: `feat/chart-of-accounts`)
- [x] Backend: Journal entries and double-entry bookkeeping engine (PR: `feat/journal-entries`)
- [x] Backend: Balance sheet (balans) generation endpoint — assets, liabilities, equity (PR: `feat/balance-sheet`)
- [x] Backend: Income statement (winst- en verliesrekening) generation endpoint (PR: `feat/income-statement`)
- [x] Backend: Cash flow statement generation — operating, investing, financing activities (PR: `feat/cashflow-statement`)
- [x] Backend: Period closing — lock periods, generate year-end reports (PR: `feat/period-closing`)
- [ ] Frontend: Balance sheet view — expandable account tree with totals
- [ ] Frontend: Income statement view — revenue vs expenses per period
- [ ] Frontend: Cash flow overview with charts (monthly/quarterly/yearly)
- [ ] Frontend: Financial reports export (PDF, CSV)

## Priority: Medium (Phase 9 — Staff Management)

- [x] Backend: Staff model — employees, hourly rates, roles, availability (PR feat/staff-model)
- [x] Backend: Payroll basics — hours worked per project, gross salary calculation (PR feat/payroll-basics)
- [x] Backend: Staff loans (voorschotten) — track advances, deductions from salary (PR feat/staff-loans)
- [x] Backend: Staff assignment to projects/tasks — who works where when (PR feat/staff-assignment)
- [ ] Frontend: Staff directory — list, add, edit employees with rates and roles
- [ ] Frontend: Staff schedule — who is assigned to which project this week
- [ ] Frontend: Loan tracking — issue advances, view outstanding balances per employee
- [ ] Frontend: Payroll overview — hours per project, total due per employee per period

## Priority: Medium (Phase 10 — Rapports / Reports)

- [x] Backend: Report generation engine — aggregate project data into structured reports — PR #26
- [x] Backend: Weekly report — work done per project, hours, costs, photos, next week plan — PR #29
- [x] Backend: Project completion report — full summary: timeline, costs vs budget, photos, lessons — PR #30
- [x] Backend: PDF report generation with branded template — PR #37
- [x] Backend: Auto-send reports via email to customers/stakeholders — PR #45
- [ ] Frontend: Report builder — select project/period, preview, generate
- [ ] Frontend: Report history — browse past reports per project
- [ ] Frontend: Customer-facing report view (shareable link, no login required)

## Priority: Medium (Phase 11 — Notifications)

- [ ] Backend: Notification engine — in-app + email + push notification dispatch
- [ ] Backend: Customer email notifications — project updates, invoice sent, report ready
- [ ] Backend: Inbound detection — new customer inquiry via email/form triggers notification
- [ ] Backend: AI-driven alerts — recognize anomalies (over budget, behind schedule, weather risk)
- [ ] Backend: Notification preferences per user (email, push, in-app toggles)
- [ ] Frontend: Notification center — bell icon, unread count, notification list
- [ ] Frontend: Notification settings page — per-type toggle (email/push/in-app)

## Priority: Medium (Phase 12 — Hardware Store Integrations)

- [x] Backend: Scraping service base — async, rate-limited, cached (Redis or in-memory TTL) — PR feat/scraper-base
- [x] Backend: Hornbach integration — product search, pricing (euro cents), stock availability — PR feat/hornbach-integration
- [x] Backend: Gamma integration — product search, pricing (euro cents), stock availability — PR feat/gamma-integration
- [x] Backend: Praxis integration — product search, pricing (euro cents), stock availability — PR feat/praxis-integration
- [x] Backend: Bouwmaat integration — product search, pricing (euro cents), stock availability — PR feat/bouwmaat-integration
- [x] Backend: Price comparison engine — cross-store ranking by price + availability — PR feat/price-comparison-engine
- [ ] Frontend: Material search with cross-store price comparison table
- [ ] Frontend: Store availability map — per-store stock status badges

## Priority: Medium (Phase 13 — Material Calculator)

- [x] Backend: Material estimation algorithms — paint (m2/liter), tiles (m2 + 10% waste), concrete (m3), lumber (linear meters) — branch `feat/material-estimation-algorithms`
- [x] Backend: Room/area dimension API — inputs dimensions -> material quantities — branch `feat/room-dimension-api`
- [ ] Frontend: Material calculator wizard — input dimensions -> quantities + costs -> shopping list
- [ ] Frontend: Shopping list generator with store deep-links

## Priority: Medium (Phase 14 — Voice Prompting)

- [x] Backend: Voice input endpoint — accept audio, transcribe (Whisper or Nvidia Riva) — PR #24
- [x] Backend: Nvidia Personaplex integration — conversational AI for hands-free project management — PR #25
- [x] Backend: Voice command parser — map spoken commands to actions (create task, log hours, check schedule) — PR #28
- [x] Backend: Voice response generation — TTS for AI responses (status updates, schedule readouts) — PR #32
- [ ] Frontend: Voice input button — push-to-talk or continuous listening mode
- [ ] Frontend: Voice conversation UI — transcript view with AI responses
- [ ] Frontend: Hands-free mode — optimized for mobile use while commuting or on-site

## Priority: Medium (Phase 15 — Google Reviews)

- [x] Backend: Google Business Profile API integration — fetch reviews, ratings, reply — PR #38
- [x] Backend: Review aggregation — track rating trends over time — PR #60
- [x] Backend: AI-assisted review responses — draft professional replies to customer reviews — PR #61
- [ ] Frontend: Reviews dashboard — latest reviews, avg rating, trend chart
- [ ] Frontend: Review response composer — AI draft + manual edit + post

## Priority: Low (Phase 16 — Mobile App)

- [ ] Evaluate: PWA vs React Native vs Expo for mobile delivery
- [ ] Mobile: Core navigation — bottom tab bar (Dashboard, Projects, Agenda, Notifications, More)
- [ ] Mobile: Offline support — cache active project data, sync when online
- [ ] Mobile: Camera integration — take site photos directly into process tracking
- [ ] Mobile: Push notifications via FCM/APNs
- [ ] Mobile: Voice input integration (reuse Phase 14 backend)
- [ ] Mobile: Time tracking widget — quick start/stop from home screen

## Priority: Low (Phase 17 — Billing / Subscription)

- [ ] Backend: Subscription model — free tier (1 project), paid tiers (unlimited projects)
- [ ] Backend: Stripe/Mollie integration — subscription creation, invoicing, webhooks
- [ ] Backend: Usage metering — track projects, users, storage per account
- [ ] Backend: Trial period logic — first-time users get full access free, then paywall
- [ ] Frontend: Pricing page — tier comparison, feature matrix
- [ ] Frontend: Settings > Subscription — current plan, upgrade, payment method, invoices
- [ ] Frontend: Paywall gate — soft limit on free tier, prompt to upgrade

## Priority: Low (Phase 18 — Production Readiness)

- [ ] Docker multi-stage build — backend (Python/uvicorn) + frontend (Next.js standalone)
- [ ] Helm chart values.yaml for k8s deployment
- [ ] Nginx reverse proxy config (frontend serves static, /api/* proxies to backend)
- [ ] E2E tests for critical flows: auth, project creation, AI plan generation, material search
- [ ] E2E tests for billing flows: signup, free trial, upgrade, invoice generation

## Completed
<!-- [x] Task description — PR #N -->
