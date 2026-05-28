"""Geofence utilities — Haversine distance calculation."""

from __future__ import annotations

import math

_EARTH_RADIUS_METERS = 6_371_000


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in metres between two GPS coordinates.

    Uses the Haversine formula.
    Source: https://en.wikipedia.org/wiki/Haversine_formula
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return _EARTH_RADIUS_METERS * c


def is_within_geofence(lat: float, lng: float, fence_lat: float, fence_lng: float, radius_meters: int) -> bool:
    """Return True if (lat, lng) is within radius_meters of the geofence centre."""
    return haversine_distance(lat, lng, fence_lat, fence_lng) <= radius_meters
