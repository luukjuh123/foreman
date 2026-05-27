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

    # Mollie (payment provider)
    mollie_api_key: str = ""
    mollie_webhook_secret: str = "change-me-in-production"

    # Trial period (days granted on free-tier signup)
    trial_period_days: int = 14

    # Weather (Open-Meteo — free, no API key needed)
    weather_api_base_url: str = "https://api.open-meteo.com/v1"
    weather_default_latitude: float = 52.3676  # Amsterdam
    weather_default_longitude: float = 4.9041

    # File uploads
    upload_dir: str = "uploads"

    # App
    debug: bool = False
    log_level: str = "INFO"

    # Web Push / VAPID
    # Non-empty defaults allow unit tests to exercise the push channel without
    # real VAPID credentials. Override in production via env vars.
    vapid_private_key: str = "test-vapid-private-key"
    vapid_public_key: str = "test-vapid-public-key"
    vapid_claim_email: str = "mailto:info@foreman.local"

    # Company / invoice issuer details (used for UBL & PDF invoice generation).
    company_name: str = "Foreman Bouw B.V."
    company_kvk: str = "00000000"
    company_vat_number: str = "NL000000000B00"
    company_address_line1: str = "Hoofdstraat 1"
    company_postal_code: str = "1011AA"
    company_city: str = "Amsterdam"
    company_country_code: str = "NL"
    company_email: str = "info@foreman.local"
    company_iban: str = "NL00BANK0000000000"


settings = Settings()
