"""Documents router — upload/download contracts, permits, drawings per project with versioning."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import settings
from app.core.database import get_db
from app.models.document import Document, DocumentCategory
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.document import DocumentListResponse, DocumentResponse
from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
VALID_CATEGORIES = {c.value for c in DocumentCategory}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_project_owned(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.deleted_at.is_(None)))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project


async def _get_document_or_404(
    project_id: uuid.UUID, document_id: uuid.UUID, db: AsyncSession
) -> Document:
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.project_id == project_id,
            Document.deleted_at.is_(None),
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


def _storage_path(project_id: uuid.UUID, filename: str) -> Path:
    base = Path(settings.document_storage_path)
    return base / str(project_id) / filename


async def _next_version(project_id: uuid.UUID, filename: str, db: AsyncSession) -> int:
    """Return next version number for a filename within a project."""
    result = await db.execute(
        select(func.max(Document.version)).where(
            Document.project_id == project_id,
            Document.filename == filename,
            Document.deleted_at.is_(None),
        )
    )
    max_version = result.scalar_one_or_none()
    return (max_version or 0) + 1


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{project_id}/documents/",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile,
    category: str = Form(default="other"),
    description: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    await _get_project_owned(project_id, user, db)

    if category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"category must be one of {sorted(VALID_CATEGORIES)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )

    filename = file.filename or "unnamed"
    content_type = file.content_type or "application/octet-stream"

    version = await _next_version(project_id, filename, db)

    doc_id = uuid.uuid4()
    # Store as {project_id}/{filename} — versions share path, each overwrite is intentional
    # Use doc_id prefix to keep all versions on disk
    rel_path = Path(str(project_id)) / f"v{version}_{doc_id}_{filename}"
    abs_path = Path(settings.document_storage_path) / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(content)

    doc = Document(
        id=doc_id,
        project_id=project_id,
        uploaded_by=user.id,
        filename=filename,
        content_type=content_type,
        file_size_bytes=len(content),
        category=category,
        version=version,
        storage_path=str(rel_path),
        description=description,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.get("/{project_id}/documents/", response_model=DocumentListResponse)
async def list_documents(
    project_id: uuid.UUID,
    category: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    await _get_project_owned(project_id, user, db)

    base_filter = [Document.project_id == project_id, Document.deleted_at.is_(None)]
    if category:
        if category not in VALID_CATEGORIES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"category must be one of {sorted(VALID_CATEGORIES)}",
            )
        base_filter.append(Document.category == category)

    count_result = await db.execute(
        select(func.count()).select_from(Document).where(*base_filter)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(Document)
        .where(*base_filter)
        .order_by(Document.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    docs = result.scalars().all()

    return DocumentListResponse(
        items=[DocumentResponse.model_validate(d) for d in docs],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{project_id}/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    await _get_project_owned(project_id, user, db)
    doc = await _get_document_or_404(project_id, document_id, db)
    return DocumentResponse.model_validate(doc)


@router.get("/{project_id}/documents/{document_id}/download")
async def download_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await _get_project_owned(project_id, user, db)
    doc = await _get_document_or_404(project_id, document_id, db)

    abs_path = Path(settings.document_storage_path) / doc.storage_path
    if not abs_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    def _iter():
        with open(abs_path, "rb") as f:
            yield from iter(lambda: f.read(65536), b"")

    return StreamingResponse(
        _iter(),
        media_type=doc.content_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@router.delete("/{project_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _get_project_owned(project_id, user, db)
    doc = await _get_document_or_404(project_id, document_id, db)
    doc.deleted_at = datetime.now(UTC)
    await db.commit()
