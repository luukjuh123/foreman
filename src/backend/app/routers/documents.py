"""Documents router — upload/download/versioning per project."""

import os
import uuid

from app.core.config import settings
from app.core.database import get_db
from app.models.document import Document
from app.models.project import Project
from app.routers.auth import get_current_user
from app.schemas.document import DocumentListResponse, DocumentResponse
from app.services.document_storage import (
    create_new_version,
    save_document,
    soft_delete_document,
)
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Two routers: one mounted under /api/v1/projects, one under /api/v1/documents
projects_router = APIRouter()
documents_router = APIRouter()


async def _get_project_for_user(project_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    proj = result.scalar_one_or_none()
    if proj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return proj


async def _get_doc_for_user(document_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Document:
    result = await db.execute(
        select(Document)
        .join(Project, Document.project_id == Project.id)
        .where(
            Document.id == document_id,
            Document.deleted_at.is_(None),
            Project.owner_id == user_id,
            Project.deleted_at.is_(None),
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


# ---------------------------------------------------------------------------
# Project-scoped: mounted at /api/v1/projects
# ---------------------------------------------------------------------------


@projects_router.post(
    "/{project_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    category: str = Form(default="other"),
    description: str | None = Form(default=None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """Upload a document to a project."""
    await _get_project_for_user(project_id, current_user.id, db)
    doc = await save_document(file, project_id, current_user.id, category, description, db)
    return DocumentResponse.model_validate(doc)


@projects_router.get("/{project_id}/documents", response_model=DocumentListResponse)
async def list_documents(
    project_id: uuid.UUID,
    category: str | None = Query(default=None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    """List documents for a project, filterable by category."""
    await _get_project_for_user(project_id, current_user.id, db)

    filters = [Document.project_id == project_id, Document.deleted_at.is_(None)]
    if category:
        filters.append(Document.category == category)

    count = (await db.execute(select(func.count()).select_from(Document).where(*filters))).scalar_one()

    rows = (
        (
            await db.execute(
                select(Document)
                .where(*filters)
                .order_by(Document.created_at.asc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )

    return DocumentListResponse(
        data=[DocumentResponse.model_validate(r) for r in rows],
        total=count,
        page=page,
        per_page=per_page,
    )


# ---------------------------------------------------------------------------
# Document-scoped: mounted at /api/v1/documents
# ---------------------------------------------------------------------------


@documents_router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """Get document metadata."""
    doc = await _get_doc_for_user(document_id, current_user.id, db)
    return DocumentResponse.model_validate(doc)


@documents_router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Download a document file."""
    doc = await _get_doc_for_user(document_id, current_user.id, db)

    full_path = os.path.join(settings.upload_dir, doc.storage_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    def _iter():
        with open(full_path, "rb") as f:
            yield from f

    return StreamingResponse(
        _iter(),
        media_type=doc.content_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@documents_router.post(
    "/{document_id}/versions",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_new_version(
    document_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """Upload a new version of an existing document."""
    await _get_doc_for_user(document_id, current_user.id, db)
    doc = await create_new_version(document_id, file, current_user.id, db)
    return DocumentResponse.model_validate(doc)


@documents_router.get("/{document_id}/versions", response_model=list[DocumentResponse])
async def list_versions(
    document_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentResponse]:
    """List all versions of a document (root + all descendants via parent_id chain)."""
    doc = await _get_doc_for_user(document_id, current_user.id, db)

    # Walk to root
    current = doc
    while current.parent_id is not None:
        r = await db.execute(select(Document).where(Document.id == current.parent_id))
        parent = r.scalar_one_or_none()
        if parent is None:
            break
        current = parent

    root_id = current.id

    # BFS to collect all docs in chain
    all_versions: list[Document] = []
    visited: set[uuid.UUID] = set()
    queue = [root_id]
    while queue:
        cid = queue.pop(0)
        if cid in visited:
            continue
        visited.add(cid)
        r = await db.execute(select(Document).where(Document.id == cid))
        d = r.scalar_one_or_none()
        if d:
            all_versions.append(d)
        children = (await db.execute(select(Document).where(Document.parent_id == cid))).scalars().all()
        for child in children:
            if child.id not in visited:
                queue.append(child.id)

    all_versions.sort(key=lambda x: x.version)
    return [DocumentResponse.model_validate(d) for d in all_versions]


@documents_router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete a document."""
    await _get_doc_for_user(document_id, current_user.id, db)
    await soft_delete_document(document_id, db)


# Convenience alias — main.py can reference documents.projects_router / documents_router
router = projects_router
