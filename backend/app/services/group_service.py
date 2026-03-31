import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.calendar_group import CalendarGroup
from app.models.group_member import GroupMember, MemberRole
from app.models.user import User
from app.schemas.group import GroupCreate, GroupUpdate


async def check_group_limit(db: AsyncSession, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(func.count()).select_from(GroupMember).where(
            GroupMember.user_id == user_id,
            GroupMember.role == MemberRole.CREATOR,
        )
    )
    count = result.scalar_one()
    if count >= 3:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="日历组数量已达上限",
        )


async def get_member_role(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID
) -> MemberRole | None:
    result = await db.execute(
        select(GroupMember.role).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def create_group(
    db: AsyncSession, user: User, data: GroupCreate
) -> CalendarGroup:
    await check_group_limit(db, user.id)

    group = CalendarGroup(
        name=data.name,
        icon=data.icon,
        color=data.color,
        description=data.description,
        creator_id=user.id,
    )
    db.add(group)
    await db.flush()  # get group.id before creating member

    member = GroupMember(
        group_id=group.id,
        user_id=user.id,
        role=MemberRole.CREATOR,
    )
    db.add(member)
    await db.commit()
    await db.refresh(group)
    return group


async def get_user_groups(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    # Get groups with member counts and user's role
    member_count_subq = (
        select(GroupMember.group_id, func.count().label("member_count"))
        .group_by(GroupMember.group_id)
        .subquery()
    )

    result = await db.execute(
        select(CalendarGroup, GroupMember.role, member_count_subq.c.member_count)
        .join(GroupMember, GroupMember.group_id == CalendarGroup.id)
        .join(
            member_count_subq,
            member_count_subq.c.group_id == CalendarGroup.id,
        )
        .where(GroupMember.user_id == user_id)
        .order_by(CalendarGroup.created_at.desc())
    )

    rows = result.all()
    groups = []
    for group, role, member_count in rows:
        groups.append({
            "id": str(group.id),
            "name": group.name,
            "icon": group.icon,
            "color": group.color,
            "description": group.description,
            "invite_code": group.invite_code,
            "max_members": group.max_members,
            "member_count": member_count,
            "my_role": role.value,
            "created_at": group.created_at,
        })
    return groups


async def get_group_detail(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID
) -> dict:
    role = await get_member_role(db, group_id, user_id)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您不是该日历组成员",
        )

    result = await db.execute(
        select(CalendarGroup)
        .where(CalendarGroup.id == group_id)
        .options(selectinload(CalendarGroup.members).selectinload(GroupMember.user))
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="日历组不存在",
        )

    members = [
        {
            "user_id": str(m.user_id),
            "nickname": m.user.nickname,
            "avatar": m.user.avatar or "",
            "role": m.role.value,
        }
        for m in group.members
    ]

    return {
        "id": str(group.id),
        "name": group.name,
        "icon": group.icon,
        "color": group.color,
        "description": group.description,
        "invite_code": group.invite_code,
        "max_members": group.max_members,
        "member_count": len(group.members),
        "my_role": role.value,
        "created_at": group.created_at,
        "members": members,
    }


async def update_group(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    data: GroupUpdate,
) -> CalendarGroup:
    role = await get_member_role(db, group_id, user_id)
    if role not in (MemberRole.CREATOR, MemberRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限修改该日历组",
        )

    result = await db.execute(
        select(CalendarGroup).where(CalendarGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="日历组不存在",
        )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(group, field, value)

    await db.commit()
    await db.refresh(group)
    return group


async def delete_group(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    role = await get_member_role(db, group_id, user_id)
    if role != MemberRole.CREATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有创建者可以删除日历组",
        )

    result = await db.execute(
        select(CalendarGroup)
        .where(CalendarGroup.id == group_id)
        .options(
            selectinload(CalendarGroup.events),
            selectinload(CalendarGroup.members),
        )
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="日历组不存在",
        )

    for event in group.events:
        await db.delete(event)
    for member in group.members:
        await db.delete(member)
    await db.delete(group)
    await db.commit()


async def join_group(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    invite_code: str,
) -> None:
    result = await db.execute(
        select(CalendarGroup).where(CalendarGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="日历组不存在",
        )

    if group.invite_code != invite_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邀请码无效",
        )

    existing_role = await get_member_role(db, group_id, user_id)
    if existing_role is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="您已是该日历组成员",
        )

    count_result = await db.execute(
        select(func.count()).select_from(GroupMember).where(
            GroupMember.group_id == group_id
        )
    )
    member_count = count_result.scalar_one()
    if member_count >= group.max_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="日历组人数已满",
        )

    new_member = GroupMember(
        group_id=group_id,
        user_id=user_id,
        role=MemberRole.MEMBER,
    )
    db.add(new_member)
    await db.commit()


async def remove_member(
    db: AsyncSession,
    group_id: uuid.UUID,
    operator_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> None:
    # Get target member
    target_result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == target_user_id,
        )
    )
    target_member = target_result.scalar_one_or_none()
    if target_member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="成员不存在",
        )

    # Cannot remove CREATOR
    if target_member.role == MemberRole.CREATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无法移除创建者",
        )

    # Self-removal is always allowed
    if operator_id == target_user_id:
        await db.delete(target_member)
        await db.commit()
        return

    operator_role = await get_member_role(db, group_id, operator_id)

    # MEMBER cannot remove anyone
    if operator_role == MemberRole.MEMBER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限移除成员",
        )

    # ADMIN cannot remove another ADMIN
    if operator_role == MemberRole.ADMIN and target_member.role == MemberRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="管理员无法移除其他管理员",
        )

    await db.delete(target_member)
    await db.commit()
