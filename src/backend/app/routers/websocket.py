"""WebSocket collaboration router — real-time project updates and presence."""

from __future__ import annotations

import logging
import uuid

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.websocket.manager import manager
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from fastapi.responses import JSONResponse
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()
logger = logging.getLogger(__name__)


async def _get_ws_user(token: str, db: AsyncSession) -> User | None:
    """Resolve a JWT token to a User for WebSocket auth (no HTTPException — close instead)."""
    try:
        payload = decode_token(token, expected_type="access")
    except (JWTError, ValueError):
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    return result.scalar_one_or_none()


@router.websocket("/{project_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """WebSocket endpoint for real-time project collaboration.

    Clients connect with a JWT token as a query parameter:
        ws://host/api/v1/ws/{project_id}?token=<access_token>

    After connecting, clients receive broadcast events whenever the project,
    its tasks, time entries, or schedule change.

    Event envelope:
        {"type": "<event_type>", "project_id": "<uuid>", "payload": {...}}

    Presence event on join/leave:
        {"type": "presence", "project_id": "<uuid>", "connected_users": [...]}
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = await _get_ws_user(token, db)
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    project_id_str = str(project_id)
    user_id_str = str(user.id)

    await manager.connect(websocket, project_id_str, user_id_str)

    # Announce presence to all connected clients on this project.
    await manager.broadcast(
        project_id_str,
        {
            "type": "presence",
            "project_id": project_id_str,
            "connected_users": manager.presence(project_id_str),
        },
    )

    try:
        while True:
            # Keep connection alive; clients may send pings or local events.
            data = await websocket.receive_text()
            logger.debug("ws recv project=%s user=%s data=%r", project_id_str, user_id_str, data[:200])
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, project_id_str, user_id_str)
        # Broadcast updated presence after disconnect.
        await manager.broadcast(
            project_id_str,
            {
                "type": "presence",
                "project_id": project_id_str,
                "connected_users": manager.presence(project_id_str),
            },
        )


@router.get("/{project_id}/presence")
async def get_presence(
    project_id: uuid.UUID,
    _user: User = Depends(get_current_user),
) -> JSONResponse:
    """Return the list of users currently connected to the project WebSocket."""
    project_id_str = str(project_id)
    return JSONResponse(
        {
            "project_id": project_id_str,
            "connected_users": manager.presence(project_id_str),
        }
    )
