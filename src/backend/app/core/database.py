"""SQLAlchemy async engine and session factory."""

from collections.abc import AsyncGenerator
from functools import lru_cache

from app.core.config import settings
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


@lru_cache(maxsize=1)
def _get_engine():
    return create_async_engine(settings.database_url, echo=settings.debug)


@lru_cache(maxsize=1)
def _get_session_factory():
    return async_sessionmaker(_get_engine(), expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _get_session_factory()() as session:
        yield session
