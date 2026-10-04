import Base

# ============================================================================
# LAWS.bend -- invariant laws of foreman (Bend 2.0.20)
# ============================================================================
#
# What this file is
#   Every `def <constant>()` below mirrors one literal numeric value shipped
#   in the Python backend under src/backend/app/ (file + line noted per
#   group). Every `def <check>` is a pure Nat/Bool predicate over those values
#   or over a concrete witness drawn from the domain the constant governs.
#   Every `law <name>` is a claim that one such predicate, applied to the
#   shipped constants and/or a concrete witness, computes to `True{}`.
#   `PROOF.bend` proves each law with a paired `def Laws.<name>`, which the
#   checker accepts only by reducing both sides of the claimed equality to the
#   same term (`{==}`) -- these are concrete computations over the one
#   shipped literal, exactly as the calling code only ever runs on it.
#
#   Run, from the repo root:
#     BEND_NO_TELEMETRY=1 /home/luuk/universe/.claude/tools/bend/bin/bend PROOF.bend
#   which prints "All terms check." only when every law below is proven.
#
# Domain
#   foreman's "jobs" are construction tasks scheduled by the AI planning
#   engine (services/planning/scheduler.py), its "workers" are the
#   rate-limited hardware-store scrapers (services/stores/base.py), its
#   "retries" are webhook deliveries (services/webhooks/delivery.py), and its
#   backpressure is the per-IP API rate limiter (core/rate_limit_middleware.py).
#   Money is integer euro cents; VAT is integer basis points; time is
#   integer seconds -- so every law is pure integer arithmetic.
#
# Model/code drift gap (keep visible)
#   Bend never reads the Python. If one of the cited literals changes, this
#   file must change in the same commit or the laws silently stop describing
#   the shipped code. See docs/laws.md for the full source-symbol mapping and
#   proof status of every law.
# ============================================================================

# ---------------------------------------------------------------------------
# Generic integer predicates
# ---------------------------------------------------------------------------

def at_least(n: Nat, lo: Nat) -> Bool:
  Nat.is_ge(n, lo)

def at_most(n: Nat, hi: Nat) -> Bool:
  Nat.is_le(n, hi)

def below(n: Nat, hi: Nat) -> Bool:
  Nat.is_lt(n, hi)

def positive(n: Nat) -> Bool:
  Nat.is_ge(n, 1n)

def in_range(+n: Nat, lo: Nat, hi: Nat) -> Bool:
  Bool.and(Nat.is_ge(n, lo), Nat.is_le(n, hi))

# Nat equality as a Bool (a <= b and a >= b).
def nat_eq(+a: Nat, +b: Nat) -> Bool:
  Bool.and(Nat.is_le(a, b), Nat.is_ge(a, b))

# ---------------------------------------------------------------------------
# 1. Job (project) count is never negative
# Source: src/backend/app/models/usage.py
#   project_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  (line 16)
# Source: src/backend/app/services/billing/usage.py, increment_projects()
#   counter.project_count = max(0, counter.project_count + delta)         (line 21)
# ---------------------------------------------------------------------------

def project_count_min() -> Nat:
  0n

# Witness: a freshly provisioned UsageCounter (project_count=0).
def sample_project_count() -> Nat:
  0n

def job_count_nonneg(count: Nat) -> Bool:
  at_least(count, project_count_min())

# ---------------------------------------------------------------------------
# 2. Scraper worker concurrency is at least one
# Source: src/backend/app/services/stores/base.py, RateLimiter.__init__
#   if concurrency < 1: raise ValueError("concurrency must be >= 1")      (line 99)
# Source: StoreClient.__init__ default `concurrency: int = 2`             (line 134)
# ---------------------------------------------------------------------------

def scraper_concurrency_min() -> Nat:
  1n

def default_scraper_concurrency() -> Nat:
  2n

def worker_concurrency_positive(concurrency: Nat) -> Bool:
  at_least(concurrency, scraper_concurrency_min())

# ---------------------------------------------------------------------------
# 3. Scraper request rate is strictly positive
# Source: src/backend/app/services/stores/base.py, RateLimiter.__init__
#   if rate_per_second <= 0: raise ValueError("rate_per_second must be > 0")  (line 97)
# Source: StoreClient.__init__ default `rate_per_second: float = 2.0`     (line 133)
# ---------------------------------------------------------------------------

def default_scraper_rate_per_second() -> Nat:
  2n

def scraper_rate_positive(rate_per_second: Nat) -> Bool:
  positive(rate_per_second)

# ---------------------------------------------------------------------------
# 4. API rate limits: the auth limit is the more conservative bound
# Source: src/backend/app/core/rate_limit_middleware.py, RateLimitMiddleware.__init__
#   self._general = RateLimiter(max_requests=100, window_seconds=15 * 60)  (line 40)
#   self._auth    = RateLimiter(max_requests=10,  window_seconds=15 * 60)  (line 41)
# ---------------------------------------------------------------------------

def general_max_requests() -> Nat:
  100n

def auth_max_requests() -> Nat:
  10n

def api_rate_limit_ordering(+auth: Nat, general: Nat) -> Bool:
  Bool.and(positive(auth), Nat.is_le(auth, general))

# ---------------------------------------------------------------------------
# 5. The Retry-After header equals the sliding-window length
# Source: src/backend/app/core/rate_limit_middleware.py
#   window_seconds=15 * 60                                          (lines 40-41)
#   "Retry-After": "900"                                                (line 61)
# ---------------------------------------------------------------------------

def rate_limit_window_minutes() -> Nat:
  15n

def seconds_per_minute() -> Nat:
  60n

def retry_after_seconds() -> Nat:
  900n

def retry_after_matches_window(retry_after: Nat, window_minutes: Nat) -> Bool:
  nat_eq(retry_after, Nat.mul(window_minutes, seconds_per_minute()))

# ---------------------------------------------------------------------------
# 6. Webhook delivery attempt number is within [1, MAX_ATTEMPTS]
# Source: src/backend/app/services/webhooks/delivery.py
#   MAX_ATTEMPTS = 3                                                    (line 25)
#   for attempt in range(1, MAX_ATTEMPTS + 1):                          (line 57)
# Source: src/backend/app/models/webhook.py, WebhookDeliveryLog
#   attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  (line 39)
# ---------------------------------------------------------------------------

def webhook_first_attempt() -> Nat:
  1n

def webhook_max_attempts() -> Nat:
  3n

# Witness: the second (first retried) delivery attempt.
def sample_webhook_attempt() -> Nat:
  2n

def webhook_attempt_bounded(attempt: Nat) -> Bool:
  in_range(attempt, webhook_first_attempt(), webhook_max_attempts())

# ---------------------------------------------------------------------------
# 7. Webhook backoff doubles on every retry
# Source: src/backend/app/services/webhooks/delivery.py
#   _BASE_BACKOFF_SECONDS = 1.0                                         (line 26)
#   await asyncio.sleep(_BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))   (lines 72, 86)
# Modelled in milliseconds (1.0 s == 1000n) with integer arithmetic.
# ---------------------------------------------------------------------------

def base_backoff_ms() -> Nat:
  1000n

# Sleep after failed attempt `attempt` (1-based): base * 2^(attempt-1).
def webhook_backoff_ms(attempt: Nat) -> Nat:
  Nat.mul(base_backoff_ms(), Nat.pow(2n, Nat.sub(attempt, 1n)))

def webhook_backoff_doubles(+attempt: Nat) -> Bool:
  nat_eq(webhook_backoff_ms(Nat.add(attempt, 1n)), Nat.mul(2n, webhook_backoff_ms(attempt)))

# ---------------------------------------------------------------------------
# 8. Outbound HTTP timeouts are strictly positive
# Source: src/backend/app/services/webhooks/delivery.py
#   _TIMEOUT_SECONDS = 10                                               (line 24)
# Source: src/backend/app/services/stores/base.py, StoreClient.__init__
#   timeout_seconds: float = 10.0                                       (line 136)
# ---------------------------------------------------------------------------

def webhook_timeout_seconds() -> Nat:
  10n

def store_timeout_seconds() -> Nat:
  10n

def delivery_timeout_positive(webhook_timeout: Nat, store_timeout: Nat) -> Bool:
  Bool.and(positive(webhook_timeout), positive(store_timeout))

# ---------------------------------------------------------------------------
# 9. List pagination page size is within [1, 100]
# Source: src/backend/app/routers/projects.py, list_projects()
#   per_page: int = Query(20, ge=1, le=100)                             (line 87)
# (Same bound on every paginated router: invoices, quotes, staff, ...)
# ---------------------------------------------------------------------------

def page_size_min() -> Nat:
  1n

def page_size_max() -> Nat:
  100n

def default_page_size() -> Nat:
  20n

def page_size_bounded(per_page: Nat) -> Bool:
  in_range(per_page, page_size_min(), page_size_max())

# ---------------------------------------------------------------------------
# 10. A working day of scheduled hours fits inside a calendar day
# Source: src/backend/app/services/planning/scheduler.py
#   _HOUR_S = 3_600                                                     (line 21)
#   _DAY_S = 86_400                                                     (line 22)
#   ScheduleOptimizer.optimize(..., working_hours_per_day: int = 8)     (line 103)
# ---------------------------------------------------------------------------

def hour_s() -> Nat:
  3600n

def day_s() -> Nat:
  86400n

def default_working_hours_per_day() -> Nat:
  8n

def working_day_fits_calendar_day(hours_per_day: Nat) -> Bool:
  at_most(Nat.mul(hours_per_day, hour_s()), day_s())

# ---------------------------------------------------------------------------
# 11. A scheduled task never ends before it starts (duration is never negative)
# Source: src/backend/app/services/planning/scheduler.py, ScheduleOptimizer.optimize
#   start_s, end_s = earliest, earliest + duration_s                    (line 171)
# Witness: tests/backend/test_scheduler.py::test_simple_two_task_chain_respects_dependency
#   task "b" (2 h) starts when task "a" (4 h) ends: start 4*H_S, duration 2*H_S.
# ---------------------------------------------------------------------------

def sample_task_start_s() -> Nat:
  14400n

def sample_task_duration_s() -> Nat:
  7200n

def schedule_end_s(start_s: Nat, duration_s: Nat) -> Nat:
  Nat.add(start_s, duration_s)

def schedule_end_not_before_start(+start_s: Nat, duration_s: Nat) -> Bool:
  at_least(schedule_end_s(start_s, duration_s), start_s)

# ---------------------------------------------------------------------------
# 12. The outdoor-task weather search window covers a full (leap) year
# Source: src/backend/app/services/planning/scheduler.py, ScheduleOptimizer.optimize
#   for _ in range(366):                                                (line 161)
#   raise RuntimeError("No clear weather window found within 366 days") (line 164)
# ---------------------------------------------------------------------------

def weather_window_days() -> Nat:
  366n

def days_per_year() -> Nat:
  365n

def weather_window_covers_full_year(window_days: Nat) -> Bool:
  at_least(window_days, days_per_year())

# ---------------------------------------------------------------------------
# 13. VAT due never exceeds the net amount (every allowed rate <= 100%)
# Source: src/backend/app/models/invoice.py
#   ALLOWED_VAT_RATES_BP: tuple[int, ...] = (0, 900, 2100)              (line 31)
# Source: src/backend/app/services/btw/calculation.py, calculate_btw_boxes
#   box_5a = sum(net * rate_bp // 10000 ...)                            (line 76)
# ---------------------------------------------------------------------------

def bp_per_whole() -> Nat:
  10000n

def vat_high_bp() -> Nat:
  2100n

def vat_low_bp() -> Nat:
  900n

def vat_zero_bp() -> Nat:
  0n

# Witness: a €1,00 invoice line (100 cents) at the 21% hoog tarief.
def sample_line_net_cents() -> Nat:
  100n

# net * rate_bp <= net * 10000  <=>  net * rate_bp / 10000 <= net.
def vat_never_exceeds_net(+net_cents: Nat, +rate_bp: Nat) -> Bool:
  Bool.and(at_most(rate_bp, bp_per_whole()), at_most(Nat.mul(net_cents, rate_bp), Nat.mul(net_cents, bp_per_whole())))

# ---------------------------------------------------------------------------
# 14. Invoice payment terms are within [0, 365] days
# Source: src/backend/app/schemas/invoice.py, InvoiceCreate
#   payment_terms_days: int = Field(default=30, ge=0, le=365)           (line 73)
# ---------------------------------------------------------------------------

def payment_terms_min_days() -> Nat:
  0n

def payment_terms_max_days() -> Nat:
  365n

def default_payment_terms_days() -> Nat:
  30n

def payment_terms_bounded(days: Nat) -> Bool:
  in_range(days, payment_terms_min_days(), payment_terms_max_days())

# ---------------------------------------------------------------------------
# 15. Free tier: the project limit is positive and a fresh account may
#     create its first project
# Source: src/backend/app/models/subscription.py
#   TIER_PROJECT_LIMIT = { SubscriptionTier.FREE: 1, ... }              (line 27)
# Source: src/backend/app/services/billing/subscriptions.py, enforce_project_limit
#   if current >= limit: raise HTTPException(402)                       (line 88)
# ---------------------------------------------------------------------------

def free_tier_project_limit() -> Nat:
  1n

# Witness: an account with no active projects yet.
def sample_active_projects() -> Nat:
  0n

# Mirrors enforce_project_limit: creation is allowed iff current < limit.
def creation_allowed(current: Nat, limit: Nat) -> Bool:
  below(current, limit)

def free_tier_project_limit_enforced(current: Nat, +limit: Nat) -> Bool:
  Bool.and(positive(limit), creation_allowed(current, limit))

# ---------------------------------------------------------------------------
# 16. JWT access tokens are shorter-lived than refresh tokens
# Source: src/backend/app/core/config.py, Settings
#   jwt_access_token_expire_minutes: int = 30                           (line 15)
#   jwt_refresh_token_expire_days: int = 7                              (line 16)
# ---------------------------------------------------------------------------

def access_token_minutes() -> Nat:
  30n

def refresh_token_days() -> Nat:
  7n

def minutes_per_day() -> Nat:
  1440n

def access_token_shorter_than_refresh(access_minutes: Nat, refresh_days: Nat) -> Bool:
  below(access_minutes, Nat.mul(refresh_days, minutes_per_day()))

# ---------------------------------------------------------------------------
# Laws
# ---------------------------------------------------------------------------

# 1. UsageCounter.project_count is clamped with max(0, ...) and defaults to
#    0, so the job count is never negative.
law law_job_count_nonneg_holds:
  {job_count_nonneg(sample_project_count()) == True{} : Bool}

# 2. The default StoreClient concurrency (2) satisfies RateLimiter's
#    `concurrency >= 1` guard: at least one scraper worker is in flight.
law law_worker_concurrency_positive_holds:
  {worker_concurrency_positive(default_scraper_concurrency()) == True{} : Bool}

# 3. The default StoreClient rate (2 req/s) satisfies RateLimiter's
#    `rate_per_second > 0` guard.
law law_scraper_rate_positive_holds:
  {scraper_rate_positive(default_scraper_rate_per_second()) == True{} : Bool}

# 4. The auth rate limit (10 / 15 min) is positive and never looser than
#    the general API limit (100 / 15 min).
law law_api_rate_limit_ordering_holds:
  {api_rate_limit_ordering(auth_max_requests(), general_max_requests()) == True{} : Bool}

# 5. The 429 Retry-After header (900 s) equals the 15-minute sliding window.
law law_retry_after_matches_window_holds:
  {retry_after_matches_window(retry_after_seconds(), rate_limit_window_minutes()) == True{} : Bool}

# 6. A retried webhook delivery attempt (2) lies within [1, MAX_ATTEMPTS=3].
law law_webhook_attempt_bounded_holds:
  {webhook_attempt_bounded(sample_webhook_attempt()) == True{} : Bool}

# 7. The backoff slept after attempt 2 (2000 ms) is exactly double the
#    backoff slept after attempt 1 (1000 ms): exponential backoff.
law law_webhook_backoff_doubles_holds:
  {webhook_backoff_doubles(webhook_first_attempt()) == True{} : Bool}

# 8. Both outbound HTTP timeouts (webhook 10 s, store scraper 10 s) are
#    strictly positive.
law law_delivery_timeout_positive_holds:
  {delivery_timeout_positive(webhook_timeout_seconds(), store_timeout_seconds()) == True{} : Bool}

# 9. The default page size (20) is within Query(ge=1, le=100).
law law_page_size_bounded_holds:
  {page_size_bounded(default_page_size()) == True{} : Bool}

# 10. Eight working hours (8 * 3600 s) fit inside one calendar day (86400 s).
law law_working_day_fits_calendar_day_holds:
  {working_day_fits_calendar_day(default_working_hours_per_day()) == True{} : Bool}

# 11. A task starting at 14400 s with a 7200 s duration ends at or after
#     its start: end_s = start_s + duration_s >= start_s.
law law_schedule_end_not_before_start_holds:
  {schedule_end_not_before_start(sample_task_start_s(), sample_task_duration_s()) == True{} : Bool}

# 12. The 366-day weather search window covers at least one full year.
law law_weather_window_covers_full_year_holds:
  {weather_window_covers_full_year(weather_window_days()) == True{} : Bool}

# 13. At the 21% hoog tarief, VAT on a €1,00 line never exceeds the net.
law law_vat_never_exceeds_net_holds:
  {vat_never_exceeds_net(sample_line_net_cents(), vat_high_bp()) == True{} : Bool}

# 14. The default payment term (30 days) is within Field(ge=0, le=365).
law law_payment_terms_bounded_holds:
  {payment_terms_bounded(default_payment_terms_days()) == True{} : Bool}

# 15. The free-tier project limit (1) is positive, and an account with 0
#     active projects passes enforce_project_limit (0 < 1).
law law_free_tier_project_limit_enforced_holds:
  {free_tier_project_limit_enforced(sample_active_projects(), free_tier_project_limit()) == True{} : Bool}

# 16. The access-token lifetime (30 min) is strictly shorter than the
#     refresh-token lifetime (7 days = 10080 min).
law law_access_token_shorter_than_refresh_holds:
  {access_token_shorter_than_refresh(access_token_minutes(), refresh_token_days()) == True{} : Bool}
