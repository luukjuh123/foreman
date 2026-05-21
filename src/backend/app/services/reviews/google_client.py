"""Google Business Profile client interface and live implementation.

The interface is intentionally small (read reviews + post a reply). Tests
inject a fake client via FastAPI's `Depends` override so we never hit the
real Google API.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx
from app.core.config import settings


@dataclass(frozen=True)
class GoogleReview:
    """A review as returned by the Google Business Profile API."""

    external_id: str
    author_name: str
    rating: int  # 1..5
    comment: str | None
    created_at_external: str | None  # ISO 8601 string from Google


class GoogleBusinessClient(ABC):
    """Abstract Google Business Profile client.

    Implementations must:
    - return [] for unknown locations rather than raising
    - never block longer than the configured timeout
    """

    @abstractmethod
    async def list_reviews(self, location_id: str) -> list[GoogleReview]:
        ...

    @abstractmethod
    async def reply_to_review(
        self, location_id: str, review_id: str, text: str
    ) -> None:
        ...


class LiveGoogleBusinessClient(GoogleBusinessClient):
    """Production client backed by the Google Business Profile REST API.

    The full Google API requires OAuth2 with a service account; we accept a
    pre-issued access token via settings to keep this module test-friendly.
    Endpoint shapes mirror:
      GET https://mybusiness.googleapis.com/v4/{location_id}/reviews
      PUT https://mybusiness.googleapis.com/v4/{location_id}/reviews/{rid}/reply
    """

    BASE_URL = "https://mybusiness.googleapis.com/v4"

    def __init__(self, access_token: str, timeout_s: float = 10.0) -> None:
        if not access_token:
            msg = "Google Business access token is required"
            raise ValueError(msg)
        self._access_token = access_token
        self._timeout_s = timeout_s

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    async def list_reviews(self, location_id: str) -> list[GoogleReview]:
        url = f"{self.BASE_URL}/{location_id}/reviews"
        async with httpx.AsyncClient(timeout=self._timeout_s) as client:
            resp = await client.get(url, headers=self._headers())
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        payload = resp.json()
        out: list[GoogleReview] = []
        for raw in payload.get("reviews", []):
            out.append(
                GoogleReview(
                    external_id=str(raw.get("reviewId") or raw.get("name") or ""),
                    author_name=(raw.get("reviewer") or {}).get(
                        "displayName", "Anonymous"
                    ),
                    rating=int(raw.get("starRating", 0) or 0),
                    comment=raw.get("comment"),
                    created_at_external=raw.get("createTime"),
                )
            )
        return out

    async def reply_to_review(
        self, location_id: str, review_id: str, text: str
    ) -> None:
        url = f"{self.BASE_URL}/{location_id}/reviews/{review_id}/reply"
        async with httpx.AsyncClient(timeout=self._timeout_s) as client:
            resp = await client.put(
                url, headers=self._headers(), json={"comment": text}
            )
        resp.raise_for_status()


def get_google_business_client() -> GoogleBusinessClient:
    """FastAPI dependency — overridden in tests with a fake client."""
    token = getattr(settings, "google_business_access_token", "") or ""
    return LiveGoogleBusinessClient(access_token=token or "missing-token")
