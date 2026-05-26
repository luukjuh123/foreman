"""Documents router — upload/download contracts, permits, drawings per project with versioning."""

import contextlib
import os
import uuid

from app.core.config import settings
from app.core.database import get_db
from app.models.document import Document
from app.models.project import Project
from app.routers.auth import get_current_user
from app.schemas.document import DocumentUpdate, DocumentUploadResponse
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def _download_url(document_id: uuid.UUID) -> str:
    return f"/api/v1/documents/{document_id}/download"


def _to_response(doc: Document) -> DocumentUploadResponse:
    return DocumentUploadResponse(
        id=doc.id,
        project_id=doc.project_id,
        name=doc.name,
        description=doc.description,
        category=doc.category,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        storage_path=doc.storage_path,
        version=doc.version,
        uploaded_by_id=doc.uploaded_by_id,
        created_at=doc.created_at,
        download_url=_download_url(doc.id),
    )


async def _get_doc_or_404(document_id: uuid.UUID, db: AsyncSession) -> Document:
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


async def _get_project_or_404(project_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post(
    "/api/v1/projects/{project_id}/documents/",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["documents"],
)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    category: str = Form(default="other"),
    description: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: object = Depends(get_current_user),
) -> DocumentUploadResponse:
    """Upload a file to a project. If a document with the same name exists, a new version is created."""
    await _get_project_or_404(project_id, db)

    filename = file.filename or "unnamed"
    content = await file.read()
    size_bytes = len(content)
    mime_type = file.content_type or "application/octet-stream"

    # Determine next version number for this name+project
    version_result = await db.execute(
        select(func.max(Document.version)).where(
            Document.project_id == project_id,
            Document.name == filename,
        )
    )
    max_version = version_result.scalar_one_or_none()
    next_version = (max_version or 0) + 1

    # Store file on disk
    doc_id = uuid.uuid4()
    project_upload_dir = os.path.join(settings.upload_dir, str(project_id))
    os.makedirs(project_upload_dir, exist_ok=True)
    safe_filename = filename.replace("/", "_").replace("..", "_")
    storage_filename = f"{doc_id}_{safe_filename}"
    storage_path = os.path.join(str(project_id), storage_filename)
    full_path = os.path.join(settings.upload_dir, storage_path)

    with open(full_path, "wb") as f:
        f.write(content)

    doc = Document(
        id=doc_id,
        project_id=project_id,
        name=filename,
        description=description,
        category=category,
        mime_type=mime_type,
        size_bytes=size_bytes,
        storage_path=storage_path,
        version=next_version,
        uploaded_by_id=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _to_response(doc)


@router.get(
    "/api/v1/projects/{project_id}/documents/",
    response_model=list[DocumentUploadResponse],
    tags=["documents"],
)
async def list_documents(
    project_id: uuid.UUID,
    category: str | None = None,
    all_versions: bool = False,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[DocumentUploadResponse]:
    """List documents for a project. By default returns only the latest version of each document."""
    await _get_project_or_404(project_id, db)

    if all_versions:
        stmt = select(Document).where(Document.project_id == project_id)
        if category:
            stmt = stmt.where(Document.category == category)
        stmt = stmt.order_by(Document.name, Document.version)
        result = await db.execute(stmt)
        docs = list(result.scalars().all())
    else:
        # Subquery: max version per name+project
        subq = (
            select(Document.name, func.max(Document.version).label("max_version"))
            .where(Document.project_id == project_id)
            .group_by(Document.name)
            .subquery()
        )
        stmt = select(Document).join(
            subq,
            (Document.name == subq.c.name) & (Document.version == subq.c.max_version),
        ).where(Document.project_id == project_id)
        if category:
            stmt = stmt.where(Document.category == category)
        stmt = stmt.order_by(Document.name)
        result = await db.execute(stmt)
        docs = list(result.scalars().all())

    return [_to_response(doc) for doc in docs]


@router.get(
    "/api/v1/documents/{document_id}",
    response_model=DocumentUploadResponse,
    tags=["documents"],
)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> DocumentUploadResponse:
    """Get document metadata."""
    doc = await _get_doc_or_404(document_id, db)
    return _to_response(doc)


@router.get(
    "/api/v1/documents/{document_id}/download",
    tags=["documents"],
)
async def download_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> FileResponse:
    """Stream file download."""
    doc = await _get_doc_or_404(document_id, db)
    full_path = os.path.join(settings.upload_dir, doc.storage_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")
    return FileResponse(path=full_path, filename=doc.name, media_type=doc.mime_type)


@router.get(
    "/api/v1/documents/{document_id}/versions",
    response_model=list[DocumentUploadResponse],
    tags=["documents"],
)
async def list_document_versions(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[DocumentUploadResponse]:
    """List all versions of a document (by name + project_id)."""
    doc = await _get_doc_or_404(document_id, db)
    result = await db.execute(
        select(Document)
        .where(Document.project_id == doc.project_id, Document.name == doc.name)
        .order_by(Document.version)
    )
    docs = list(result.scalars().all())
    return [_to_response(d) for d in docs]


@router.patch(
    "/api/v1/documents/{document_id}",
    response_model=DocumentUploadResponse,
    tags=["documents"],
)
async def update_document(
    document_id: uuid.UUID,
    body: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> DocumentUploadResponse:
    """Update document metadata (name, description, category)."""
    doc = await _get_doc_or_404(document_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await db.commit()
    await db.refresh(doc)
    return _to_response(doc)


@router.delete(
    "/api/v1/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["documents"],
)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> None:
    """Delete a document and its stored file."""
    doc = await _get_doc_or_404(document_id, db)
    full_path = os.path.join(settings.upload_dir, doc.storage_path)
    await db.delete(doc)
    await db.commit()
    # Best-effort file removal — don't fail if already gone
    with contextlib.suppress(FileNotFoundError):
        os.remove(full_path)
