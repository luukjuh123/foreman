# foreman invariant laws (LAWS.bend / PROOF.bend)

`LAWS.bend` (repo root) encodes 16 formal invariants of the foreman backend as
pure Bend 2 predicates over `Nat` values. Every constant in it mirrors one
literal shipped in `src/backend/app/`; every witness is a concrete value
from that domain (a default, a test fixture, or a fresh-record state).
`PROOF.bend` proves each law with a `def Laws.<name>` that the checker
accepts only by reducing the claimed predicate to `True{}`.

## Verify

```bash
cd /mnt/HC_Volume_105925743/luuk/galaxies/web/foreman
BEND_NO_TELEMETRY=1 /home/luuk/universe/.claude/tools/bend/bin/bend PROOF.bend
# -> All terms check.
```

A negative control (changing `auth_max_requests` to `1000n`) makes the
checker reject `law_api_rate_limit_ordering_holds` with
`expected: False{} / observed: True{}`, so the proofs are genuinely evaluated.

## Conventions

- Money is integer euro cents; VAT is integer basis points (10000 bp = 100%);
  time is integer seconds, minutes or milliseconds as noted. No floats.
- Python floats that are whole numbers (`2.0`, `10.0`, `1.0 s`) are modelled
  as the equivalent integer (`2n`, `10n`, `1000n` ms).
- **Drift gap:** Bend never reads the Python. If a cited literal changes, the
  matching `def` in `LAWS.bend` must change in the same commit.

## Inventory

| # | Law | What it encodes | Real source symbol | Witness values | Status |
|---|-----|-----------------|--------------------|----------------|--------|
| 1 | `law_job_count_nonneg_holds` | Job (project) count is never negative | `models/usage.py:16` `project_count ... default=0`; `services/billing/usage.py:21` `max(0, counter.project_count + delta)` | `count=0` (fresh `UsageCounter`) | proven |
| 2 | `law_worker_concurrency_positive_holds` | Scraper worker concurrency ≥ 1 | `services/stores/base.py:99` `if concurrency < 1: raise`; `base.py:134` `concurrency: int = 2` | `concurrency=2` | proven |
| 3 | `law_scraper_rate_positive_holds` | Scraper request rate > 0 | `services/stores/base.py:97` `if rate_per_second <= 0: raise`; `base.py:133` `rate_per_second: float = 2.0` | `rate=2` | proven |
| 4 | `law_api_rate_limit_ordering_holds` | Auth rate limit positive and ≤ general limit | `core/rate_limit_middleware.py:40-41` `max_requests=100` / `max_requests=10` | `auth=10, general=100` | proven |
| 5 | `law_retry_after_matches_window_holds` | 429 `Retry-After` equals the sliding window | `core/rate_limit_middleware.py:40-41` `window_seconds=15 * 60`; `:61` `"Retry-After": "900"` | `retry_after=900, window=15 min` | proven |
| 6 | `law_webhook_attempt_bounded_holds` | Delivery attempt ∈ [1, MAX_ATTEMPTS] | `services/webhooks/delivery.py:25` `MAX_ATTEMPTS = 3`; `:57` `range(1, MAX_ATTEMPTS + 1)`; `models/webhook.py:39` `attempt ... default=1` | `attempt=2` | proven |
| 7 | `law_webhook_backoff_doubles_holds` | Retry backoff is exponential (doubles) | `services/webhooks/delivery.py:26` `_BASE_BACKOFF_SECONDS = 1.0`; `:72,86` `sleep(base * 2 ** (attempt - 1))` | `attempt=1` → 1000 ms vs 2000 ms | proven |
| 8 | `law_delivery_timeout_positive_holds` | Outbound HTTP timeouts > 0 | `services/webhooks/delivery.py:24` `_TIMEOUT_SECONDS = 10`; `services/stores/base.py:136` `timeout_seconds: float = 10.0` | `webhook=10, store=10` | proven |
| 9 | `law_page_size_bounded_holds` | Pagination page size ∈ [1, 100] | `routers/projects.py:87` `per_page: int = Query(20, ge=1, le=100)` | `per_page=20` | proven |
| 10 | `law_working_day_fits_calendar_day_holds` | Scheduled working hours fit in a calendar day | `services/planning/scheduler.py:21-22` `_HOUR_S = 3_600`, `_DAY_S = 86_400`; `:103` `working_hours_per_day: int = 8` | `hours=8` → 28800 ≤ 86400 | proven |
| 11 | `law_schedule_end_not_before_start_holds` | Task duration never negative: `end_s = start_s + duration_s ≥ start_s` | `services/planning/scheduler.py:171` `start_s, end_s = earliest, earliest + duration_s` | `start=14400, duration=7200` (task "b" in `tests/backend/test_scheduler.py::test_simple_two_task_chain_respects_dependency`) | proven |
| 12 | `law_weather_window_covers_full_year_holds` | Outdoor-task weather search covers a full year | `services/planning/scheduler.py:161` `for _ in range(366)` | `window=366` ≥ 365 | proven |
| 13 | `law_vat_never_exceeds_net_holds` | Every allowed VAT rate ≤ 100%, so VAT due ≤ net | `models/invoice.py:31` `ALLOWED_VAT_RATES_BP = (0, 900, 2100)`; `services/btw/calculation.py:76` `net * rate_bp // 10000` | `net=100 cents, rate=2100 bp` | proven |
| 14 | `law_payment_terms_bounded_holds` | Invoice payment terms ∈ [0, 365] days | `schemas/invoice.py:73` `payment_terms_days: int = Field(default=30, ge=0, le=365)` | `days=30` | proven |
| 15 | `law_free_tier_project_limit_enforced_holds` | Free-tier limit positive; fresh account may create first project | `models/subscription.py:27` `SubscriptionTier.FREE: 1`; `services/billing/subscriptions.py:88` `if current >= limit: raise HTTPException(402)` | `current=0, limit=1` | proven |
| 16 | `law_access_token_shorter_than_refresh_holds` | JWT access lifetime < refresh lifetime | `core/config.py:15-16` `jwt_access_token_expire_minutes = 30`, `jwt_refresh_token_expire_days = 7` | `access=30 min, refresh=7 d` (10080 min) | proven |

All paths are relative to `src/backend/app/` unless noted.

## Proof method

Every law is a closed term: constants and witnesses are concrete `Nat`
literals, so each `def Laws.<name>` is reflexivity (`{==}`) once the checker
normalises the predicate. No induction is used. Variables consumed more than
once inside a predicate are marked `+` (Bend 2 affine-variable rule).
