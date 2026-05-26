"""Weather service — Open-Meteo client with TTL cache and risk assessment.

Uses the free Open-Meteo API (https://open-meteo.com) — no API key required.
Fetches 7-day hourly/daily forecast for a lat/lon and converts to WeatherDay objects.
Results are cached per (lat, lon) pair with a configurable TTL to avoid hammering
the external API.

Risk thresholds (construction context):
  rain   — precipitation_mm >= 5 mm/day
  wind   — wind_speed_kmh >= 40 km/h (max gusts)
  frost  — temp_min <= 0 °C
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

# Open-Meteo free API endpoint
_OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Risk thresholds
_RAIN_THRESHOLD_MM = 5.0
_WIND_THRESHOLD_KMH = 40.0
_FROST_THRESHOLD_C = 0.0

# Cache TTL in seconds (1 hour by default)
_CACHE_TTL_SECONDS = 3600


@dataclass
class WeatherDay:
    """Daily weather summary for a single day."""

    date: str  # ISO 8601 date string, e.g. "2024-06-01"
    temp_min: float  # °C
    temp_max: float  # °C
    precipitation_mm: float  # mm
    wind_speed_kmh: float  # km/h (daily max wind speed)
    weather_code: int  # WMO weather interpretation code
    description: str  # Human-readable description


@dataclass
class WeatherRisk:
    """A construction risk flagged on a specific day."""

    date: str  # ISO 8601
    risk_type: str  # "rain" | "wind" | "frost"
    severity: str  # "warning" | "danger"
    details: str  # Human-readable explanation


# WMO weather code descriptions (subset)
_WMO_DESCRIPTIONS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Icy fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight showers",
    81: "Moderate showers",
    82: "Violent showers",
    95: "Thunderstorm",
    99: "Thunderstorm with hail",
}


@dataclass
class _CacheEntry:
    value: list[WeatherDay]
    expires_at: float


class WeatherService:
    """Fetches 7-day forecast from Open-Meteo and assesses construction risks.

    Maintains an in-memory TTL cache keyed by (lat_rounded, lon_rounded) to
    avoid redundant API calls. Coordinates are rounded to 2 decimal places
    (~1 km precision) for cache key stability.
    """

    def __init__(self, cache_ttl: int = _CACHE_TTL_SECONDS) -> None:
        self._cache: dict[tuple[float, float], _CacheEntry] = {}
        self._cache_ttl = cache_ttl

    def _cache_key(self, lat: float, lon: float) -> tuple[float, float]:
        return (round(lat, 2), round(lon, 2))

    def _get_cached(self, key: tuple[float, float]) -> list[WeatherDay] | None:
        entry = self._cache.get(key)
        if entry and entry.expires_at > time.monotonic():
            return entry.value
        return None

    def _set_cached(self, key: tuple[float, float], value: list[WeatherDay]) -> None:
        self._cache[key] = _CacheEntry(value=value, expires_at=time.monotonic() + self._cache_ttl)

    async def _fetch_open_meteo(self, lat: float, lon: float) -> list[WeatherDay]:
        """Call Open-Meteo API and parse into WeatherDay list (live, not cached)."""
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": [
                "weather_code",
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "wind_speed_10m_max",
            ],
            "timezone": "Europe/Amsterdam",
            "forecast_days": 7,
        }
        async with httpx.AsyncClient(timeout=10.0) as http:
            response = await http.get(_OPEN_METEO_URL, params=params)
            response.raise_for_status()
            data = response.json()

        daily = data["daily"]
        days: list[WeatherDay] = []
        for i, date_str in enumerate(daily["time"]):
            code = daily["weather_code"][i]
            days.append(
                WeatherDay(
                    date=date_str,
                    temp_min=daily["temperature_2m_min"][i],
                    temp_max=daily["temperature_2m_max"][i],
                    precipitation_mm=daily["precipitation_sum"][i] or 0.0,
                    wind_speed_kmh=daily["wind_speed_10m_max"][i] or 0.0,
                    weather_code=code,
                    description=_WMO_DESCRIPTIONS.get(code, f"Code {code}"),
                )
            )
        return days

    async def get_forecast(self, lat: float, lon: float) -> list[WeatherDay]:
        """Return 7-day forecast, using cache when available."""
        key = self._cache_key(lat, lon)
        cached = self._get_cached(key)
        if cached is not None:
            return cached
        forecast = await self._fetch_open_meteo(lat, lon)
        self._set_cached(key, forecast)
        return forecast

    def assess_risks(self, forecast: list[WeatherDay]) -> list[WeatherRisk]:
        """Identify construction risk days in a forecast."""
        risks: list[WeatherRisk] = []
        for day in forecast:
            if day.precipitation_mm >= _RAIN_THRESHOLD_MM:
                severity = "danger" if day.precipitation_mm >= 20.0 else "warning"
                risks.append(
                    WeatherRisk(
                        date=day.date,
                        risk_type="rain",
                        severity=severity,
                        details=f"{day.precipitation_mm:.1f} mm neerslag verwacht",
                    )
                )
            if day.wind_speed_kmh >= _WIND_THRESHOLD_KMH:
                severity = "danger" if day.wind_speed_kmh >= 70.0 else "warning"
                risks.append(
                    WeatherRisk(
                        date=day.date,
                        risk_type="wind",
                        severity=severity,
                        details=f"Windstoten tot {day.wind_speed_kmh:.0f} km/h",
                    )
                )
            if day.temp_min <= _FROST_THRESHOLD_C:
                risks.append(
                    WeatherRisk(
                        date=day.date,
                        risk_type="frost",
                        severity="warning",
                        details=f"Minimumtemperatuur {day.temp_min:.1f} °C — vorst mogelijk",
                    )
                )
        return risks


# Module-level singleton — shared across requests
weather_service = WeatherService()
