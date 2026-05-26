"""In-memory sliding-window rate limiter.

Provides per-key request throttling without external dependencies.
Keys are typically IP addresses or user identifiers extracted by the middleware.
"""

import time
from collections import defaultdict, deque


class RateLimiter:
    """Sliding-window rate limiter backed by in-memory deques.

    Thread-safety: single-process only (suitable for development and
    single-worker deployments). For multi-worker production use, back
    this with Redis.
    """

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def _evict_old(self, key: str) -> None:
        """Remove timestamps outside the current window."""
        cutoff = time.time() - self.window_seconds
        bucket = self._buckets[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()

    def is_allowed(self, key: str) -> bool:
        """Return True and record the request if within limit; False otherwise."""
        self._evict_old(key)
        bucket = self._buckets[key]
        if len(bucket) >= self.max_requests:
            return False
        bucket.append(time.time())
        return True

    def remaining(self, key: str) -> int:
        """Return the number of requests still allowed in the current window."""
        self._evict_old(key)
        used = len(self._buckets[key])
        return max(0, self.max_requests - used)


