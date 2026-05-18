"""foreman FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import RequestLoggingMiddleware, configure_logging
from app.routers import auth, projects, ai_planning, materials, financials, staff, payroll


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
    app.include_router(staff.router, prefix="/api/v1/staff", tags=["staff"])
    app.include_router(payroll.router, prefix="/api/v1/payroll", tags=["payroll"])

    @app.get("/healthz", tags=["health"])
    async def health_check() -> dict:
        return {"status": "ok", "service": "foreman"}

    return app


app = create_app()
