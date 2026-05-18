"""Environment-driven configuration for foreman backend."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/foreman"

    # Security
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Google Business Profile
    google_business_access_token: str = ""

    # Store scraper
    scraper_rate_limit_delay_seconds: float = 1.0
    scraper_cache_ttl_seconds: int = 3600  # 1 hour

    # App
    debug: bool = False
    log_level: str = "INFO"


settings = Settings()
