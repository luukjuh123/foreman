"""Documents router — upload/download contracts, permits, drawings per project with versioning."""

from __future__ import annotations

import mimetypes
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import settings
from app.core.database import get_db
from app.models.document import Document
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.document import DocumentListResponse, DocumentResponse, DocumentUpdate
from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

VALID_CATEGORIES = {"contract", "permit", "drawing", "other"}


async def _get_project_owned(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project


async def _get_document_owned(document_id: uuid.UUID, user: User, db: AsyncSession) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.deleted_at.is_(None))
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    # Verify ownership via the project
    await _get_project_owned(doc.project_id, user, db)
    return doc


def _storage_dir(project_id: uuid.UUID) -> Path:
    base = Path(settings.document_storage_path)
    return base / str(project_id)


def _storage_path(project_id: uuid.UUID, document_id: uuid.UUID, filename: str) -> Path:
    return _storage_dir(project_id) / f"{document_id}_{filename}"


async def _save_file(upload: UploadFile, path: Path) -> int:
    """Save uploaded file to disk, return file size in bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    content = await upload.read()
    path.write_bytes(content)
    return len(content)


@router.post(
    "/projects/{project_id}/documents",
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
            detail=f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}",
        )

    filename = file.filename or "unnamed"
    mime_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    doc_id = uuid.uuid4()
    path = _storage_path(project_id, doc_id, filename)

    size_bytes = await _save_file(file, path)

    doc = Document(
        id=doc_id,
        project_id=project_id,
        uploaded_by=user.id,
        name=filename,
        description=description,
        category=category,
        mime_type=mime_type,
        size_bytes=size_bytes,
        storage_path=str(path),
        version=1,
        parent_id=None,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.get(
    "/projects/{project_id}/documents",
    response_model=DocumentListResponse,
)
async def list_documents(
    project_id: uuid.UUID,
    category: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    await _get_project_owned(project_id, user, db)

    query = select(Document).where(
        Document.project_id == project_id,
        Document.deleted_at.is_(None),
    )
    if category is not None:
        query = query.where(Document.category == category)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    docs_result = await db.execute(query.order_by(Document.created_at).offset(offset).limit(limit))
    docs = list(docs_result.scalars().all())

    return DocumentListResponse(
        items=[DocumentResponse.model_validate(d) for d in docs],
        total=total,
    )


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    doc = await _get_document_owned(document_id, user, db)
    return DocumentResponse.model_validate(doc)


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    doc = await _get_document_owned(document_id, user, db)

    path = Path(doc.storage_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    def _iter_file():
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _iter_file(),
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.name}"'},
    )


@router.put("/documents/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: uuid.UUID,
    body: DocumentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    doc = await _get_document_owned(document_id, user, db)

    if body.category is not None and body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}",
        )

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)

    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.post(
    "/documents/{document_id}/versions",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_new_version(
    document_id: uuid.UUID,
    file: UploadFile,
    description: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    # Get the root/parent document (must not be a child version itself)
    original = await _get_document_owned(document_id, user, db)

    # Find the latest version in this chain to determine next version number
    versions_result = await db.execute(
        select(Document).where(
            (Document.id == document_id) | (Document.parent_id == document_id),
            Document.deleted_at.is_(None),
        )
    )
    all_versions = list(versions_result.scalars().all())
    next_version = max(v.version for v in all_versions) + 1

    filename = file.filename or "unnamed"
    mime_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    new_doc_id = uuid.uuid4()
    path = _storage_path(original.project_id, new_doc_id, filename)

    size_bytes = await _save_file(file, path)

    new_doc = Document(
        id=new_doc_id,
        project_id=original.project_id,
        uploaded_by=user.id,
        name=filename,
        description=description,
        category=original.category,  # inherit from parent
        mime_type=mime_type,
        size_bytes=size_bytes,
        storage_path=str(path),
        version=next_version,
        parent_id=document_id,
    )
    db.add(new_doc)
    await db.commit()
    await db.refresh(new_doc)
    return DocumentResponse.model_validate(new_doc)


@router.get("/documents/{document_id}/versions", response_model=list[DocumentResponse])
async def list_versions(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentResponse]:
    await _get_document_owned(document_id, user, db)

    result = await db.execute(
        select(Document).where(
            (Document.id == document_id) | (Document.parent_id == document_id),
            Document.deleted_at.is_(None),
        ).order_by(Document.version)
    )
    docs = list(result.scalars().all())
    return [DocumentResponse.model_validate(d) for d in docs]


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    doc = await _get_document_owned(document_id, user, db)
    doc.deleted_at = datetime.now(UTC)
    await db.commit()
