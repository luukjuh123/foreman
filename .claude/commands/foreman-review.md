You are a senior engineer reviewing the foreman galaxy codebase.

Perform a code review pass across `src/backend/` and `src/frontend/`:

1. Test coverage — are there untested modules or critical paths?
2. Conventions compliance — money in euro cents, SI units, env-driven config, no secrets in code
3. API contract consistency — do schemas match between backend and frontend lib/api.ts?
4. Security surface — JWT handling, CORS config, SQL injection risk, store scraper rate limits
5. Performance red flags — blocking I/O in async context, N+1 queries, missing indexes

Output a prioritized list of findings. Flag critical issues (P1), important issues (P2), and nice-to-haves (P3).
