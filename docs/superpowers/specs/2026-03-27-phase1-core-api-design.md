# Phase 1：后端核心 API 设计

> 版本：v1.0 | 日期：2026-03-27
> 基于产品设计文档 P0 功能定义

---

## 一、范围

实现日历组 CRUD + 日程 CRUD + 权限控制的完整后端 API。

### 包含

- 日历组的创建、查询、更新、解散
- 日历组成员的加入、移除
- 日程的创建、查询（时间范围+日历组筛选）、更新、删除
- 权限矩阵（创建者/管理员/成员）
- 日程三级可见性控制（public/busy/private）
- 免费版限制校验（3 个日历组，每组 10 人）

### 不包含

- 前端 UI、AI 语音、微信推送、分享功能、日程模板、空闲时间匹配

---

## 二、API 端点设计

### 2.1 日历组 API

**`POST /api/groups`** — 创建日历组

请求体：
```json
{
  "name": "我们家",
  "icon": "family",
  "color": "#4A90D9",
  "description": "家庭日历"
}
```

响应 201：
```json
{
  "id": "uuid",
  "name": "我们家",
  "icon": "family",
  "color": "#4A90D9",
  "description": "家庭日历",
  "invite_code": "ABC123",
  "max_members": 10,
  "member_count": 1,
  "my_role": "creator",
  "created_at": "2026-03-27T10:00:00Z"
}
```

业务规则：
- 创建者自动添加为 creator 角色的 GroupMember
- 免费版用户最多创建 3 个日历组（以 creator 身份计数）
- 超出限制返回 403 `{"detail": "日历组数量已达上限"}`

---

**`GET /api/groups`** — 获取我的日历组列表

响应 200：
```json
[
  {
    "id": "uuid",
    "name": "我们家",
    "icon": "family",
    "color": "#4A90D9",
    "description": "家庭日历",
    "invite_code": "ABC123",
    "max_members": 10,
    "member_count": 3,
    "my_role": "creator",
    "created_at": "2026-03-27T10:00:00Z"
  }
]
```

返回当前用户作为成员的所有日历组。

---

**`GET /api/groups/{group_id}`** — 日历组详情

响应 200：
```json
{
  "id": "uuid",
  "name": "我们家",
  "icon": "family",
  "color": "#4A90D9",
  "description": "家庭日历",
  "invite_code": "ABC123",
  "max_members": 10,
  "member_count": 3,
  "my_role": "admin",
  "created_at": "2026-03-27T10:00:00Z",
  "members": [
    {"user_id": "uuid", "nickname": "小明妈妈", "avatar": "", "role": "creator"},
    {"user_id": "uuid", "nickname": "小明爸爸", "avatar": "", "role": "admin"},
    {"user_id": "uuid", "nickname": "奶奶", "avatar": "", "role": "member"}
  ]
}
```

权限：仅组内成员可查看。非成员返回 403。

---

**`PUT /api/groups/{group_id}`** — 更新日历组

请求体（所有字段可选）：
```json
{
  "name": "新名字",
  "icon": "new_icon",
  "color": "#FF5733",
  "description": "新描述"
}
```

权限：creator 和 admin 可操作。member 返回 403。

---

**`DELETE /api/groups/{group_id}`** — 解散日历组

权限：仅 creator 可操作。同时删除所有 GroupMember 记录和组内日程。

---

**`POST /api/groups/{group_id}/join`** — 加入日历组

请求体：
```json
{
  "invite_code": "ABC123"
}
```

业务规则：
- invite_code 必须匹配
- 已是成员则返回 409
- 组内人数达到 max_members 则返回 403
- 新成员角色为 member

---

**`DELETE /api/groups/{group_id}/members/{user_id}`** — 移除成员

权限：
- creator/admin 可移除 member
- creator 可移除 admin
- 不能移除 creator
- 成员可移除自己（退出日历组）

---

### 2.2 日程 API

**`POST /api/events`** — 创建日程

请求体：
```json
{
  "title": "接小明放学",
  "description": "",
  "start_time": "2026-03-28T15:00:00+08:00",
  "end_time": "2026-03-28T15:30:00+08:00",
  "is_all_day": false,
  "location": "学校门口",
  "color": "#4A90D9",
  "visibility": "public",
  "repeat_rule": null,
  "group_id": "uuid 或 null"
}
```

业务规则：
- group_id 为 null 时创建个人日程
- group_id 非 null 时，需验证用户是该组成员
- creator_id 自动设为当前用户

---

**`GET /api/events`** — 查询日程

查询参数：
- `start` (必填): ISO 时间，范围起始
- `end` (必填): ISO 时间，范围结束
- `group_id` (可选): 筛选特定日历组，不传则返回个人日程 + 所有所属日历组的日程

可见性过滤逻辑：
- 自己创建的日程：始终可见完整信息
- 他人创建的组内日程：
  - visibility=public → 显示完整信息
  - visibility=busy → 仅返回时间段，title 替换为"有安排"，其他字段隐藏
  - visibility=private → 不返回

响应 200：
```json
[
  {
    "id": "uuid",
    "title": "接小明放学",
    "description": "",
    "start_time": "2026-03-28T15:00:00+08:00",
    "end_time": "2026-03-28T15:30:00+08:00",
    "is_all_day": false,
    "location": "学校门口",
    "color": "#4A90D9",
    "visibility": "public",
    "repeat_rule": null,
    "group_id": "uuid",
    "creator_id": "uuid",
    "creator_nickname": "小明妈妈",
    "created_at": "2026-03-27T10:00:00Z"
  }
]
```

---

**`GET /api/events/{event_id}`** — 日程详情

权限：
- 个人日程：仅创建者可查看
- 组内日程：组内成员可查看（遵循可见性规则）

---

**`PUT /api/events/{event_id}`** — 更新日程

权限：
- 个人日程：仅创建者
- 组内日程：创建者 + 组 admin/creator

请求体同创建，所有字段可选。

---

**`DELETE /api/events/{event_id}`** — 删除日程

权限：同更新。

---

## 三、Pydantic Schemas

### 3.1 日历组

```python
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

class GroupMemberResponse(BaseModel):
    user_id: str
    nickname: str
    avatar: str
    role: str

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

class GroupDetailResponse(GroupResponse):
    members: list[GroupMemberResponse]

class JoinGroupRequest(BaseModel):
    invite_code: str
```

### 3.2 日程

```python
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
    group_id: str | None = None

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

class EventQuery(BaseModel):
    start: datetime
    end: datetime
    group_id: str | None = None
```

---

## 四、Service 层设计

### 4.1 group_service.py

| 函数 | 说明 |
|------|------|
| `create_group(db, user, data)` | 创建组 + 自动添加 creator 成员 |
| `get_user_groups(db, user_id)` | 获取用户所属所有组（含 member_count 和 my_role） |
| `get_group_detail(db, group_id, user_id)` | 组详情含成员列表，校验成员身份 |
| `update_group(db, group_id, user_id, data)` | 更新组，校验 admin+ 权限 |
| `delete_group(db, group_id, user_id)` | 解散组，校验 creator 权限，级联删除 |
| `join_group(db, group_id, user_id, invite_code)` | 加入组，校验邀请码+人数 |
| `remove_member(db, group_id, user_id, target_user_id)` | 移除成员，校验权限 |
| `get_member_role(db, group_id, user_id)` | 辅助：查询用户在组内角色 |
| `check_group_limit(db, user_id)` | 辅助：检查用户创建的组数是否达上限 |

### 4.2 event_service.py

| 函数 | 说明 |
|------|------|
| `create_event(db, user, data)` | 创建日程，校验 group 成员身份 |
| `query_events(db, user_id, start, end, group_id)` | 查询日程，应用可见性过滤 |
| `get_event_detail(db, event_id, user_id)` | 日程详情，校验权限+可见性 |
| `update_event(db, event_id, user_id, data)` | 更新日程，校验编辑权限 |
| `delete_event(db, event_id, user_id)` | 删除日程，校验删除权限 |
| `can_edit_event(db, event, user_id)` | 辅助：检查用户是否有编辑权限 |
| `apply_visibility_filter(events, user_id)` | 辅助：对日程列表应用可见性规则 |

---

## 五、测试计划

### 5.1 日历组测试 (test_groups.py)

| 测试 | 说明 |
|------|------|
| test_create_group | 创建日历组，验证返回数据和 creator 成员 |
| test_create_group_limit | 超出 3 个限制时返回 403 |
| test_list_groups | 返回用户所属的所有组 |
| test_get_group_detail | 组详情含成员列表 |
| test_get_group_not_member | 非成员访问返回 403 |
| test_update_group | admin 更新组信息 |
| test_update_group_no_permission | member 更新返回 403 |
| test_delete_group | creator 解散组 |
| test_delete_group_not_creator | admin 尝试解散返回 403 |
| test_join_group | 通过邀请码加入 |
| test_join_group_wrong_code | 错误邀请码返回 400 |
| test_join_group_already_member | 重复加入返回 409 |
| test_join_group_full | 人数满返回 403 |
| test_remove_member | creator 移除 member |
| test_remove_self | 成员退出日历组 |
| test_remove_creator | 尝试移除创建者返回 403 |

### 5.2 日程测试 (test_events.py)

| 测试 | 说明 |
|------|------|
| test_create_personal_event | 创建个人日程（group_id=null） |
| test_create_group_event | 创建组内日程 |
| test_create_event_not_member | 非成员在组内创建返回 403 |
| test_query_events_date_range | 按时间范围查询 |
| test_query_events_group_filter | 按日历组筛选 |
| test_query_events_visibility_public | 他人公开日程可见 |
| test_query_events_visibility_busy | 他人忙碌日程只显示"有安排" |
| test_query_events_visibility_private | 他人私密日程不可见 |
| test_get_event_detail | 日程详情 |
| test_update_event_creator | 创建者更新 |
| test_update_event_group_admin | 组管理员更新他人日程 |
| test_update_event_no_permission | 普通成员更新他人日程返回 403 |
| test_delete_event | 删除日程 |

---

## 六、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/schemas/group.py` | 新建 | 日历组 Pydantic schemas |
| `backend/app/schemas/event.py` | 新建 | 日程 Pydantic schemas |
| `backend/app/services/group_service.py` | 新建 | 日历组业务逻辑 |
| `backend/app/services/event_service.py` | 新建 | 日程业务逻辑 |
| `backend/app/api/groups.py` | 新建 | 日历组路由 |
| `backend/app/api/events.py` | 新建 | 日程路由 |
| `backend/app/main.py` | 修改 | 注册新路由 |
| `backend/tests/test_groups.py` | 新建 | 日历组测试（16 条） |
| `backend/tests/test_events.py` | 新建 | 日程测试（13 条） |
