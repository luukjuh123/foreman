"""Rate limiting middleware for the foreman FastAPI application.

Two limits apply:
- Auth paths (/api/v1/auth/*): 10 requests per 15 minutes per IP.
- All other API paths: 100 requests per 15 minutes per IP.

The /healthz endpoint is exempt.

Rate limit keys are derived from the X-Forwarded-For header (first IP) or
the client host as fallback.
"""

from app.core.rate_limit import RateLimiter
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Paths exempt from rate limiting
_EXEMPT_PREFIXES = ("/healthz", "/api/docs", "/api/redoc", "/api/openapi.json")
_AUTH_PREFIX = "/api/v1/auth"


def _client_key(request: Request) -> str:
    """Extract the IP address to use as the rate limit key."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply per-IP sliding-window rate limits to API endpoints.

    Each instance holds its own RateLimiter state, so tests that call
    create_app() get fresh limiters with no cross-test bleed.
    """

    def __init__(self, app: object, **kwargs: object) -> None:
        super().__init__(app, **kwargs)  # type: ignore[arg-type]
        self._general = RateLimiter(max_requests=100, window_seconds=15 * 60)
        self._auth = RateLimiter(max_requests=10, window_seconds=15 * 60)

    async def dispatch(self, request: Request, call_next: object) -> Response:
        path = request.url.path

        # Exempt paths pass through unchanged
        if any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            return await call_next(request)  # type: ignore[arg-type]

        key = _client_key(request)

        limiter = self._auth if path.startswith(_AUTH_PREFIX) else self._general
        remaining = limiter.remaining(key)

        if not limiter.is_allowed(key):
            return JSONResponse(
                status_code=429,
                content={"detail": "Te veel verzoeken. Probeer het over een paar minuten opnieuw."},
                headers={
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": "900",
                },
            )

        response: Response = await call_next(request)  # type: ignore[arg-type]
        response.headers["X-RateLimit-Remaining"] = str(max(0, remaining - 1))
        return response
