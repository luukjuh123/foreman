"""Weather service — fetches forecasts from Open-Meteo and assesses work risk."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal

import httpx
from app.core.config import settings
from app.schemas.weather import WeatherDay, WeatherForecastResponse

# WMO Weather interpretation codes → human-readable description
# Source: https://open-meteo.com/en/docs (WMO Weather Interpretation Codes table)
_WMO_DESCRIPTIONS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight showers",
    81: "Moderate showers",
    82: "Violent showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def assess_work_risk(
    precipitation_mm: float,
    wind_speed_kmh: float,
    temp_min_c: float,
) -> Literal["good", "moderate", "poor"]:
    """Return a work-risk assessment for one day based on weather values.

    Rules (poor beats moderate):
    - poor:     precipitation > 10mm  OR  wind > 60 km/h  OR  temp < -2°C
    - moderate: precipitation 2–10mm  OR  wind 40–60 km/h
    - good:     everything else
    """
    if precipitation_mm > 10.0 or wind_speed_kmh > 60.0 or temp_min_c < -2.0:
        return "poor"
    if precipitation_mm >= 2.0 or wind_speed_kmh >= 40.0:
        return "moderate"
    return "good"


class WeatherService:
    """Fetches 7-day forecasts from Open-Meteo and enriches them with work risk."""

    async def get_forecast(
        self,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> WeatherForecastResponse:
        lat = latitude if latitude is not None else settings.weather_default_latitude
        lon = longitude if longitude is not None else settings.weather_default_longitude

        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": ",".join(
                [
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                    "windspeed_10m_max",
                    "weathercode",
                ]
            ),
            "timezone": "Europe/Amsterdam",
            "forecast_days": 7,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.weather_api_base_url}/forecast",
                params=params,
            )
            response.raise_for_status()

        data = response.json()
        daily = data["daily"]

        days: list[WeatherDay] = []
        for i, day_str in enumerate(daily["time"]):
            temp_max = daily["temperature_2m_max"][i]
            temp_min = daily["temperature_2m_min"][i]
            precip = daily["precipitation_sum"][i] or 0.0
            wind = daily["windspeed_10m_max"][i] or 0.0
            code = daily["weathercode"][i]

            days.append(
                WeatherDay(
                    date=date.fromisoformat(day_str),
                    temp_max_c=temp_max,
                    temp_min_c=temp_min,
                    precipitation_mm=precip,
                    wind_speed_max_kmh=wind,
                    weather_code=code,
                    weather_description=_WMO_DESCRIPTIONS.get(code, "Unknown"),
                    work_risk=assess_work_risk(precip, wind, temp_min),
                )
            )

        return WeatherForecastResponse(
            latitude=data["latitude"],
            longitude=data["longitude"],
            days=days,
            fetched_at=datetime.now(UTC),
        )
