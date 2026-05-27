"""foreman FastAPI application factory."""

from app.core.config import settings
from app.core.logging import RequestLoggingMiddleware, configure_logging
from app.core.rate_limit_middleware import RateLimitMiddleware
from app.routers import (
    agenda,
    ai_planning,
    assignments,
    auth,
    billing,
    customers,
    financials,
    inbound,
    incidents,
    invoices,
    loans,
    materials,
    notifications,
    payroll,
    photos,
    portal,
    processes,
    projects,
    push,
    quotes,
    reports,
    reviews,
    staff,
    templates,
    time_tracking,
    voice,
    weather,
)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def create_app() -> FastAPI:
    configure_logging(settings.log_level)

    app = FastAPI(
        title="foreman API",
        version="0.1.0",
        description="AI-powered construction building planning platform",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
    app.include_router(ai_planning.router, prefix="/api/v1/planning", tags=["planning"])
    app.include_router(materials.router, prefix="/api/v1/materials", tags=["materials"])
    app.include_router(financials.router, prefix="/api/v1/financials", tags=["financials"])
    app.include_router(billing.router, prefix="/api/v1/billing", tags=["billing"])
    app.include_router(processes.router, prefix="/api/v1/processes", tags=["processes"])
    app.include_router(time_tracking.router, prefix="/api/v1/time", tags=["time-tracking"])
    app.include_router(photos.router, prefix="/api/v1/photos", tags=["photos"])
    app.include_router(push.router, prefix="/api/v1/push", tags=["push"])
    app.include_router(reviews.router, prefix="/api/v1/reviews", tags=["reviews"])
    app.include_router(agenda.router, prefix="/api/agenda", tags=["agenda"])
    app.include_router(assignments.router, prefix="/api/v1/assignments", tags=["assignments"])
    app.include_router(customers.router, tags=["customers"])
    app.include_router(inbound.router, prefix="/api/inbound", tags=["inbound"])
    app.include_router(invoices.router, prefix="/api/v1/invoices", tags=["invoices"])
    app.include_router(loans.router, prefix="/api/v1/loans", tags=["loans"])
    app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
    app.include_router(payroll.router, prefix="/api/v1/payroll", tags=["payroll"])
    app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
    app.include_router(incidents.router, prefix="/api/v1/incidents", tags=["incidents"])
    app.include_router(staff.router, prefix="/api/v1/staff", tags=["staff"])
    app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"])
    app.include_router(voice.router, prefix="/api/v1/voice", tags=["voice"])
    app.include_router(portal.router, prefix="/api/v1", tags=["portal"])
    app.include_router(quotes.router, prefix="/api/v1/quotes", tags=["quotes"])

    @app.get("/healthz", tags=["health"])
    async def health_check() -> dict:
        return {"status": "ok", "service": "foreman"}

    return app


app = create_app()
