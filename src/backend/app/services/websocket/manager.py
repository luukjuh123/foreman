"""In-process WebSocket connection manager for real-time collaboration."""

from __future__ import annotations

import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Tracks active WebSocket connections per project and handles broadcasts.

    In-process only — no external message broker. Suitable for single-instance
    deployments. Multi-instance setups would need Redis pub/sub in front of this.
    """

    def __init__(self) -> None:
        # project_id -> list of (websocket, user_id) tuples
        self._connections: dict[str, list[tuple[WebSocket, str]]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, project_id: str, user_id: str) -> None:
        """Accept the WebSocket and register it for the given project."""
        await websocket.accept()
        self._connections[project_id].append((websocket, user_id))
        logger.info("ws connect project=%s user=%s total=%d", project_id, user_id, self.connection_count(project_id))

    def disconnect(self, websocket: WebSocket, project_id: str, user_id: str) -> None:
        """Remove the connection from the registry."""
        conns = self._connections.get(project_id, [])
        self._connections[project_id] = [(ws, uid) for ws, uid in conns if ws is not websocket]
        remaining = self.connection_count(project_id)
        logger.info("ws disconnect project=%s user=%s remaining=%d", project_id, user_id, remaining)

    async def broadcast(self, project_id: str, message: dict) -> None:
        """Send a JSON message to all connections for a project.

        Dead connections are silently dropped.
        """
        text = json.dumps(message)
        dead: list[tuple[WebSocket, str]] = []
        for ws, uid in list(self._connections.get(project_id, [])):
            try:
                await ws.send_text(text)
            except Exception:
                logger.warning("ws dead connection project=%s user=%s", project_id, uid)
                dead.append((ws, uid))
        for ws, uid in dead:
            self.disconnect(ws, project_id, uid)

    def connection_count(self, project_id: str) -> int:
        """Number of active connections for a project."""
        return len(self._connections.get(project_id, []))

    def presence(self, project_id: str) -> list[str]:
        """Return list of user_ids currently connected to a project (deduplicated, ordered)."""
        seen: dict[str, None] = {}
        for _, uid in self._connections.get(project_id, []):
            seen[uid] = None
        return list(seen.keys())


# Singleton — shared across all requests in this process.
manager = ConnectionManager()
