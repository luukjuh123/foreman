# foreman — Todo

## Priority: High (Phase 1 — Foundation) ✅

- [x] Backend: FastAPI app skeleton with /healthz, CORS, env config, structured logging — (shipped in initial scaffold)
- [x] Backend: Database models (Project, Phase, Task, Material, User) with SQLAlchemy + UUID PKs + Alembic migrations — PR #2
- [x] Backend: User authentication — JWT-based login/register endpoints (bcrypt passwords) — (shipped in initial scaffold)
- [x] Frontend: Next.js 16 app skeleton with Tailwind CSS, shadcn/ui, dark theme config — (shipped in initial scaffold)
- [x] Frontend: Auth pages (login/register) with API integration and token storage — (shipped in initial scaffold)
- [x] Frontend: Main dashboard layout with sidebar navigation and route structure — (shipped in initial scaffold)
- [x] Verify CI passes on first PR

## Priority: High (Phase 2 — Project Management + Planning) ✅

- [x] Backend: CRUD endpoints for projects, phases, tasks (with pagination) — (shipped in initial scaffold)
- [x] Backend: Task dependency graph model and cycle-detection validation — PR #12
- [x] Frontend: Project creation wizard (multi-step form: name -> phases -> tasks) — (shipped in initial scaffold)
- [x] Frontend: Project overview dashboard with phase cards and progress bars — PR #101
- [x] Frontend: Task board (kanban-style) per project phase — PR #103
- [x] Frontend: Gantt chart / timeline view with drag-and-drop rescheduling — PR #17
- [x] Backend: AI auto-fill planning — generate Gantt schedule from todo list + historical process durations — PR #16
- [x] Frontend: AI planning panel — trigger planning, stream agent reasoning, accept/reject suggestions — (shipped in initial scaffold)

## Priority: High (Phase 3 — History + Process Tracking) ✅

- [x] Backend: Process model — reusable process templates coupled to projects (e.g. "stucen", "tegelen", "schilderen") — PR #75
- [x] Backend: Time tracking — start/stop per process per project, stored durations for historical averaging — PR #76
- [x] Backend: Photo recognition service — upload site photos, AI identifies which process is being done + estimates completion % — PR #78
- [x] Backend: Historical analytics — average duration per process type across all projects (feeds AI planning) — PR #79
- [x] Frontend: Process timeline per project — visual history of what was done when, with photos — PR #109
- [x] Frontend: Time tracking widget — start/stop timer, attach photos, notes — PR #108
- [x] Frontend: Process library — browse all known processes with avg durations and costs — PR #110

## Priority: High (Phase 4 — AI Planning Engine) ✅

- [x] Backend: AI agent service — analyze project specs and generate optimal task ordering — PR #23
- [x] Backend: Critical path calculation (CPM algorithm) and dependency resolution — PR #27
- [x] Backend: AI schedule optimizer accounting for weather, resource, and dependency constraints — PR #31
- [x] Backend: Agent decision engine — returns prioritized task list with human-readable reasoning per decision — PR #34
- [x] Backend: AI learns from historical process data — uses past durations to predict future schedules — PR #35

## Priority: High (Phase 5 — Agenda) ✅

- [x] Backend: Agenda endpoints — weekly/daily view of scheduled tasks across all projects — PR `feat/agenda-endpoints`
- [x] Backend: Calendar sync — iCal export for external calendar integration — PR `feat/ical-export`
- [x] Frontend: Beautiful weekly agenda view — day columns with time blocks per project (color-coded) — PR #100
- [x] Frontend: Daily view with task details, assigned staff, location — PR #105
- [x] Frontend: Drag-and-drop rescheduling from agenda view (syncs with Gantt) — PR #99

## Priority: High (Phase 6 — Invoices — Dutch e-Invoicing) ✅

- [x] Backend: Invoice model — line items, VAT (BTW 21%/9%), payment terms, invoice numbering (PR #TBD-invoice-model)
- [x] Backend: UBL 2.1 invoice XML generation (Dutch e-invoicing standard / Peppol) (PR #TBD-invoice-ubl-export)
- [x] Backend: PDF invoice generation — branded template with company details, KVK, BTW-nummer (PR #TBD-invoice-pdf-generation)
- [x] Backend: Invoice status tracking — draft, sent, paid, overdue, with reminders (PR #TBD-invoice-status-tracking)
- [x] Backend: Link invoices to projects — auto-populate from project costs/materials (PR #TBD-invoice-project-link)
- [x] Frontend: Invoice creation form — customer, line items, VAT, discounts, payment terms — PR #106
- [x] Frontend: Invoice list with status filters (draft/sent/paid/overdue) — PR #107
- [x] Frontend: Invoice PDF preview and send-via-email flow — PR #130

## Priority: Medium (Phase 7 — Costs + Financial Dashboard) ✅

- [x] Backend: Budget model and cost tracking endpoints (all values in euro cents) — PR feat/budget-model
- [x] Backend: Material cost aggregation from store integration prices — PR feat/material-cost-aggregation
- [x] Backend: Labor cost estimation service (hourly rates x estimated hours per task) — PR feat/labor-cost-estimation
- [x] Backend: Per-project total cost calculation — materials + labor + equipment + overhead — PR feat/project-total-cost
- [x] Frontend: Financial overview dashboard — total budget, spent, remaining, variance — PR #114
- [x] Frontend: Cost breakdown charts per phase and category (materials, labor, equipment) — PR #113
- [x] Frontend: Material cost tracker with live price update badges — PR #112
- [x] Frontend: Profit margin calculator for professional planners — PR #115

## Priority: Medium (Phase 8 — Full Financials) ✅

- [x] Backend: Chart of accounts model — standard Dutch boekhoudschema (rekeningschema) (PR: `feat/chart-of-accounts`)
- [x] Backend: Journal entries and double-entry bookkeeping engine (PR: `feat/journal-entries`)
- [x] Backend: Balance sheet (balans) generation endpoint — assets, liabilities, equity (PR: `feat/balance-sheet`)
- [x] Backend: Income statement (winst- en verliesrekening) generation endpoint (PR: `feat/income-statement`)
- [x] Backend: Cash flow statement generation — operating, investing, financing activities (PR: `feat/cashflow-statement`)
- [x] Backend: Period closing — lock periods, generate year-end reports (PR: `feat/period-closing`)
- [x] Frontend: Income statement view — revenue vs expenses per period — PR #117
- [x] Frontend: Balance sheet view — expandable account tree with totals — PR #162
- [x] Frontend: Cash flow overview with charts (monthly/quarterly/yearly) — PR #133
- [x] Frontend: Financial reports export (PDF, CSV) — PR #161

## Priority: Medium (Phase 9 — Staff Management) ✅

- [x] Backend: Staff model — employees, hourly rates, roles, availability (PR feat/staff-model)
- [x] Backend: Payroll basics — hours worked per project, gross salary calculation (PR feat/payroll-basics)
- [x] Backend: Staff loans (voorschotten) — track advances, deductions from salary (PR feat/staff-loans)
- [x] Backend: Staff assignment to projects/tasks — who works where when (PR feat/staff-assignment)
- [x] Frontend: Staff directory — list, add, edit employees with rates and roles — PR #153
- [x] Frontend: Staff schedule — who is assigned to which project this week — PR #153
- [x] Frontend: Loan tracking — issue advances, view outstanding balances per employee — PR #153
- [x] Frontend: Payroll overview — hours per project, total due per employee per period — PR #153

## Priority: Medium (Phase 10 — Rapports / Reports) ✅

- [x] Backend: Report generation engine — aggregate project data into structured reports — PR #26
- [x] Backend: Weekly report — work done per project, hours, costs, photos, next week plan — PR #29
- [x] Backend: Project completion report — full summary: timeline, costs vs budget, photos, lessons — PR #30
- [x] Backend: PDF report generation with branded template — PR #37
- [x] Backend: Auto-send reports via email to customers/stakeholders — PR #45
- [x] Frontend: Report builder — select project/period, preview, generate — PR #139
- [x] Frontend: Report history — browse past reports per project — PR #139
- [x] Frontend: Customer-facing report view (shareable link, no login required) — PR #139

## Priority: Medium (Phase 11 — Notifications) ✅

- [x] Backend: Notification engine — in-app + email + push notification dispatch — PR #57
- [x] Backend: Customer email notifications — project updates, invoice sent, report ready — PR #58
- [x] Backend: Inbound detection — new customer inquiry via email/form triggers notification — PR #59
- [x] Backend: AI-driven alerts — recognize anomalies (over budget, behind schedule, weather risk) — PR #91
- [x] Backend: Notification preferences per user (email, push, in-app toggles) — PR #92
- [x] Frontend: Notification center — bell icon, unread count, notification list — PR #127
- [x] Frontend: Notification settings page — per-type toggle (email/push/in-app) — PR #140

## Priority: Medium (Phase 12 — Hardware Store Integrations) ✅

- [x] Backend: Scraping service base — async, rate-limited, cached (Redis or in-memory TTL) — PR feat/scraper-base
- [x] Backend: Hornbach integration — product search, pricing (euro cents), stock availability — PR feat/hornbach-integration
- [x] Backend: Gamma integration — product search, pricing (euro cents), stock availability — PR feat/gamma-integration
- [x] Backend: Praxis integration — product search, pricing (euro cents), stock availability — PR feat/praxis-integration
- [x] Backend: Bouwmaat integration — product search, pricing (euro cents), stock availability — PR feat/bouwmaat-integration
- [x] Backend: Price comparison engine — cross-store ranking by price + availability — PR feat/price-comparison-engine
- [x] Frontend: Material search with cross-store price comparison table — PR #147
- [x] Frontend: Store availability map — per-store stock status badges — PR #151

## Priority: Medium (Phase 13 — Material Calculator) ✅

- [x] Backend: Material estimation algorithms — paint (m2/liter), tiles (m2 + 10% waste), concrete (m3), lumber (linear meters) — branch `feat/material-estimation-algorithms`
- [x] Backend: Room/area dimension API — inputs dimensions -> material quantities — branch `feat/room-dimension-api`
- [x] Frontend: Material calculator wizard — input dimensions -> quantities + costs -> shopping list — PR #126
- [x] Frontend: Shopping list generator with store deep-links — PR #125

## Priority: Medium (Phase 14 — Voice Prompting) ✅

- [x] Backend: Voice input endpoint — accept audio, transcribe (Whisper or Nvidia Riva) — PR #24
- [x] Backend: Nvidia Personaplex integration — conversational AI for hands-free project management — PR #25
- [x] Backend: Voice command parser — map spoken commands to actions (create task, log hours, check schedule) — PR #28
- [x] Backend: Voice response generation — TTS for AI responses (status updates, schedule readouts) — PR #32
- [x] Frontend: Voice input button — push-to-talk or continuous listening mode — PR #144
- [x] Frontend: Voice conversation UI — transcript view with AI responses — PR #145
- [x] Frontend: Hands-free mode — optimized for mobile use while commuting or on-site — PR #143

## Priority: Medium (Phase 15 — Google Reviews) ✅

- [x] Backend: Google Business Profile API integration — fetch reviews, ratings, reply — PR #38
- [x] Backend: Review aggregation — track rating trends over time — PR #60
- [x] Backend: AI-assisted review responses — draft professional replies to customer reviews — PR #61
- [x] Frontend: Reviews dashboard — latest reviews, avg rating, trend chart — PR #141
- [x] Frontend: Review response composer — AI draft + manual edit + post — PR #142

## Priority: Low (Phase 16 — Mobile App) ✅

- [x] Evaluate: PWA vs React Native vs Expo for mobile delivery — PWA chosen (reuses Next.js frontend)
- [x] Mobile: Core navigation — bottom tab bar (Dashboard, Projects, Agenda, Notifications, More)
- [x] Mobile: Offline support — cache active project data, sync when online
- [x] Mobile: Camera integration — take site photos directly into process tracking
- [x] Mobile: Push notifications via Web Push API
- [x] Mobile: Voice input integration (reuse Phase 14 backend) — already available via PWA
- [x] Mobile: Time tracking widget — quick start/stop from home screen

## Priority: Low (Phase 17 — Billing / Subscription) ✅

- [x] Backend: Subscription model — free tier (1 project), paid tiers (unlimited projects) (branch `feat/subscription-model-v2`)
- [x] Backend: Stripe/Mollie integration — subscription creation, invoicing, webhooks (branch `feat/mollie-integration`)
- [x] Backend: Usage metering — track projects, users, storage per account (branch `feat/usage-metering`)
- [x] Backend: Trial period logic — first-time users get full access free, then paywall (branch `feat/trial-period-logic`)
- [x] Frontend: Pricing page — tier comparison, feature matrix — PR #148
- [x] Frontend: Settings > Subscription — current plan, upgrade, payment method, invoices — PR #150
- [x] Frontend: Paywall gate — soft limit on free tier, prompt to upgrade — PR #149

## Priority: Low (Phase 18 — Production Readiness)

- [x] Docker multi-stage build — backend (Python/uvicorn) + frontend (Next.js standalone) — PR #157
- [x] Helm chart values.yaml for k8s deployment — PR #164
- [x] Nginx reverse proxy config (frontend serves static, /api/* proxies to backend) — PR #159
- [x] E2E tests for critical flows: auth, project creation, AI plan generation, material search — PR #158
- [x] E2E tests for billing flows: signup, free trial, upgrade, invoice generation — PR #160

## Priority: Medium (Phase 19 — Polish & Advanced Features) ✅

- [x] Backend: API rate limiting middleware — per-user throttle (100 req/15min general, 10 req/15min auth) using slowapi — PR #211
- [x] Backend: Webhook system — notify external systems on project/invoice/report events via configurable HTTP callbacks — PR #212
- [x] Frontend: Dashboard KPI widgets — active projects count, overdue tasks, monthly revenue, outstanding invoices as stat cards
- [x] Frontend: Dark/light theme toggle with persistent preference (localStorage + cookie for SSR)
- [x] Backend: Data export API — full project archive as ZIP (project JSON + photos + invoices + reports)

## Priority: Medium (Phase 20 — Subcontractor Management)

- [x] Backend: Subcontractor model — company name, KVK number, specialties, hourly/fixed rates, certifications (VCA, BRL), rating — PR feat/subcontractor-management
- [x] Backend: CRUD endpoints for subcontractors with search/filter by specialty and availability — PR feat/subcontractor-management
- [x] Backend: Assign subcontractors to project phases/tasks — track their hours and costs separately from staff — PR feat/subcontractor-management
- [x] Backend: Subcontractor invoice linking — match incoming invoices to project costs, auto-reconcile with bookkeeping — PR feat/subcontractor-management
- [x] Frontend: Subcontractor directory — list, add, edit with certification expiry warnings — PR #188
- [x] Frontend: Subcontractor assignment UI on project phase cards — pick from directory, set rates — PR #188
- [x] Frontend: Subcontractor cost dashboard — spending per project, per subcontractor, margin analysis — PR #188

## Priority: Medium (Phase 21 — Feature Improvements) ✅

- [x] Backend: Document management — upload/download contracts, permits, drawings per project with file versioning; S3-compatible storage — PR #198
- [x] Backend: Audit log — track all user actions (create/update/delete) across projects, invoices, staff, and subcontractors — PR #190, PR #224
- [x] Frontend: Multi-project Gantt view — combined timeline of all active projects on a single horizontal chart for cross-project resource planning — PR #215
- [x] Frontend: Bulk material CSV import — upload CSV file with columns to auto-create shopping lists with fuzzy-match — PR #216
- [x] Frontend: Onboarding wizard — first-time user flow triggered after registration; 4-step interactive tour — PR #221

## Priority: High (Phase 22 — Core Admin & Contracting UI)

- [x] Frontend: Dashboard command center redesign — greeting header with Dutch time-of-day + date, quick-action buttons (Nieuw project, Nieuwe factuur), refined 4-KPI row (actieve projecten, openstaande facturen, omzet, achterstallige taken) with trend badges, actieve projecten cards with progress bars and status badges, Vandaag agenda strip with project color coding, Aandacht nodig panel for overdue invoices and behind-schedule tasks, loading skeletons, empty states with CTAs, consistent Dutch labels and euro formatting — PR #TBD

## Completed
<!-- [x] Task description — PR #N -->
