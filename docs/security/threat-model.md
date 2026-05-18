# Threat Model — foreman

> Stub — Aegis will populate this during the new galaxy security review.

## Trust Boundaries
- Browser ↔ Next.js frontend (HTTPS, public)
- Next.js frontend ↔ FastAPI backend (internal service, JWT)
- FastAPI backend ↔ PostgreSQL (private network)
- FastAPI backend ↔ Hardware store websites (outbound scraping)
- FastAPI backend ↔ OpenAI API (outbound API, sensitive project data)

## Assets
| Asset | Sensitivity | Location |
|-------|-------------|----------|
| User credentials (hashed) | High | PostgreSQL |
| Project financial data | High | PostgreSQL |
| JWT secret key | Critical | k8s secret |
| OpenAI API key | High | k8s secret |
| Store scraper sessions | Low | Memory/cache |

## Threats
| ID | Threat | Likelihood | Impact | Mitigation |
|----|--------|------------|--------|------------|
| T1 | JWT token theft via XSS | Medium | High | httpOnly cookies, CSP headers |
| T2 | SQL injection | Low | Critical | SQLAlchemy ORM parameterized queries |
| T3 | Scraper IP ban | Medium | Medium | Rate limiting, rotating user agents |
| T4 | Project data sent to OpenAI | Medium | Medium | PII stripping before LLM calls; document in privacy policy |
| T5 | Over-budget data manipulation | Low | High | Server-side validation; budget values never trusted from client |

## Open Risks
- Privacy implications of sending construction project details to OpenAI API — needs data processing agreement review
- Store scraper legality — Hornbach/Gamma/Praxis ToS must be reviewed before production
