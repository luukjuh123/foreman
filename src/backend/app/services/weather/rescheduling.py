"""Weather-aware rescheduling service.

Identifies outdoor-sensitive tasks scheduled on bad-weather days and suggests
alternative dates by scanning the 7-day forecast for the next good day.

Outdoor-sensitive process types are defined as a simple constant list.
Task names are matched case-insensitively against the list.

Bad weather thresholds (construction context):
  rain   — precipitation_mm > 5 mm
  wind   — wind_speed_kmh > 40 km/h
  frost  — temp_min <= 2 °C
"""

from __future__ import annotations

from datetime import date

from app.services.weather.client import WeatherDay

# ---------------------------------------------------------------------------
# Outdoor-sensitive keyword list
# ---------------------------------------------------------------------------

# A task is outdoor-sensitive when its name contains any of these keywords
# (case-insensitive). These cover the most common outdoor construction processes
# in Dutch bouwbedrijven.
OUTDOOR_SENSITIVE_KEYWORDS: list[str] = [
    "dak",        # roofing (dakdekken, dakpannen, etc.)
    "schilder",   # painting (schilderwerk)
    "beton",      # concrete (betonvloer, beton storten)
    "stucco",     # stucco / plaster exterior
    "stuc",       # stucen / stucwerk
    "voeg",       # pointing / voegwerk
    "metsel",     # masonry / metselwerk
    "fundament",  # foundation work
    "grond",      # groundwork (grondwerk, grondverzet)
    "bestrating", # paving
    "asfalt",     # asphalt
    "riolering",  # drainage / sewer
    "gevel",      # facade work (gevelbekleding, gevelrenovatie)
    "isolatie",   # exterior insulation
    "kozijn",     # window/door frames (often outdoor install)
    "straat",     # street/road work
]

# Weather thresholds for rescheduling (slightly more lenient than risk thresholds
# in the weather client — we flag at ">5mm" rain, ">40 km/h" wind, "<=2°C" frost
# to give a slightly broader safety margin for scheduling purposes).
_RAIN_MM_THRESHOLD = 5.0
_WIND_KMH_THRESHOLD = 40.0
_FROST_C_THRESHOLD = 2.0


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def is_outdoor_sensitive(task_name: str) -> bool:
    """Return True if the task name matches any outdoor-sensitive keyword."""
    lower = task_name.lower()
    return any(kw in lower for kw in OUTDOOR_SENSITIVE_KEYWORDS)


def is_bad_weather(day: WeatherDay) -> bool:
    """Return True if the day has weather conditions unsuitable for outdoor work."""
    if day.precipitation_mm > _RAIN_MM_THRESHOLD:
        return True
    if day.wind_speed_kmh > _WIND_KMH_THRESHOLD:
        return True
    return day.temp_min <= _FROST_C_THRESHOLD


def weather_risk_type(day: WeatherDay) -> str:
    """Return the primary risk type for a bad-weather day."""
    if day.precipitation_mm > _RAIN_MM_THRESHOLD:
        return "rain"
    if day.wind_speed_kmh > _WIND_KMH_THRESHOLD:
        return "wind"
    return "frost"


def find_next_good_day(
    from_date: date,
    forecast_map: dict[str, WeatherDay],
    skip_dates: set[str],
) -> date | None:
    """Find the earliest date >= from_date in the forecast with good weather.

    Args:
        from_date: Start scanning from this date.
        forecast_map: Mapping of ISO date string → WeatherDay.
        skip_dates: Set of ISO date strings already occupied (to avoid double-booking).

    Returns the first good date, or None if no good day is found in the forecast.
    """
    # Scan all forecast dates in order
    sorted_dates = sorted(forecast_map.keys())
    for iso in sorted_dates:
        if iso < from_date.isoformat():
            continue
        if iso in skip_dates:
            continue
        if not is_bad_weather(forecast_map[iso]):
            return date.fromisoformat(iso)
    return None
