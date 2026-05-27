"""Document storage service — save, retrieve, and version files on local filesystem."""

import os
import uuid
from datetime import UTC, datetime

from app.core.config import settings
from app.models.document import Document
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def save_document(
    file: UploadFile,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    category: str,
    description: str | None,
    db: AsyncSession,
) -> Document:
    """Save uploaded file to disk and create a DB record. Returns the new Document."""
    filename = file.filename or "unnamed"
    content = await file.read()
    size_bytes = len(content)
    content_type = file.content_type or "application/octet-stream"

    doc_id = uuid.uuid4()
    project_dir = os.path.join(settings.upload_dir, str(project_id))
    os.makedirs(project_dir, exist_ok=True)
    safe_filename = filename.replace("/", "_").replace("..", "_")
    storage_filename = f"{doc_id}_{safe_filename}"
    storage_path = os.path.join(str(project_id), storage_filename)
    full_path = os.path.join(settings.upload_dir, storage_path)

    with open(full_path, "wb") as f:
        f.write(content)

    doc = Document(
        id=doc_id,
        project_id=project_id,
        uploaded_by_id=user_id,
        filename=filename,
        storage_path=storage_path,
        content_type=content_type,
        size_bytes=size_bytes,
        category=category,
        version=1,
        parent_id=None,
        description=description,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def get_document_path(document_id: uuid.UUID, db: AsyncSession) -> str:
    """Return the absolute filesystem path for a document. Raises 404 if not found."""
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.deleted_at.is_(None),
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return os.path.join(settings.upload_dir, doc.storage_path)


async def create_new_version(
    document_id: uuid.UUID,
    file: UploadFile,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Document:
    """Upload a new file and link it as the next version of the given document."""
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.deleted_at.is_(None),
        )
    )
    parent = result.scalar_one_or_none()
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    filename = file.filename or parent.filename
    content = await file.read()
    size_bytes = len(content)
    content_type = file.content_type or parent.content_type

    doc_id = uuid.uuid4()
    project_dir = os.path.join(settings.upload_dir, str(parent.project_id))
    os.makedirs(project_dir, exist_ok=True)
    safe_filename = filename.replace("/", "_").replace("..", "_")
    storage_filename = f"{doc_id}_{safe_filename}"
    storage_path = os.path.join(str(parent.project_id), storage_filename)
    full_path = os.path.join(settings.upload_dir, storage_path)

    with open(full_path, "wb") as f:
        f.write(content)

    doc = Document(
        id=doc_id,
        project_id=parent.project_id,
        uploaded_by_id=user_id,
        filename=parent.filename,
        storage_path=storage_path,
        content_type=content_type,
        size_bytes=size_bytes,
        category=parent.category,
        version=parent.version + 1,
        parent_id=parent.id,
        description=parent.description,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def soft_delete_document(document_id: uuid.UUID, db: AsyncSession) -> None:
    """Soft-delete a document by setting deleted_at."""
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.deleted_at.is_(None),
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    doc.deleted_at = datetime.now(UTC)
    await db.commit()
