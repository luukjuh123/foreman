"""foreman FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import RequestLoggingMiddleware, configure_logging
from app.routers import (
    auth,
    billing,
    projects,
    ai_planning,
    materials,
    financials,
    processes,
    push,
    time_tracking,
    photos,
    push,
    reviews,
)


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
    app.include_router(time_tracking.router, prefix="/api/v1/time-tracking", tags=["time-tracking"])
    app.include_router(photos.router, prefix="/api/v1/photos", tags=["photos"])
    app.include_router(push.router, prefix="/api/v1/push", tags=["push"])
    app.include_router(reviews.router, prefix="/api/v1/reviews", tags=["reviews"])
    app.include_router(push.router, prefix="/api/v1/push", tags=["push"])

    @app.get("/healthz", tags=["health"])
    async def health_check() -> dict:
        return {"status": "ok", "service": "foreman"}

    return app


app = create_app()
