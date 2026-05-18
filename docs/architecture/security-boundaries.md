# Security Boundaries — foreman

> Stub — populate after first implementation sprint.

## Trust Zones
- [ ] External (untrusted): browser clients, hardware store websites, OpenAI API
- [ ] Application boundary: FastAPI backend (JWT-verified requests only beyond /auth)
- [ ] Data store boundary: PostgreSQL (private network, no external access)

## Authentication Points
- [ ] POST /api/v1/auth/login → returns JWT access token (short-lived) + refresh token
- [ ] POST /api/v1/auth/register → creates user with bcrypt password hash
- [ ] All other /api/v1/* routes require `Authorization: Bearer <token>`
- [ ] Frontend stores token in memory / httpOnly cookie (not localStorage)

## Secrets Location
- [ ] `DATABASE_URL` — k8s secret, injected as env var
- [ ] `OPENAI_API_KEY` — k8s secret, injected as env var
- [ ] `JWT_SECRET_KEY` — k8s secret, 256-bit random, injected as env var
- [ ] No secrets in Docker image or repository

## External Exposure
- [ ] Frontend: public HTTPS (Tailscale or ingress)
- [ ] Backend: internal only — only accessible from frontend container via service mesh
- [ ] Database: cluster-internal only
