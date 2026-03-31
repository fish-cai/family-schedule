# Phase 1 核心 API 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现日历组 CRUD + 日程 CRUD + 权限控制的完整后端 API，包含 29 个测试用例。

**Architecture:** Service 层处理业务逻辑和权限校验，API 层薄路由调用 service。Pydantic schemas 负责请求验证和响应序列化。测试通过 AsyncClient 直接打 ASGI app，使用独立测试数据库。

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, PostgreSQL, pytest-asyncio, httpx

---

## Task 1: 日历组 Schemas

**Files:**
- Create: `backend/app/schemas/group.py`

- [ ] **Step 1: 创建 group schemas 文件**

```python
from datetime import datetime

from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    name: str = Field(max_length=64)
    icon: str = Field(default="", max_length=128)
    color: str = Field(default="#4A90D9", max_length=7)
    description: str = Field(default="", max_length=256)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=64)
    icon: str | None = Field(default=None, max_length=128)
    color: str | None = Field(default=None, max_length=7)
    description: str | None = Field(default=None, max_length=256)


class JoinGroupRequest(BaseModel):
    invite_code: str


class GroupMemberResponse(BaseModel):
    user_id: str
    nickname: str
    avatar: str
    role: str

    model_config = {"from_attributes": True}


class GroupResponse(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    description: str
    invite_code: str
    max_members: int
    member_count: int
    my_role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupDetailResponse(GroupResponse):
    members: list[GroupMemberResponse]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/group.py
git commit -m "feat: add calendar group Pydantic schemas"
```

---

## Task 2: 日程 Schemas

**Files:**
- Create: `backend/app/schemas/event.py`

- [ ] **Step 1: 创建 event schemas 文件**

```python
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.event import EventVisibility


class EventCreate(BaseModel):
    title: str = Field(max_length=128)
    description: str = Field(default="", max_length=1024)
    start_time: datetime
    end_time: datetime | None = None
    is_all_day: bool = False
    location: str = Field(default="", max_length=256)
    color: str = Field(default="", max_length=7)
    visibility: EventVisibility = EventVisibility.PUBLIC
    repeat_rule: dict | None = None
    group_id: str | None = None


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=1024)
    start_time: datetime | None = None
    end_time: datetime | None = None
    is_all_day: bool | None = None
    location: str | None = Field(default=None, max_length=256)
    color: str | None = Field(default=None, max_length=7)
    visibility: EventVisibility | None = None
    repeat_rule: dict | None = None


class EventResponse(BaseModel):
    id: str
    title: str
    description: str
    start_time: datetime
    end_time: datetime | None
    is_all_day: bool
    location: str
    color: str
    visibility: str
    repeat_rule: dict | None
    group_id: str | None
    creator_id: str
    creator_nickname: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/event.py
git commit -m "feat: add event Pydantic schemas"
```

---

## Task 3: 日历组 Service

**Files:**
- Create: `backend/app/services/group_service.py`

- [ ] **Step 1: 实现 group_service**

```python
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.calendar_group import CalendarGroup
from app.models.group_member import GroupMember, MemberRole
from app.models.user import User
from app.schemas.group import GroupCreate, GroupUpdate

MAX_GROUPS_PER_USER = 3


async def check_group_limit(db: AsyncSession, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(func.count())
        .select_from(GroupMember)
        .where(GroupMember.user_id == user_id, GroupMember.role == MemberRole.CREATOR)
    )
    count = result.scalar_one()
    if count >= MAX_GROUPS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="日历组数量已达上限",
        )


async def get_member_role(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID
) -> MemberRole | None:
    result = await db.execute(
        select(GroupMember.role).where(
            GroupMember.group_id == group_id, GroupMember.user_id == user_id
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
    await db.flush()
    member = GroupMember(
        group_id=group.id, user_id=user.id, role=MemberRole.CREATOR
    )
    db.add(member)
    await db.commit()
    await db.refresh(group)
    return group


async def get_user_groups(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(CalendarGroup, GroupMember.role)
        .join(GroupMember, GroupMember.group_id == CalendarGroup.id)
        .where(GroupMember.user_id == user_id)
    )
    rows = result.all()
    groups = []
    for group, role in rows:
        member_count_result = await db.execute(
            select(func.count())
            .select_from(GroupMember)
            .where(GroupMember.group_id == group.id)
        )
        member_count = member_count_result.scalar_one()
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
            detail="非组内成员",
        )
    result = await db.execute(
        select(CalendarGroup)
        .where(CalendarGroup.id == group_id)
        .options(selectinload(CalendarGroup.members))
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日历组不存在")
    members = []
    for m in group.members:
        user_result = await db.execute(
            select(User).where(User.id == m.user_id)
        )
        user = user_result.scalar_one()
        members.append({
            "user_id": str(m.user_id),
            "nickname": user.nickname,
            "avatar": user.avatar,
            "role": m.role.value,
        })
    member_count = len(members)
    return {
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
        "members": members,
    }


async def update_group(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID, data: GroupUpdate
) -> CalendarGroup:
    role = await get_member_role(db, group_id, user_id)
    if role not in (MemberRole.CREATOR, MemberRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限修改日历组",
        )
    result = await db.execute(
        select(CalendarGroup).where(CalendarGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日历组不存在")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(group, key, value)
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
            detail="仅创建者可解散日历组",
        )
    from app.models.event import Event

    await db.execute(
        select(Event).where(Event.group_id == group_id)
    )
    # Delete events in this group
    events_result = await db.execute(
        select(Event).where(Event.group_id == group_id)
    )
    for event in events_result.scalars().all():
        await db.delete(event)
    # Delete members
    members_result = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id)
    )
    for member in members_result.scalars().all():
        await db.delete(member)
    # Delete group
    result = await db.execute(
        select(CalendarGroup).where(CalendarGroup.id == group_id)
    )
    group = result.scalar_one()
    await db.delete(group)
    await db.commit()


async def join_group(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID, invite_code: str
) -> None:
    result = await db.execute(
        select(CalendarGroup).where(CalendarGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日历组不存在")
    if group.invite_code != invite_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="邀请码错误"
        )
    existing = await get_member_role(db, group_id, user_id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="已是该日历组成员"
        )
    member_count_result = await db.execute(
        select(func.count())
        .select_from(GroupMember)
        .where(GroupMember.group_id == group_id)
    )
    member_count = member_count_result.scalar_one()
    if member_count >= group.max_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="日历组人数已满"
        )
    member = GroupMember(
        group_id=group_id, user_id=user_id, role=MemberRole.MEMBER
    )
    db.add(member)
    await db.commit()


async def remove_member(
    db: AsyncSession,
    group_id: uuid.UUID,
    operator_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> None:
    target_role = await get_member_role(db, group_id, target_user_id)
    if target_role is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="该用户不是组内成员"
        )
    if target_role == MemberRole.CREATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="不能移除创建者"
        )
    # Self-removal: anyone can leave
    if operator_id == target_user_id:
        pass  # allowed
    else:
        operator_role = await get_member_role(db, group_id, operator_id)
        if operator_role == MemberRole.MEMBER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="无权限移除成员"
            )
        if operator_role == MemberRole.ADMIN and target_role == MemberRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="无权限移除管理员"
            )
    result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == target_user_id,
        )
    )
    member = result.scalar_one()
    await db.delete(member)
    await db.commit()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/group_service.py
git commit -m "feat: add calendar group service with permission checks"
```

---

## Task 4: 日历组 API 路由

**Files:**
- Create: `backend/app/api/groups.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 创建 groups 路由文件**

```python
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
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


@router.post("", response_model=GroupResponse, status_code=201)
async def create_group(
    data: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    groups = await group_service.get_user_groups(db, current_user.id)
    return [GroupResponse(**g) for g in groups]


@router.get("/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    detail = await group_service.get_group_detail(db, group_id, current_user.id)
    return GroupDetailResponse(**detail)


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: uuid.UUID,
    data: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await group_service.update_group(db, group_id, current_user.id, data)
    role = await group_service.get_member_role(db, group_id, current_user.id)
    from sqlalchemy import func, select
    from app.models.group_member import GroupMember
    count_result = await db.execute(
        select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group_id)
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


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await group_service.delete_group(db, group_id, current_user.id)


@router.post("/{group_id}/join", status_code=200)
async def join_group(
    group_id: uuid.UUID,
    data: JoinGroupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await group_service.join_group(db, group_id, current_user.id, data.invite_code)
    return {"detail": "加入成功"}


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await group_service.remove_member(db, group_id, current_user.id, user_id)
```

- [ ] **Step 2: 注册路由到 main.py**

在 `backend/app/main.py` 中添加:

```python
from app.api.groups import router as groups_router
# ... existing code ...
app.include_router(groups_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/groups.py backend/app/main.py
git commit -m "feat: add calendar group API routes"
```

---

## Task 5: 日历组测试 (16 个用例)

**Files:**
- Create: `backend/tests/test_groups.py`
- Modify: `backend/tests/conftest.py` (添加 helper fixtures)

- [ ] **Step 1: 在 conftest.py 添加认证 helper**

在 `backend/tests/conftest.py` 末尾添加:

```python
from app.core.security import create_access_token


def auth_header(openid: str) -> dict:
    token = create_access_token(data={"sub": openid})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def user_a(client):
    """Create user A and return (openid, headers)."""
    openid = "test_user_a"
    resp = await client.post("/api/users/login", json={"code": "user_a"})
    assert resp.status_code == 200
    headers = auth_header(openid)
    return openid, headers


@pytest.fixture
async def user_b(client):
    """Create user B and return (openid, headers)."""
    openid = "test_user_b"
    resp = await client.post("/api/users/login", json={"code": "user_b"})
    assert resp.status_code == 200
    headers = auth_header(openid)
    return openid, headers
```

注意：由于 `wechat_login` 中 openid 的生成逻辑是 `f"dev_{request.code}"`，所以 `user_a` 的 openid 应为 `"dev_user_a"`。修正:

```python
@pytest.fixture
async def user_a(client):
    """Create user A and return (openid, headers)."""
    openid = "dev_user_a"
    resp = await client.post("/api/users/login", json={"code": "user_a"})
    assert resp.status_code == 200
    headers = auth_header(openid)
    return openid, headers


@pytest.fixture
async def user_b(client):
    """Create user B and return (openid, headers)."""
    openid = "dev_user_b"
    resp = await client.post("/api/users/login", json={"code": "user_b"})
    assert resp.status_code == 200
    headers = auth_header(openid)
    return openid, headers
```

- [ ] **Step 2: 创建 test_groups.py**

```python
import pytest


async def test_create_group(client, user_a):
    openid, headers = user_a
    resp = await client.post(
        "/api/groups",
        json={"name": "我们家", "icon": "family", "color": "#4A90D9"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "我们家"
    assert data["my_role"] == "creator"
    assert data["member_count"] == 1
    assert "invite_code" in data


async def test_create_group_limit(client, user_a):
    openid, headers = user_a
    for i in range(3):
        resp = await client.post(
            "/api/groups", json={"name": f"组{i}"}, headers=headers
        )
        assert resp.status_code == 201
    resp = await client.post(
        "/api/groups", json={"name": "组3"}, headers=headers
    )
    assert resp.status_code == 403
    assert "上限" in resp.json()["detail"]


async def test_list_groups(client, user_a):
    openid, headers = user_a
    await client.post("/api/groups", json={"name": "组1"}, headers=headers)
    await client.post("/api/groups", json={"name": "组2"}, headers=headers)
    resp = await client.get("/api/groups", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_get_group_detail(client, user_a):
    openid, headers = user_a
    create_resp = await client.post(
        "/api/groups", json={"name": "详情组"}, headers=headers
    )
    group_id = create_resp.json()["id"]
    resp = await client.get(f"/api/groups/{group_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "详情组"
    assert len(data["members"]) == 1
    assert data["members"][0]["role"] == "creator"


async def test_get_group_not_member(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "私密组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    resp = await client.get(f"/api/groups/{group_id}", headers=headers_b)
    assert resp.status_code == 403


async def test_update_group(client, user_a):
    _, headers = user_a
    create_resp = await client.post(
        "/api/groups", json={"name": "旧名字"}, headers=headers
    )
    group_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/groups/{group_id}",
        json={"name": "新名字"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "新名字"


async def test_update_group_no_permission(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    resp = await client.put(
        f"/api/groups/{group_id}",
        json={"name": "改名"},
        headers=headers_b,
    )
    assert resp.status_code == 403


async def test_delete_group(client, user_a):
    _, headers = user_a
    create_resp = await client.post(
        "/api/groups", json={"name": "要删的组"}, headers=headers
    )
    group_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/groups/{group_id}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get("/api/groups", headers=headers)
    assert len(resp.json()) == 0


async def test_delete_group_not_creator(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    resp = await client.delete(f"/api/groups/{group_id}", headers=headers_b)
    assert resp.status_code == 403


async def test_join_group(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "开放组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]
    resp = await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    assert resp.status_code == 200
    detail_resp = await client.get(f"/api/groups/{group_id}", headers=headers_a)
    assert detail_resp.json()["member_count"] == 2


async def test_join_group_wrong_code(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": "WRONG1"},
        headers=headers_b,
    )
    assert resp.status_code == 400


async def test_join_group_already_member(client, user_a):
    _, headers = user_a
    create_resp = await client.post(
        "/api/groups", json={"name": "组"}, headers=headers
    )
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]
    resp = await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers,
    )
    assert resp.status_code == 409


async def test_join_group_full(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]
    # Manually set max_members to 1 via direct DB manipulation through another join attempt
    # Instead, we test with default max_members=10 by filling up the group
    # For simplicity, we'll test the logic by modifying the group's max_members in DB
    # Use a workaround: create group, then via the service layer set max to 1
    # Actually, the easiest approach is to test with the API as-is.
    # We'll need a helper to set max_members. For now, join user_b and check the count.
    # Better approach: patch the group's max_members after creation.

    # Get DB session and update max_members to 1
    from app.core.database import get_db as real_get_db
    from app.main import app
    from app.models.calendar_group import CalendarGroup
    from sqlalchemy import select

    # Use the test DB override
    async for db in app.dependency_overrides[real_get_db]():
        result = await db.execute(
            select(CalendarGroup).where(CalendarGroup.id == group_id)
        )
        group = result.scalar_one()
        group.max_members = 1
        await db.commit()

    resp = await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    assert resp.status_code == 403
    assert "已满" in resp.json()["detail"]


async def test_remove_member(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    # Get user_b's id
    me_resp = await client.get("/api/users/me", headers=headers_b)
    user_b_id = me_resp.json()["id"]
    resp = await client.delete(
        f"/api/groups/{group_id}/members/{user_b_id}", headers=headers_a
    )
    assert resp.status_code == 204


async def test_remove_self(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    me_resp = await client.get("/api/users/me", headers=headers_b)
    user_b_id = me_resp.json()["id"]
    resp = await client.delete(
        f"/api/groups/{group_id}/members/{user_b_id}", headers=headers_b
    )
    assert resp.status_code == 204


async def test_remove_creator(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "组"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    me_resp = await client.get("/api/users/me", headers=headers_a)
    user_a_id = me_resp.json()["id"]
    resp = await client.delete(
        f"/api/groups/{group_id}/members/{user_a_id}", headers=headers_b
    )
    assert resp.status_code == 403
```

- [ ] **Step 3: 运行测试验证**

```bash
cd backend && python -m pytest tests/test_groups.py -v
```

Expected: 全部 16 个测试 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_groups.py
git commit -m "test: add 16 calendar group tests"
```

---

## Task 6: 日程 Service

**Files:**
- Create: `backend/app/services/event_service.py`

- [ ] **Step 1: 实现 event_service**

```python
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event, EventVisibility
from app.models.group_member import GroupMember, MemberRole
from app.models.user import User
from app.schemas.event import EventCreate, EventUpdate
from app.services.group_service import get_member_role


async def create_event(
    db: AsyncSession, user: User, data: EventCreate
) -> Event:
    if data.group_id is not None:
        group_uuid = uuid.UUID(data.group_id)
        role = await get_member_role(db, group_uuid, user.id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="非组内成员，无法创建日程",
            )
    event = Event(
        title=data.title,
        description=data.description,
        start_time=data.start_time,
        end_time=data.end_time,
        is_all_day=data.is_all_day,
        location=data.location,
        color=data.color,
        visibility=data.visibility,
        repeat_rule=data.repeat_rule,
        group_id=uuid.UUID(data.group_id) if data.group_id else None,
        creator_id=user.id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


def apply_visibility_filter(
    events: list[Event], user_id: uuid.UUID
) -> list[dict]:
    result = []
    for event in events:
        creator_result = None  # will be populated by caller
        if event.creator_id == user_id:
            result.append(event)
        elif event.visibility == EventVisibility.PUBLIC:
            result.append(event)
        elif event.visibility == EventVisibility.BUSY:
            result.append(event)  # caller will mask fields
        # PRIVATE: skip
    return result


async def query_events(
    db: AsyncSession,
    user_id: uuid.UUID,
    start: datetime,
    end: datetime,
    group_id: uuid.UUID | None = None,
) -> list[dict]:
    if group_id is not None:
        role = await get_member_role(db, group_id, user_id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="非组内成员",
            )
        stmt = select(Event).where(
            Event.group_id == group_id,
            Event.start_time < end,
            Event.end_time > start if Event.end_time is not None else Event.start_time < end,
        )
    else:
        # Personal events + all group events for groups user belongs to
        user_group_ids_stmt = select(GroupMember.group_id).where(
            GroupMember.user_id == user_id
        )
        user_group_ids_result = await db.execute(user_group_ids_stmt)
        group_ids = [row[0] for row in user_group_ids_result.all()]

        conditions = [
            and_(Event.creator_id == user_id, Event.group_id.is_(None)),  # personal
        ]
        if group_ids:
            conditions.append(Event.group_id.in_(group_ids))  # group events

        from sqlalchemy import or_
        stmt = select(Event).where(
            or_(*conditions),
            Event.start_time < end,
        )
        # Also filter by start_time/end_time overlap
        # Events that overlap with [start, end): event.start < end AND (event.end > start OR event.end IS NULL)
        stmt = select(Event).where(
            or_(*conditions),
            Event.start_time < end,
            or_(Event.end_time > start, Event.end_time.is_(None)),
        )

    result = await db.execute(stmt.order_by(Event.start_time))
    events = result.scalars().all()

    # Apply visibility filter and build response dicts
    response = []
    for event in events:
        creator = await db.execute(
            select(User).where(User.id == event.creator_id)
        )
        creator_user = creator.scalar_one()

        if event.creator_id == user_id:
            response.append(_event_to_dict(event, creator_user.nickname))
        elif event.visibility == EventVisibility.PUBLIC:
            response.append(_event_to_dict(event, creator_user.nickname))
        elif event.visibility == EventVisibility.BUSY:
            response.append(_event_to_busy_dict(event))
        # PRIVATE: skip
    return response


async def get_event_detail(
    db: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID
) -> dict:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")

    # Check access
    if event.group_id is not None:
        role = await get_member_role(db, event.group_id, user_id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="非组内成员"
            )
        # Apply visibility
        if event.creator_id != user_id:
            if event.visibility == EventVisibility.PRIVATE:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="无权查看"
                )
            if event.visibility == EventVisibility.BUSY:
                return _event_to_busy_dict(event)
    else:
        if event.creator_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="无权查看"
            )

    creator = await db.execute(select(User).where(User.id == event.creator_id))
    creator_user = creator.scalar_one()
    return _event_to_dict(event, creator_user.nickname)


async def can_edit_event(
    db: AsyncSession, event: Event, user_id: uuid.UUID
) -> bool:
    if event.creator_id == user_id:
        return True
    if event.group_id is not None:
        role = await get_member_role(db, event.group_id, user_id)
        if role in (MemberRole.CREATOR, MemberRole.ADMIN):
            return True
    return False


async def update_event(
    db: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID, data: EventUpdate
) -> dict:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
    if not await can_edit_event(db, event, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="无权修改此日程"
        )
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)
    await db.commit()
    await db.refresh(event)
    creator = await db.execute(select(User).where(User.id == event.creator_id))
    creator_user = creator.scalar_one()
    return _event_to_dict(event, creator_user.nickname)


async def delete_event(
    db: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
    if not await can_edit_event(db, event, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="无权删除此日程"
        )
    await db.delete(event)
    await db.commit()


def _event_to_dict(event: Event, creator_nickname: str) -> dict:
    return {
        "id": str(event.id),
        "title": event.title,
        "description": event.description,
        "start_time": event.start_time.isoformat(),
        "end_time": event.end_time.isoformat() if event.end_time else None,
        "is_all_day": event.is_all_day,
        "location": event.location,
        "color": event.color,
        "visibility": event.visibility.value,
        "repeat_rule": event.repeat_rule,
        "group_id": str(event.group_id) if event.group_id else None,
        "creator_id": str(event.creator_id),
        "creator_nickname": creator_nickname,
        "created_at": event.created_at.isoformat(),
    }


def _event_to_busy_dict(event: Event) -> dict:
    return {
        "id": str(event.id),
        "title": "有安排",
        "description": "",
        "start_time": event.start_time.isoformat(),
        "end_time": event.end_time.isoformat() if event.end_time else None,
        "is_all_day": event.is_all_day,
        "location": "",
        "color": "",
        "visibility": "busy",
        "repeat_rule": None,
        "group_id": str(event.group_id) if event.group_id else None,
        "creator_id": str(event.creator_id),
        "creator_nickname": "",
        "created_at": event.created_at.isoformat(),
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/event_service.py
git commit -m "feat: add event service with visibility filtering"
```

---

## Task 7: 日程 API 路由

**Files:**
- Create: `backend/app/api/events.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 创建 events 路由文件**

```python
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.event import EventCreate, EventResponse, EventUpdate
from app.services import event_service

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("", response_model=EventResponse, status_code=201)
async def create_event(
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await event_service.create_event(db, current_user, data)
    from app.models.user import User as UserModel
    from sqlalchemy import select
    creator = await db.execute(select(UserModel).where(UserModel.id == event.creator_id))
    creator_user = creator.scalar_one()
    return event_service._event_to_dict(event, creator_user.nickname)


@router.get("", response_model=list[EventResponse])
async def query_events(
    start: datetime = Query(...),
    end: datetime = Query(...),
    group_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    events = await event_service.query_events(
        db, current_user.id, start, end, group_id
    )
    return events


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await event_service.get_event_detail(db, event_id, current_user.id)


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await event_service.update_event(db, event_id, current_user.id, data)


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await event_service.delete_event(db, event_id, current_user.id)
```

- [ ] **Step 2: 在 main.py 注册 events 路由**

```python
from app.api.events import router as events_router
# ...
app.include_router(events_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/events.py backend/app/main.py
git commit -m "feat: add event API routes"
```

---

## Task 8: 日程测试 (13 个用例)

**Files:**
- Create: `backend/tests/test_events.py`

- [ ] **Step 1: 创建 test_events.py**

```python
import pytest


async def _create_group(client, headers):
    resp = await client.post("/api/groups", json={"name": "测试组"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()


async def test_create_personal_event(client, user_a):
    _, headers = user_a
    resp = await client.post(
        "/api/events",
        json={
            "title": "个人日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "个人日程"
    assert data["group_id"] is None


async def test_create_group_event(client, user_a):
    _, headers = user_a
    group = await _create_group(client, headers)
    resp = await client.post(
        "/api/events",
        json={
            "title": "组内日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
            "group_id": group["id"],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["group_id"] == group["id"]


async def test_create_event_not_member(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    group = await _create_group(client, headers_a)
    resp = await client.post(
        "/api/events",
        json={
            "title": "非法日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "group_id": group["id"],
        },
        headers=headers_b,
    )
    assert resp.status_code == 403


async def test_query_events_date_range(client, user_a):
    _, headers = user_a
    await client.post(
        "/api/events",
        json={
            "title": "4月事件",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
        },
        headers=headers,
    )
    await client.post(
        "/api/events",
        json={
            "title": "5月事件",
            "start_time": "2026-05-01T09:00:00+08:00",
            "end_time": "2026-05-01T10:00:00+08:00",
        },
        headers=headers,
    )
    resp = await client.get(
        "/api/events",
        params={"start": "2026-04-01T00:00:00+08:00", "end": "2026-04-30T23:59:59+08:00"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "4月事件"


async def test_query_events_group_filter(client, user_a):
    _, headers = user_a
    group = await _create_group(client, headers)
    await client.post(
        "/api/events",
        json={
            "title": "组事件",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
            "group_id": group["id"],
        },
        headers=headers,
    )
    await client.post(
        "/api/events",
        json={
            "title": "个人事件",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
        },
        headers=headers,
    )
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group["id"],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "组事件"


async def test_query_events_visibility_public(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    group = await _create_group(client, headers_a)
    invite_code = group["invite_code"]
    await client.post(
        f"/api/groups/{group['id']}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    await client.post(
        "/api/events",
        json={
            "title": "公开日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
            "visibility": "public",
            "group_id": group["id"],
        },
        headers=headers_a,
    )
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group["id"],
        },
        headers=headers_b,
    )
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "公开日程"


async def test_query_events_visibility_busy(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    group = await _create_group(client, headers_a)
    await client.post(
        f"/api/groups/{group['id']}/join",
        json={"invite_code": group["invite_code"]},
        headers=headers_b,
    )
    await client.post(
        "/api/events",
        json={
            "title": "忙碌日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
            "visibility": "busy",
            "group_id": group["id"],
        },
        headers=headers_a,
    )
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group["id"],
        },
        headers=headers_b,
    )
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "有安排"
    assert data[0]["location"] == ""


async def test_query_events_visibility_private(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    group = await _create_group(client, headers_a)
    await client.post(
        f"/api/groups/{group['id']}/join",
        json={"invite_code": group["invite_code"]},
        headers=headers_b,
    )
    await client.post(
        "/api/events",
        json={
            "title": "私密日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
            "visibility": "private",
            "group_id": group["id"],
        },
        headers=headers_a,
    )
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group["id"],
        },
        headers=headers_b,
    )
    data = resp.json()
    assert len(data) == 0


async def test_get_event_detail(client, user_a):
    _, headers = user_a
    create_resp = await client.post(
        "/api/events",
        json={
            "title": "详情日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
        },
        headers=headers,
    )
    event_id = create_resp.json()["id"]
    resp = await client.get(f"/api/events/{event_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "详情日程"


async def test_update_event_creator(client, user_a):
    _, headers = user_a
    create_resp = await client.post(
        "/api/events",
        json={
            "title": "原标题",
            "start_time": "2026-04-01T09:00:00+08:00",
        },
        headers=headers,
    )
    event_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/events/{event_id}",
        json={"title": "新标题"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "新标题"


async def test_update_event_group_admin(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    group = await _create_group(client, headers_a)
    await client.post(
        f"/api/groups/{group['id']}/join",
        json={"invite_code": group["invite_code"]},
        headers=headers_b,
    )
    # user_b creates an event in the group
    create_resp = await client.post(
        "/api/events",
        json={
            "title": "成员日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "group_id": group["id"],
        },
        headers=headers_b,
    )
    event_id = create_resp.json()["id"]
    # user_a (creator of group) can edit it
    resp = await client.put(
        f"/api/events/{event_id}",
        json={"title": "管理员改的"},
        headers=headers_a,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "管理员改的"


async def test_update_event_no_permission(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    group = await _create_group(client, headers_a)
    await client.post(
        f"/api/groups/{group['id']}/join",
        json={"invite_code": group["invite_code"]},
        headers=headers_b,
    )
    # user_a creates event
    create_resp = await client.post(
        "/api/events",
        json={
            "title": "创建者日程",
            "start_time": "2026-04-01T09:00:00+08:00",
            "group_id": group["id"],
        },
        headers=headers_a,
    )
    event_id = create_resp.json()["id"]
    # user_b (member) tries to edit
    resp = await client.put(
        f"/api/events/{event_id}",
        json={"title": "偷改"},
        headers=headers_b,
    )
    assert resp.status_code == 403


async def test_delete_event(client, user_a):
    _, headers = user_a
    create_resp = await client.post(
        "/api/events",
        json={
            "title": "要删的",
            "start_time": "2026-04-01T09:00:00+08:00",
            "end_time": "2026-04-01T10:00:00+08:00",
        },
        headers=headers,
    )
    event_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/events/{event_id}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/events/{event_id}", headers=headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: 运行全部测试**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: 全部测试 PASS (包括 test_health, test_users, test_groups, test_events)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_events.py
git commit -m "test: add 13 event tests with visibility filtering"
```

---

## Task 9: 最终验证

- [ ] **Step 1: 运行完整测试套件**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: 全部 33 个测试 PASS (1 health + 3 users + 16 groups + 13 events)

- [ ] **Step 2: 启动 Docker 验证 Swagger**

```bash
docker-compose up -d
```

打开 http://localhost:8000/docs 确认所有新端点出现在 Swagger UI 中。

- [ ] **Step 3: 用 curl 做冒烟测试**

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/users/login -H 'Content-Type: application/json' -d '{"code":"test1"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create group
curl -s -X POST http://localhost:8000/api/groups -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"我们家","icon":"family"}'

# List groups
curl -s http://localhost:8000/api/groups -H "Authorization: Bearer $TOKEN"
```

Expected: 创建和列出日历组成功
