"""Audit log middleware — automatically captures write operations (POST/PUT/PATCH/DELETE).

Uses a pure ASGI middleware (not BaseHTTPMiddleware) to avoid the background-task
conflict that BaseHTTPMiddleware has with StaticPool sessions in tests.
"""

from __future__ import annotations

import contextlib
import json
import re
import uuid
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Map route prefix segment → entity_type label
_ENTITY_MAP: dict[str, str] = {
    "projects": "project",
    "planning": "planning",
    "materials": "material",
    "financials": "financial",
    "billing": "billing",
    "processes": "process",
    "time": "time_entry",
    "photos": "photo",
    "push": "push_subscription",
    "reviews": "review",
    "assignments": "assignment",
    "invoices": "invoice",
    "loans": "loan",
    "notifications": "notification",
    "payroll": "payroll",
    "reports": "report",
    "incidents": "incident",
    "staff": "staff",
    "voice": "voice",
    "subcontractors": "subcontractor",
}

_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)


def _parse_user_id(headers: list[tuple[bytes, bytes]]) -> uuid.UUID | None:
    for k, v in headers:
        if k.lower() == b"authorization":
            auth = v.decode()
            if not auth.startswith("Bearer "):
                return None
            token = auth[7:]
            try:
                from app.core.security import decode_token

                payload = decode_token(token, expected_type="access")
                raw = payload.get("sub")
                return uuid.UUID(raw) if raw else None
            except Exception:
                return None
    return None


def _parse_entity_info(path: str) -> tuple[str | None, uuid.UUID | None]:
    parts = [p for p in path.split("/") if p]
    for i, part in enumerate(parts):
        if part in _ENTITY_MAP:
            entity_type = _ENTITY_MAP[part]
            remaining = "/".join(parts[i + 1 :])
            match = _UUID_RE.search(remaining)
            entity_id = uuid.UUID(match.group()) if match else None
            return entity_type, entity_id
    return None, None


def _method_to_action(method: str) -> str:
    return {"POST": "create", "PUT": "update", "PATCH": "update", "DELETE": "delete"}.get(method, method.lower())


def _safe_json(body: bytes) -> dict[str, Any] | None:
    if not body:
        return None
    try:
        data = json.loads(body)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


def _get_session_factory(app: Any) -> Any | None:
    """Resolve session factory: prefer app.state override (used in tests)."""
    sf = getattr(getattr(app, "state", None), "audit_session_factory", None)
    if sf is not None:
        return sf
    try:
        from app.core.database import _get_session_factory as _default
        return _default()
    except Exception:
        return None


async def _fetch_entity_snapshot(sf: Any, entity_type: str, entity_id: uuid.UUID) -> dict[str, Any] | None:
    """Fetch a shallow snapshot of an entity row before mutation."""
    from sqlalchemy import inspect as sa_inspect, select

    model_map: dict[str, Any] = {}
    try:
        from app.models.project import Project
        model_map["project"] = Project
    except ImportError:
        pass

    model = model_map.get(entity_type)
    if model is None:
        return None
    try:
        async with sf() as db:
            obj = (await db.execute(select(model).where(model.id == entity_id))).scalar_one_or_none()
            if obj is None:
                return None
            mapper = sa_inspect(type(obj))
            return {
                col.key: str(v) if isinstance(v := getattr(obj, col.key), uuid.UUID)
                else v.isoformat() if hasattr(v, "isoformat") else v
                for col in mapper.columns
            }
    except Exception:
        return None


async def _persist_audit_entry(
    sf: Any,
    user_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    before_data: dict[str, Any] | None,
    after_data: dict[str, Any] | None,
    ip_address: str | None,
) -> None:
    """Write an AuditLog row using a fresh session."""
    from app.models.audit_log import AuditLog

    try:
        async with sf() as db:
            entry = AuditLog(
                user_id=user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                before_data=before_data,
                after_data=after_data,
                ip_address=ip_address,
            )
            db.add(entry)
            await db.commit()
    except Exception as exc:
        import logging

        logging.getLogger("foreman.audit").warning("Audit persist failed: %s", exc)


class AuditLogMiddleware:
    """Pure ASGI middleware that captures write operations and persists AuditLog entries.

    Uses raw ASGI (not BaseHTTPMiddleware) to avoid the background-task issue
    that causes SQLite StaticPool session conflicts in tests.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        method, path = scope.get("method", ""), scope.get("path", "")

        # Fast-path: skip non-HTTP, non-write methods, audit-log endpoints, or unresolvable entities/users
        if scope["type"] != "http" or method not in _WRITE_METHODS or "audit-log" in path:
            await self.app(scope, receive, send)
            return

        entity_type, entity_id = _parse_entity_info(path)
        user_id = _parse_user_id(list(scope.get("headers", []))) if entity_type else None
        sf = _get_session_factory(scope.get("app")) if user_id else None
        if not all((entity_type, user_id, sf)):
            await self.app(scope, receive, send)
            return

        action = _method_to_action(method)

        # Capture before-state for update/delete
        before_data: dict[str, Any] | None = None
        if action in ("update", "delete") and entity_id is not None:
            before_data = await _fetch_entity_snapshot(sf, entity_type, entity_id)

        # Buffer response body to extract after-state and entity_id (for creates)
        response_body_parts: list[bytes] = []
        status_code = 200
        response_headers: list[tuple[bytes, bytes]] = []
        response_started = False

        async def send_interceptor(message: Message) -> None:
            nonlocal response_started, status_code, response_headers
            if message["type"] == "http.response.start":
                status_code = message["status"]
                response_headers = list(message.get("headers", []))
                response_started = True
                # Hold off forwarding until we have the full body
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"")
                if chunk:
                    response_body_parts.append(chunk)
                if not message.get("more_body", False):
                    # Complete body received — forward start + body
                    await send(
                        {
                            "type": "http.response.start",
                            "status": status_code,
                            "headers": response_headers,
                        }
                    )
                    await send(
                        {
                            "type": "http.response.body",
                            "body": b"".join(response_body_parts),
                            "more_body": False,
                        }
                    )
            else:
                await send(message)

        await self.app(scope, receive, send_interceptor)

        response_body = b"".join(response_body_parts)
        if not (200 <= status_code < 300):
            return

        after_data = _safe_json(response_body) if action in ("create", "update") else None
        if action == "create" and entity_id is None and after_data and "id" in after_data:
            with contextlib.suppress(ValueError, AttributeError):
                entity_id = uuid.UUID(str(after_data["id"]))

        if entity_id is None:
            return

        ip_address = scope["client"][0] if scope.get("client") else None

        await _persist_audit_entry(
            sf=sf,
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_data=before_data,
            after_data=after_data,
            ip_address=ip_address,
        )
