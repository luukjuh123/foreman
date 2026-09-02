"""Templates router — CRUD for project templates and instantiation."""

import json
import uuid

from app.core.database import get_db
from app.models.project import Phase, Project, Task
from app.models.template import ProjectTemplate
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.project import ProjectResponse
from app.schemas.template import (
    CreateFromTemplateRequest,
    FromProjectRequest,
    ProjectTemplateCreate,
    ProjectTemplateListResponse,
    ProjectTemplateResponse,
    ProjectTemplateUpdate,
    TemplatePhaseSchema,
    TemplateTaskSchema,
)
from app.routers.deps import apply_updates, get_or_404
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


def _serialize_structure(structure: list[TemplatePhaseSchema]) -> str:
    return json.dumps([p.model_dump() for p in structure])


def _deserialize_structure(raw: str) -> list[TemplatePhaseSchema]:
    data = json.loads(raw)
    return [TemplatePhaseSchema.model_validate(p) for p in data]


def _template_to_response(tmpl: ProjectTemplate) -> ProjectTemplateResponse:
    return ProjectTemplateResponse(
        **{k: getattr(tmpl, k) for k in ("id", "owner_id", "name", "description", "category", "created_at", "updated_at")},
        structure=_deserialize_structure(tmpl.structure),
    )


async def _get_template_or_404(
    template_id: uuid.UUID,
    owner_id: uuid.UUID,
    db: AsyncSession,
) -> ProjectTemplate:
    return await get_or_404(
        db, ProjectTemplate,
        ProjectTemplate.id == template_id, ProjectTemplate.owner_id == owner_id,
    )


@router.get("/", response_model=ProjectTemplateListResponse)
async def list_templates(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectTemplateListResponse:
    filters = [ProjectTemplate.owner_id == current_user.id, *([ProjectTemplate.category == category] if category is not None else [])]
    total = (await db.execute(select(func.count()).select_from(ProjectTemplate).where(*filters))).scalar_one()
    templates = (await db.execute(select(ProjectTemplate).where(*filters).offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return ProjectTemplateListResponse(data=[_template_to_response(t) for t in templates], total=total, page=page, per_page=per_page)


@router.post("/", response_model=ProjectTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: ProjectTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectTemplateResponse:
    tmpl = ProjectTemplate(owner_id=current_user.id, name=body.name, description=body.description, category=body.category, structure=_serialize_structure(body.structure))
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return _template_to_response(tmpl)


@router.post(
    "/from-project/{project_id}",
    response_model=ProjectTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_template_from_project(
    project_id: uuid.UUID,
    body: FromProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectTemplateResponse:
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.deleted_at.is_(None), Project.owner_id == current_user.id)
        .options(selectinload(Project.phases).selectinload(Phase.tasks))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    _pick = lambda obj, *ks: {k: getattr(obj, k) for k in ks}
    structure = [
        TemplatePhaseSchema(**_pick(ph, "name", "description", "order_index"),
            tasks=[TemplateTaskSchema(**_pick(t, "name", "description", "estimated_hours", "priority"))
                   for t in sorted(ph.tasks, key=lambda t: t.priority)])
        for ph in sorted(project.phases, key=lambda p: p.order_index)
    ]
    tmpl = ProjectTemplate(owner_id=current_user.id, name=body.name, description=body.description,
                           category=body.category, structure=_serialize_structure(structure))
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return _template_to_response(tmpl)


@router.get("/{template_id}", response_model=ProjectTemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectTemplateResponse:
    tmpl = await _get_template_or_404(template_id, current_user.id, db)
    return _template_to_response(tmpl)


@router.put("/{template_id}", response_model=ProjectTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    body: ProjectTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectTemplateResponse:
    tmpl = await _get_template_or_404(template_id, current_user.id, db)

    update_data = body.model_dump(exclude_unset=True)
    if "structure" in update_data:
        tmpl.structure = _serialize_structure(update_data.pop("structure"))
    for field, value in update_data.items():
        setattr(tmpl, field, value)

    await db.commit()
    await db.refresh(tmpl)
    return _template_to_response(tmpl)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    tmpl = await _get_template_or_404(template_id, current_user.id, db)
    await db.delete(tmpl)
    await db.commit()


@router.post(
    "/{template_id}/instantiate",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def instantiate_template(
    template_id: uuid.UUID,
    body: CreateFromTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    tmpl = await _get_template_or_404(template_id, current_user.id, db)
    structure = _deserialize_structure(tmpl.structure)

    project = Project(owner_id=current_user.id, name=body.project_name, start_date=body.start_date)
    db.add(project)
    await db.flush()

    for ps in structure:
        phase = Phase(project_id=project.id, name=ps.name, description=ps.description, order_index=ps.order_index)
        db.add(phase)
        await db.flush()
        for ts in ps.tasks:
            db.add(Task(phase_id=phase.id, name=ts.name, description=ts.description, estimated_hours=ts.estimated_hours, priority=ts.priority))

    await db.commit()
    return ProjectResponse.model_validate(
        (await db.execute(select(Project).where(Project.id == project.id).options(selectinload(Project.phases).selectinload(Phase.tasks)))).scalar_one()
    )
