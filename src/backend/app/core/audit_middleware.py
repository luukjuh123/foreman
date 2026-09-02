from __future__ import annotations

import contextlib
import json
import re
import uuid
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_ENTITY_MAP: dict[str, str] = {
    "projects": "project", "planning": "planning", "materials": "material",
    "financials": "financial", "billing": "billing", "processes": "process",
    "time": "time_entry", "photos": "photo", "push": "push_subscription",
    "reviews": "review", "assignments": "assignment", "invoices": "invoice",
    "loans": "loan", "notifications": "notification", "payroll": "payroll",
    "reports": "report", "incidents": "incident", "staff": "staff",
    "voice": "voice", "subcontractors": "subcontractor",
}
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
_ACTION = {"POST": "create", "PUT": "update", "PATCH": "update", "DELETE": "delete"}


def _parse_user_id(headers: list[tuple[bytes, bytes]]) -> uuid.UUID | None:
    auth = next((v.decode() for k, v in headers if k.lower() == b"authorization"), None)
    if not auth or not auth.startswith("Bearer "):
        return None
    try:
        from app.core.security import decode_token
        raw = decode_token(auth[7:], expected_type="access").get("sub")
        return uuid.UUID(raw) if raw else None
    except Exception:
        return None


def _parse_entity_info(path: str) -> tuple[str | None, uuid.UUID | None]:
    parts = [p for p in path.split("/") if p]
    for i, part in enumerate(parts):
        if (entity_type := _ENTITY_MAP.get(part)) is not None:
            match = _UUID_RE.search("/".join(parts[i + 1:]))
            return entity_type, uuid.UUID(match.group()) if match else None
    return None, None


def _method_to_action(method: str) -> str:
    return _ACTION.get(method, method.lower())


def _safe_json(body: bytes) -> dict[str, Any] | None:
    try:
        return data if isinstance(data := (json.loads(body) if body else None), dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


def _get_session_factory(app: Any) -> Any | None:
    if (sf := getattr(getattr(app, "state", None), "audit_session_factory", None)) is not None:
        return sf
    try:
        from app.core.database import _get_session_factory as _default
        return _default()
    except Exception:
        return None


async def _fetch_entity_snapshot(sf: Any, entity_type: str, entity_id: uuid.UUID) -> dict[str, Any] | None:
    from sqlalchemy import inspect as sa_inspect, select
    try:
        from app.models.project import Project
    except ImportError:
        return None
    if (model := {"project": Project}.get(entity_type)) is None:
        return None
    try:
        async with sf() as db:
            if (obj := (await db.execute(select(model).where(model.id == entity_id))).scalar_one_or_none()) is None:
                return None
            _ser = lambda v: str(v) if isinstance(v, uuid.UUID) else v.isoformat() if hasattr(v, "isoformat") else v
            return {col.key: _ser(getattr(obj, col.key)) for col in sa_inspect(type(obj)).columns}
    except Exception:
        return None


async def _persist_audit_entry(
    sf: Any, user_id: uuid.UUID, action: str, entity_type: str,
    entity_id: uuid.UUID, before_data: dict[str, Any] | None,
    after_data: dict[str, Any] | None, ip_address: str | None,
) -> None:
    from app.models.audit_log import AuditLog
    try:
        async with sf() as db:
            db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type,
                            entity_id=entity_id, before_data=before_data,
                            after_data=after_data, ip_address=ip_address))
            await db.commit()
    except Exception as exc:
        import logging
        logging.getLogger("foreman.audit").warning("Audit persist failed: %s", exc)


class AuditLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        method, path = scope.get("method", ""), scope.get("path", "")
        if scope["type"] != "http" or method not in _WRITE_METHODS or "audit-log" in path:
            return await self.app(scope, receive, send)

        entity_type, entity_id = _parse_entity_info(path)
        user_id = _parse_user_id(list(scope.get("headers", []))) if entity_type else None
        sf = _get_session_factory(scope.get("app")) if user_id else None
        if not all((entity_type, user_id, sf)):
            return await self.app(scope, receive, send)

        action = _method_to_action(method)
        before_data = await _fetch_entity_snapshot(sf, entity_type, entity_id) if action in ("update", "delete") and entity_id else None

        body_parts: list[bytes] = []
        resp: dict[str, Any] = {"status": 200, "headers": []}

        async def intercept(message: Message) -> None:
            if message["type"] == "http.response.start":
                resp.update(status=message["status"], headers=list(message.get("headers", [])))
            elif message["type"] == "http.response.body":
                if chunk := message.get("body", b""):
                    body_parts.append(chunk)
                if not message.get("more_body", False):
                    await send({"type": "http.response.start", **resp})
                    await send({"type": "http.response.body", "body": b"".join(body_parts), "more_body": False})
            else:
                await send(message)

        await self.app(scope, receive, intercept)

        if not (200 <= resp["status"] < 300):
            return

        after_data = _safe_json(b"".join(body_parts)) if action in ("create", "update") else None
        if action == "create" and entity_id is None and after_data and "id" in after_data:
            with contextlib.suppress(ValueError, AttributeError):
                entity_id = uuid.UUID(str(after_data["id"]))

        if entity_id is not None:
            await _persist_audit_entry(
                sf, user_id, action, entity_type, entity_id, before_data, after_data,
                scope["client"][0] if scope.get("client") else None,
            )
