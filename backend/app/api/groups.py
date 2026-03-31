import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.group_member import GroupMember
from app.models.user import User
from app.schemas.group import (
    GroupCreate,
    GroupDetailResponse,
    GroupResponse,
    GroupUpdate,
    JoinGroupRequest,
)
from app.services import group_service

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    data: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupResponse:
    group = await group_service.create_group(db, current_user, data)
    return GroupResponse(
        id=str(group.id),
        name=group.name,
        icon=group.icon,
        color=group.color,
        description=group.description,
        invite_code=group.invite_code,
        max_members=group.max_members,
        member_count=1,
        my_role="creator",
        created_at=group.created_at,
    )


@router.get("", response_model=list[GroupResponse])
async def list_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GroupResponse]:
    groups = await group_service.get_user_groups(db, current_user.id)
    return [GroupResponse(**g) for g in groups]


@router.get("/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupDetailResponse:
    detail = await group_service.get_group_detail(db, group_id, current_user.id)
    return GroupDetailResponse(**detail)


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: uuid.UUID,
    data: GroupUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupResponse:
    group = await group_service.update_group(db, group_id, current_user.id, data)
    role = await group_service.get_member_role(db, group_id, current_user.id)
    count_result = await db.execute(
        select(func.count()).select_from(GroupMember).where(
            GroupMember.group_id == group_id
        )
    )
    member_count = count_result.scalar_one()
    return GroupResponse(
        id=str(group.id),
        name=group.name,
        icon=group.icon,
        color=group.color,
        description=group.description,
        invite_code=group.invite_code,
        max_members=group.max_members,
        member_count=member_count,
        my_role=role.value,
        created_at=group.created_at,
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await group_service.delete_group(db, group_id, current_user.id)


@router.post("/{group_id}/join", status_code=status.HTTP_200_OK)
async def join_group(
    group_id: uuid.UUID,
    body: JoinGroupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await group_service.join_group(db, group_id, current_user.id, body.invite_code)
    return {"detail": "加入成功"}


@router.delete(
    "/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await group_service.remove_member(db, group_id, current_user.id, user_id)
