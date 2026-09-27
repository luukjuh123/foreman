# PROOF.bend -- proofs of every law in LAWS.bend (Bend 2.0.20).
#
#   BEND_NO_TELEMETRY=1 /home/luuk/universe/.claude/tools/bend/bin/bend PROOF.bend
#
# prints "All terms check." and exits 0 only when every `law` in LAWS.bend has
# a `def Laws.<name>` here that the checker accepts. Every law below is a
# closed term: both the shipped constants and the witness values are
# concrete Nat literals, so each proof is reflexivity (`{==}`) after the
# checker reduces the predicate call -- no induction is required. See
# LAWS.bend's header for what each constant and witness mirrors in the
# Python source, and docs/laws.md for the full inventory.
# No `main` is defined on purpose: with a `main`, bend prints its normal
# form instead of "All terms check.".

import Base
import ./LAWS.bend as Laws

# 1. UsageCounter.project_count (0 on a fresh counter) is >= 0.
def Laws.law_job_count_nonneg_holds():
  {==}

# 2. Default StoreClient concurrency (2) is >= 1.
def Laws.law_worker_concurrency_positive_holds():
  {==}

# 3. Default StoreClient rate_per_second (2) is > 0.
def Laws.law_scraper_rate_positive_holds():
  {==}

# 4. Auth max_requests (10) is positive and <= general max_requests (100).
def Laws.law_api_rate_limit_ordering_holds():
  {==}

# 5. Retry-After (900 s) == 15 min * 60 s.
def Laws.law_retry_after_matches_window_holds():
  {==}

# 6. Webhook attempt 2 is within [1, MAX_ATTEMPTS=3].
def Laws.law_webhook_attempt_bounded_holds():
  {==}

# 7. backoff_ms(2) = 1000 * 2^1 = 2000 == 2 * backoff_ms(1) = 2 * 1000.
def Laws.law_webhook_backoff_doubles_holds():
  {==}

# 8. Webhook timeout (10 s) and store timeout (10 s) are both > 0.
def Laws.law_delivery_timeout_positive_holds():
  {==}

# 9. Default per_page (20) is within [1, 100].
def Laws.law_page_size_bounded_holds():
  {==}

# 10. 8 * 3600 = 28800 <= 86400.
def Laws.law_working_day_fits_calendar_day_holds():
  {==}

# 11. 14400 + 7200 = 21600 >= 14400.
def Laws.law_schedule_end_not_before_start_holds():
  {==}

# 12. Weather window (366 days) >= 365 days.
def Laws.law_weather_window_covers_full_year_holds():
  {==}

# 13. 2100 <= 10000 and 100 * 2100 = 210000 <= 100 * 10000 = 1000000.
def Laws.law_vat_never_exceeds_net_holds():
  {==}

# 14. Default payment_terms_days (30) is within [0, 365].
def Laws.law_payment_terms_bounded_holds():
  {==}

# 15. Free-tier limit (1) is positive and 0 active projects < 1.
def Laws.law_free_tier_project_limit_enforced_holds():
  {==}

# 16. Access token (30 min) < refresh token (7 * 1440 = 10080 min).
def Laws.law_access_token_shorter_than_refresh_holds():
  {==}
