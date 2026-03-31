# Phase 2B 日历组管理 + 个人中心 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现日历组管理页面（列表/创建/详情/成员管理/邀请分享）、个人中心页面、底部 TabBar 导航，以及后端邀请码加入接口。

**Architecture:** 后端新增 `POST /api/groups/join`（仅通过邀请码加入），前端新增 4 个页面 + TabBar。复用已有的 group store 和 API 层，扩展 CRUD 方法。分享使用 Taro 的 `useShareAppMessage`。

**Tech Stack:** FastAPI, SQLAlchemy async, Taro 4, React 18, TypeScript, Zustand 5, Sass

---

## Task 1: 后端 — 邀请码加入接口 + 测试

**Files:**
- Modify: `backend/app/services/group_service.py`
- Modify: `backend/app/api/groups.py`
- Modify: `backend/tests/test_groups.py`

- [ ] **Step 1: 在 group_service.py 添加 join_group_by_code**

在 `backend/app/services/group_service.py` 末尾添加：

```python
async def join_group_by_code(
    db: AsyncSession, user_id: uuid.UUID, invite_code: str
) -> CalendarGroup:
    result = await db.execute(
        select(CalendarGroup).where(CalendarGroup.invite_code == invite_code)
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邀请码无效",
        )
    await join_group(db, group.id, user_id, invite_code)
    return group
```

- [ ] **Step 2: 在 groups.py 添加路由**

在 `backend/app/api/groups.py` 中，在 `/{group_id}/join` 路由**之前**添加：

```python
@router.post("/join", status_code=status.HTTP_200_OK)
async def join_group_by_code(
    body: JoinGroupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    group = await group_service.join_group_by_code(db, current_user.id, body.invite_code)
    return {"detail": "加入成功", "group_id": str(group.id)}
```

**重要**：这个路由必须在 `@router.post("/{group_id}/join")` 之前，否则 `/join` 会被当作 `{group_id}` 捕获。

- [ ] **Step 3: 添加测试**

在 `backend/tests/test_groups.py` 末尾追加：

```python
async def test_join_group_by_code(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "邀请码组"}, headers=headers_a
    )
    invite_code = create_resp.json()["invite_code"]
    resp = await client.post(
        "/api/groups/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    assert resp.status_code == 200
    assert "group_id" in resp.json()


async def test_join_group_by_code_invalid(client, user_a):
    _, headers = user_a
    resp = await client.post(
        "/api/groups/join",
        json={"invite_code": "INVALID"},
        headers=headers,
    )
    assert resp.status_code == 400
```

- [ ] **Step 4: 运行测试**

```bash
cd backend && python -m pytest tests/test_groups.py -v --tb=short
```

Expected: 全部通过（原 16 + 新 2 = 18）

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/group_service.py backend/app/api/groups.py backend/tests/test_groups.py
git commit -m "feat: add POST /api/groups/join endpoint for joining by invite code"
```

---

## Task 2: 前端类型 + API + Store 扩展

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/stores/group.ts`

- [ ] **Step 1: 扩展类型**

在 `frontend/src/types/index.ts` 末尾追加：

```typescript
export interface GroupCreate {
  name: string;
  icon?: string;
  color?: string;
  description?: string;
}

export interface GroupUpdate {
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
}

export interface GroupMemberResponse {
  user_id: string;
  nickname: string;
  avatar: string;
  role: string;
}

export interface GroupDetailResponse extends GroupResponse {
  members: GroupMemberResponse[];
}
```

- [ ] **Step 2: 扩展 API 服务**

在 `frontend/src/services/api.ts` 的 import 中添加新类型：

```typescript
import type {
  TokenResponse,
  User,
  GroupResponse,
  GroupDetailResponse,
  GroupCreate,
  GroupUpdate,
  EventResponse,
  EventCreate,
  EventUpdate,
} from "../types";
```

在文件的 `// Groups` 部分之后追加：

```typescript
export async function createGroup(data: GroupCreate): Promise<GroupResponse> {
  return request<GroupResponse>({
    url: "/api/groups",
    method: "POST",
    data: data as unknown as Record<string, unknown>,
  });
}

export async function getGroupDetail(id: string): Promise<GroupDetailResponse> {
  return request<GroupDetailResponse>({ url: `/api/groups/${id}` });
}

export async function updateGroup(id: string, data: GroupUpdate): Promise<GroupResponse> {
  return request<GroupResponse>({
    url: `/api/groups/${id}`,
    method: "PUT",
    data: data as unknown as Record<string, unknown>,
  });
}

export async function deleteGroup(id: string): Promise<void> {
  await request<void>({ url: `/api/groups/${id}`, method: "DELETE" });
}

export async function joinGroupByCode(inviteCode: string): Promise<{ detail: string; group_id: string }> {
  return request<{ detail: string; group_id: string }>({
    url: "/api/groups/join",
    method: "POST",
    data: { invite_code: inviteCode },
  });
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await request<void>({ url: `/api/groups/${groupId}/members/${userId}`, method: "DELETE" });
}
```

- [ ] **Step 3: 扩展 group store**

Replace `frontend/src/stores/group.ts` entirely:

```typescript
import { create } from "zustand";
import type { GroupResponse, GroupCreate, GroupUpdate } from "../types";
import * as api from "../services/api";

interface GroupState {
  groups: GroupResponse[];
  loading: boolean;
  fetchGroups: () => Promise<void>;
  getGroupColor: (groupId: string | null) => string;
  createGroup: (data: GroupCreate) => Promise<GroupResponse>;
  updateGroup: (id: string, data: GroupUpdate) => Promise<GroupResponse>;
  deleteGroup: (id: string) => Promise<void>;
  joinGroupByCode: (inviteCode: string) => Promise<string>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  loading: false,

  fetchGroups: async () => {
    set({ loading: true });
    try {
      const groups = await api.getMyGroups();
      set({ groups, loading: false });
    } catch (e) {
      console.error("Fetch groups failed:", e);
      set({ loading: false });
    }
  },

  getGroupColor: (groupId) => {
    if (!groupId) return "#999999";
    const group = get().groups.find((g) => g.id === groupId);
    return group?.color || "#4A90D9";
  },

  createGroup: async (data) => {
    const group = await api.createGroup(data);
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  updateGroup: async (id, data) => {
    const updated = await api.updateGroup(id, data);
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? updated : g)),
    }));
    return updated;
  },

  deleteGroup: async (id) => {
    await api.deleteGroup(id);
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },

  joinGroupByCode: async (inviteCode) => {
    const result = await api.joinGroupByCode(inviteCode);
    await get().fetchGroups();
    return result.group_id;
  },

  removeMember: async (groupId, userId) => {
    await api.removeMember(groupId, userId);
  },
}));
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts frontend/src/stores/group.ts
git commit -m "feat: add group CRUD types, API methods, and store actions"
```

---

## Task 3: TabBar 配置 + 图标资源

**Files:**
- Modify: `frontend/src/app.config.ts`
- Create: `frontend/src/assets/` (6 PNG icon files)
- Modify: `frontend/src/pages/index/index.tsx`
- Modify: `frontend/src/pages/calendar/index.tsx`

- [ ] **Step 1: 创建 TabBar 图标**

由于 Taro H5 模式不强制要求图标文件，MVP 阶段可以使用极简占位图标。创建 `frontend/src/assets/` 目录，用 1x1 透明 PNG 占位（Taro TabBar 在 H5 模式支持纯文字）。

实际做法：为了小程序端兼容，需要生成 6 个 81x81 的简单 PNG。使用 canvas 生成或使用纯色 placeholder。

最简方案 — 创建一个脚本生成占位图标：

```bash
mkdir -p frontend/src/assets
# 用 base64 写入一个 1x1 透明 PNG 作为占位
cd frontend/src/assets
python3 -c "
import base64
# 1x1 transparent PNG
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
for name in ['tab-calendar.png', 'tab-calendar-active.png', 'tab-group.png', 'tab-group-active.png', 'tab-profile.png', 'tab-profile-active.png']:
    open(name, 'wb').write(png)
"
```

- [ ] **Step 2: 更新 app.config.ts**

Replace entire `frontend/src/app.config.ts`:

```typescript
export default defineAppConfig({
  pages: [
    "pages/calendar/index",
    "pages/group/index",
    "pages/group/create",
    "pages/group/detail",
    "pages/profile/index",
    "pages/event/create",
    "pages/event/detail",
    "pages/index/index",
  ],
  tabBar: {
    color: "#999999",
    selectedColor: "#4A90D9",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: [
      {
        pagePath: "pages/calendar/index",
        text: "日历",
        iconPath: "assets/tab-calendar.png",
        selectedIconPath: "assets/tab-calendar-active.png",
      },
      {
        pagePath: "pages/group/index",
        text: "日历组",
        iconPath: "assets/tab-group.png",
        selectedIconPath: "assets/tab-group-active.png",
      },
      {
        pagePath: "pages/profile/index",
        text: "我的",
        iconPath: "assets/tab-profile.png",
        selectedIconPath: "assets/tab-profile-active.png",
      },
    ],
  },
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#fff",
    navigationBarTitleText: "共享日程",
    navigationBarTextStyle: "black",
  },
});
```

- [ ] **Step 3: 更新 index 页面 — TabBar 兼容 + 分享落地**

Replace `frontend/src/pages/index/index.tsx`:

```typescript
import { useEffect } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useAuthStore } from "../../stores/auth";
import { joinGroupByCode } from "../../services/api";

export default function Index() {
  const { token, loading, login } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const handleReady = async () => {
      // Ensure logged in
      let currentToken = token;
      if (!currentToken) {
        await login();
        currentToken = useAuthStore.getState().token;
      }
      if (!currentToken) return;

      // Check for share landing params
      const joinGroupId = router.params.join_group_id;
      const inviteCode = router.params.invite_code;

      if (joinGroupId && inviteCode) {
        try {
          await joinGroupByCode(inviteCode);
          Taro.showToast({ title: "加入成功", icon: "success" });
          setTimeout(() => {
            Taro.navigateTo({ url: `/pages/group/detail?id=${joinGroupId}` });
          }, 500);
          return;
        } catch (e: any) {
          Taro.showToast({ title: e.message || "加入失败", icon: "none" });
        }
      }

      Taro.switchTab({ url: "/pages/calendar/index" });
    };

    handleReady();
  }, [token, loading]);

  return (
    <View style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <Text>加载中...</Text>
    </View>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app.config.ts frontend/src/assets/ frontend/src/pages/index/index.tsx
git commit -m "feat: add TabBar config, icon assets, and share landing logic"
```

---

## Task 4: 日历组列表页

**Files:**
- Create: `frontend/src/pages/group/index.tsx`
- Create: `frontend/src/pages/group/index.scss`
- Create: `frontend/src/pages/group/index.config.ts`

- [ ] **Step 1: 页面配置**

`frontend/src/pages/group/index.config.ts`:

```typescript
export default definePageConfig({
  navigationBarTitleText: "日历组",
});
```

- [ ] **Step 2: 创建列表页**

`frontend/src/pages/group/index.tsx`:

```typescript
import { useState } from "react";
import { View, Text, Input } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useGroupStore } from "../../stores/group";
import "./index.scss";

const ROLE_LABELS: Record<string, string> = {
  creator: "创建者",
  admin: "管理员",
  member: "成员",
};

export default function GroupListPage() {
  const { groups, loading, fetchGroups, joinGroupByCode } = useGroupStore();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

  useDidShow(() => {
    fetchGroups();
  });

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      Taro.showToast({ title: "请输入邀请码", icon: "none" });
      return;
    }
    setJoining(true);
    try {
      const groupId = await joinGroupByCode(inviteCode.trim());
      Taro.showToast({ title: "加入成功", icon: "success" });
      setShowJoinModal(false);
      setInviteCode("");
      setTimeout(() => {
        Taro.navigateTo({ url: `/pages/group/detail?id=${groupId}` });
      }, 500);
    } catch (e: any) {
      Taro.showToast({ title: e.message || "加入失败", icon: "none" });
    } finally {
      setJoining(false);
    }
  };

  return (
    <View className="group-list-page">
      {/* Action buttons */}
      <View className="action-bar">
        <View className="action-btn primary" onClick={() => Taro.navigateTo({ url: "/pages/group/create" })}>
          <Text className="action-text">+ 创建日历组</Text>
        </View>
        <View className="action-btn secondary" onClick={() => setShowJoinModal(true)}>
          <Text className="action-text-secondary">加入日历组</Text>
        </View>
      </View>

      {/* Group list */}
      {loading && <Text className="hint">加载中...</Text>}

      {!loading && groups.length === 0 && (
        <Text className="hint">暂无日历组</Text>
      )}

      {groups.map((group) => (
        <View
          key={group.id}
          className="group-card"
          onClick={() => Taro.navigateTo({ url: `/pages/group/detail?id=${group.id}` })}
        >
          <View className="group-color-dot" style={{ backgroundColor: group.color }} />
          <View className="group-info">
            <Text className="group-name">{group.name}</Text>
            <Text className="group-role">{ROLE_LABELS[group.my_role] || group.my_role}</Text>
          </View>
          <Text className="group-count">{group.member_count}人</Text>
        </View>
      ))}

      {/* Join modal */}
      {showJoinModal && (
        <View className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <View className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Text className="modal-title">加入日历组</Text>
            <Input
              className="modal-input"
              placeholder="输入邀请码"
              value={inviteCode}
              onInput={(e) => setInviteCode(e.detail.value)}
              maxlength={10}
            />
            <View className="modal-actions">
              <Text className="modal-cancel" onClick={() => setShowJoinModal(false)}>取消</Text>
              <Text className={`modal-confirm ${joining ? "disabled" : ""}`} onClick={!joining ? handleJoin : undefined}>
                {joining ? "加入中..." : "加入"}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: 样式**

`frontend/src/pages/group/index.scss`:

```scss
.group-list-page {
  min-height: 100vh;
  background: #f8f9fa;
  padding-bottom: 120px;
}

.action-bar {
  display: flex;
  gap: 16px;
  padding: 24px 32px;
}

.action-btn {
  flex: 1;
  padding: 20px 0;
  border-radius: 12px;
  text-align: center;

  &.primary {
    background: #4A90D9;
  }

  &.secondary {
    background: #fff;
    border: 2px solid #4A90D9;
  }
}

.action-text {
  font-size: 28px;
  color: #fff;
  font-weight: 600;
}

.action-text-secondary {
  font-size: 28px;
  color: #4A90D9;
  font-weight: 600;
}

.hint {
  font-size: 26px;
  color: #ccc;
  text-align: center;
  padding: 96px 0;
  display: block;
}

.group-card {
  display: flex;
  align-items: center;
  padding: 24px 32px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

.group-color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: 20px;
}

.group-info {
  flex: 1;
}

.group-name {
  font-size: 30px;
  font-weight: 500;
  color: #1a1a1a;
  display: block;
}

.group-role {
  font-size: 24px;
  color: #999;
  margin-top: 4px;
  display: block;
}

.group-count {
  font-size: 24px;
  color: #999;
  flex-shrink: 0;
}

// Modal
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 24px;
  padding: 40px;
  width: 560px;
}

.modal-title {
  font-size: 32px;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
  display: block;
  margin-bottom: 32px;
}

.modal-input {
  font-size: 32px;
  padding: 20px 24px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  text-align: center;
  letter-spacing: 8px;
}

.modal-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 32px;
}

.modal-cancel {
  font-size: 28px;
  color: #999;
  padding: 16px 32px;
}

.modal-confirm {
  font-size: 28px;
  color: #4A90D9;
  font-weight: 600;
  padding: 16px 32px;

  &.disabled {
    opacity: 0.5;
  }
}
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/group/index.tsx frontend/src/pages/group/index.scss frontend/src/pages/group/index.config.ts
git commit -m "feat: add group list page with join modal"
```

---

## Task 5: 日历组创建/编辑页

**Files:**
- Create: `frontend/src/pages/group/create.tsx`
- Create: `frontend/src/pages/group/create.scss`
- Create: `frontend/src/pages/group/create.config.ts`

- [ ] **Step 1: 页面配置**

`frontend/src/pages/group/create.config.ts`:

```typescript
export default definePageConfig({
  navigationBarTitleText: "创建日历组",
});
```

- [ ] **Step 2: 创建页面**

`frontend/src/pages/group/create.tsx`:

```typescript
import { useEffect, useState } from "react";
import { View, Text, Input, Textarea } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useGroupStore } from "../../stores/group";
import { getGroupDetail } from "../../services/api";
import "./create.scss";

const PRESET_COLORS = ["#4A90D9", "#FF6B6B", "#52C41A", "#FAAD14", "#722ED1", "#EB2F96"];
const PRESET_ICONS = [
  { value: "family", label: "家庭" },
  { value: "friends", label: "朋友" },
  { value: "work", label: "工作" },
  { value: "sport", label: "运动" },
  { value: "study", label: "学习" },
  { value: "other", label: "其他" },
];

export default function GroupCreatePage() {
  const router = useRouter();
  const groupId = router.params.id || null;
  const isEdit = !!groupId;

  const { createGroup, updateGroup } = useGroupStore();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("family");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && groupId) {
      Taro.setNavigationBarTitle({ title: "编辑日历组" });
      getGroupDetail(groupId).then((g) => {
        setName(g.name);
        if (g.icon) setIcon(g.icon);
        if (g.color) setColor(g.color);
        setDescription(g.description);
      });
    }
  }, [isEdit, groupId]);

  const handleSave = async () => {
    if (!name.trim()) {
      Taro.showToast({ title: "请输入名称", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      if (isEdit && groupId) {
        await updateGroup(groupId, { name: name.trim(), icon, color, description });
        Taro.showToast({ title: "已更新", icon: "success" });
        setTimeout(() => Taro.navigateBack(), 500);
      } else {
        const group = await createGroup({ name: name.trim(), icon, color, description });
        Taro.showToast({ title: "已创建", icon: "success" });
        setTimeout(() => {
          Taro.redirectTo({ url: `/pages/group/detail?id=${group.id}` });
        }, 500);
      }
    } catch (e: any) {
      Taro.showToast({ title: e.message || "保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="group-create-page">
      <View className="form-section">
        <Input
          className="name-input"
          placeholder="日历组名称"
          value={name}
          onInput={(e) => setName(e.detail.value)}
          maxlength={64}
        />
      </View>

      {/* Icon */}
      <View className="form-row-label">
        <Text className="section-label">图标</Text>
      </View>
      <View className="icon-picker">
        {PRESET_ICONS.map((ic) => (
          <View
            key={ic.value}
            className={`icon-item ${icon === ic.value ? "active" : ""}`}
            onClick={() => setIcon(ic.value)}
          >
            <Text className="icon-text">{ic.label}</Text>
          </View>
        ))}
      </View>

      {/* Color */}
      <View className="form-row-label">
        <Text className="section-label">颜色</Text>
      </View>
      <View className="color-row">
        {PRESET_COLORS.map((c) => (
          <View
            key={c}
            className={`color-dot ${color === c ? "active" : ""}`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </View>

      {/* Description */}
      <View className="form-section">
        <Textarea
          className="desc-input"
          placeholder="描述（可选）"
          value={description}
          onInput={(e) => setDescription(e.detail.value)}
          maxlength={256}
          autoHeight
        />
      </View>

      <View className="save-section">
        <View className={`save-btn ${saving ? "disabled" : ""}`} onClick={!saving ? handleSave : undefined}>
          <Text className="save-text">{saving ? "保存中..." : "保存"}</Text>
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 样式**

`frontend/src/pages/group/create.scss`:

```scss
.group-create-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.form-section {
  background: #fff;
  padding: 24px 32px;
  margin-bottom: 16px;
}

.name-input {
  font-size: 34px;
  font-weight: 500;
  width: 100%;
  padding: 16px 0;
}

.form-row-label {
  padding: 16px 32px 8px;
}

.section-label {
  font-size: 24px;
  color: #999;
}

.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 32px 24px;
  background: #fff;
}

.icon-item {
  padding: 12px 24px;
  border-radius: 8px;
  background: #f0f0f0;

  &.active {
    background: #4A90D9;
    .icon-text { color: #fff; }
  }
}

.icon-text {
  font-size: 24px;
  color: #666;
}

.color-row {
  display: flex;
  gap: 20px;
  padding: 8px 32px 24px;
  background: #fff;
  margin-bottom: 16px;
}

.color-dot {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 4px solid transparent;

  &.active {
    border-color: #333;
  }
}

.desc-input {
  font-size: 28px;
  width: 100%;
  min-height: 120px;
}

.save-section {
  padding: 48px 32px;
}

.save-btn {
  background: #4A90D9;
  border-radius: 16px;
  padding: 24px 0;
  text-align: center;

  &.disabled { opacity: 0.5; }
}

.save-text {
  font-size: 32px;
  color: #fff;
  font-weight: 600;
}
```

- [ ] **Step 4: 验证编译 + Commit**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
git add frontend/src/pages/group/create.tsx frontend/src/pages/group/create.scss frontend/src/pages/group/create.config.ts
git commit -m "feat: add group create/edit page"
```

---

## Task 6: 日历组详情页

**Files:**
- Create: `frontend/src/pages/group/detail.tsx`
- Create: `frontend/src/pages/group/detail.scss`
- Create: `frontend/src/pages/group/detail.config.ts`

- [ ] **Step 1: 页面配置**

`frontend/src/pages/group/detail.config.ts`:

```typescript
export default definePageConfig({
  navigationBarTitleText: "日历组详情",
  enableShareAppMessage: true,
});
```

- [ ] **Step 2: 创建详情页**

`frontend/src/pages/group/detail.tsx`:

```typescript
import { useEffect, useState } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import { getGroupDetail } from "../../services/api";
import { useGroupStore } from "../../stores/group";
import { useAuthStore } from "../../stores/auth";
import type { GroupDetailResponse } from "../../types";
import "./detail.scss";

const ROLE_LABELS: Record<string, string> = {
  creator: "创建者",
  admin: "管理员",
  member: "成员",
};

export default function GroupDetailPage() {
  const router = useRouter();
  const groupId = router.params.id;

  const [group, setGroup] = useState<GroupDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { deleteGroup, removeMember } = useGroupStore();
  const { user } = useAuthStore();

  const loadDetail = () => {
    if (!groupId) return;
    setLoading(true);
    getGroupDetail(groupId)
      .then(setGroup)
      .catch((e) => Taro.showToast({ title: e.message || "加载失败", icon: "none" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDetail();
  }, [groupId]);

  // WeChat share
  useShareAppMessage(() => {
    if (!group) return { title: "共享日程", path: "/pages/index/index" };
    return {
      title: `邀请你加入「${group.name}」`,
      path: `/pages/index/index?join_group_id=${group.id}&invite_code=${group.invite_code}`,
    };
  });

  if (loading || !group) {
    return (
      <View className="group-detail-page">
        <Text className="loading-text">加载中...</Text>
      </View>
    );
  }

  const myRole = group.my_role;
  const isCreator = myRole === "creator";
  const isAdmin = myRole === "admin";
  const canEdit = isCreator || isAdmin;

  const handleCopyCode = () => {
    Taro.setClipboardData({ data: group.invite_code });
  };

  const handleEdit = () => {
    Taro.navigateTo({ url: `/pages/group/create?id=${group.id}` });
  };

  const handleRemoveMember = (userId: string, nickname: string) => {
    Taro.showModal({
      title: "移除成员",
      content: `确定移除「${nickname}」吗？`,
      confirmColor: "#FF4D4F",
      success: async (res) => {
        if (res.confirm) {
          try {
            await removeMember(group.id, userId);
            Taro.showToast({ title: "已移除", icon: "success" });
            loadDetail();
          } catch (e: any) {
            Taro.showToast({ title: e.message || "移除失败", icon: "none" });
          }
        }
      },
    });
  };

  const handleLeave = () => {
    if (!user) return;
    Taro.showModal({
      title: "退出日历组",
      content: `确定退出「${group.name}」吗？`,
      confirmColor: "#FF4D4F",
      success: async (res) => {
        if (res.confirm) {
          try {
            await removeMember(group.id, user.id);
            Taro.showToast({ title: "已退出", icon: "success" });
            setTimeout(() => Taro.switchTab({ url: "/pages/group/index" }), 500);
          } catch (e: any) {
            Taro.showToast({ title: e.message || "退出失败", icon: "none" });
          }
        }
      },
    });
  };

  const handleDissolve = () => {
    Taro.showModal({
      title: "解散日历组",
      content: `确定解散「${group.name}」吗？所有日程将被删除。`,
      confirmColor: "#FF4D4F",
      success: async (res) => {
        if (res.confirm) {
          try {
            await deleteGroup(group.id);
            Taro.showToast({ title: "已解散", icon: "success" });
            setTimeout(() => Taro.switchTab({ url: "/pages/group/index" }), 500);
          } catch (e: any) {
            Taro.showToast({ title: e.message || "解散失败", icon: "none" });
          }
        }
      },
    });
  };

  const canRemoveMember = (targetRole: string): boolean => {
    if (isCreator) return targetRole !== "creator";
    if (isAdmin) return targetRole === "member";
    return false;
  };

  return (
    <View className="group-detail-page">
      {/* Group info header */}
      <View className="info-header">
        <View className="info-top">
          <View className="group-dot" style={{ backgroundColor: group.color }} />
          <Text className="group-title">{group.name}</Text>
          {canEdit && <Text className="edit-link" onClick={handleEdit}>编辑</Text>}
        </View>
        {group.description ? <Text className="group-desc">{group.description}</Text> : null}
      </View>

      {/* Invite section */}
      <View className="section">
        <Text className="section-title">邀请成员</Text>
        <View className="invite-row">
          <Text className="invite-label">邀请码</Text>
          <Text className="invite-code">{group.invite_code}</Text>
          <Text className="copy-btn" onClick={handleCopyCode}>复制</Text>
        </View>
        <Button className="share-btn" openType="share">
          分享给微信好友
        </Button>
      </View>

      {/* Members */}
      <View className="section">
        <Text className="section-title">成员 ({group.member_count}/{group.max_members})</Text>
        {group.members.map((m) => (
          <View key={m.user_id} className="member-row">
            <View className="member-info">
              <Text className="member-name">{m.nickname || "微信用户"}</Text>
              <Text className="member-role">{ROLE_LABELS[m.role] || m.role}</Text>
            </View>
            {canRemoveMember(m.role) && (
              <Text className="remove-btn" onClick={() => handleRemoveMember(m.user_id, m.nickname)}>
                移除
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* Bottom actions */}
      <View className="bottom-actions">
        {!isCreator && (
          <Text className="danger-btn" onClick={handleLeave}>退出日历组</Text>
        )}
        {isCreator && (
          <Text className="danger-btn" onClick={handleDissolve}>解散日历组</Text>
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 样式**

`frontend/src/pages/group/detail.scss`:

```scss
.group-detail-page {
  min-height: 100vh;
  background: #f8f9fa;
  padding-bottom: 120px;
}

.loading-text {
  display: block;
  text-align: center;
  padding: 96px 0;
  color: #999;
  font-size: 28px;
}

.info-header {
  background: #fff;
  padding: 32px;
  margin-bottom: 16px;
}

.info-top {
  display: flex;
  align-items: center;
  gap: 16px;
}

.group-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-title {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a1a;
  flex: 1;
}

.edit-link {
  font-size: 28px;
  color: #4A90D9;
  font-weight: 600;
}

.group-desc {
  font-size: 26px;
  color: #666;
  margin-top: 12px;
  display: block;
}

.section {
  background: #fff;
  padding: 24px 32px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 28px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
  display: block;
}

.invite-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.invite-label {
  font-size: 26px;
  color: #999;
}

.invite-code {
  font-size: 32px;
  font-weight: 700;
  color: #1a1a1a;
  letter-spacing: 4px;
  flex: 1;
}

.copy-btn {
  font-size: 24px;
  color: #4A90D9;
  padding: 8px 16px;
  border: 2px solid #4A90D9;
  border-radius: 8px;
}

.share-btn {
  background: #4A90D9 !important;
  color: #fff !important;
  font-size: 28px !important;
  border-radius: 12px !important;
  padding: 16px 0 !important;
  border: none !important;
  line-height: 1.6 !important;

  &::after {
    border: none !important;
  }
}

.member-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }
}

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-name {
  font-size: 28px;
  color: #1a1a1a;
}

.member-role {
  font-size: 22px;
  color: #999;
  background: #f0f0f0;
  padding: 4px 12px;
  border-radius: 6px;
}

.remove-btn {
  font-size: 24px;
  color: #FF4D4F;
  padding: 8px 16px;
}

.bottom-actions {
  padding: 48px 32px;
  text-align: center;
}

.danger-btn {
  font-size: 28px;
  color: #FF4D4F;
}
```

- [ ] **Step 4: 验证编译 + Commit**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
git add frontend/src/pages/group/detail.tsx frontend/src/pages/group/detail.scss frontend/src/pages/group/detail.config.ts
git commit -m "feat: add group detail page with members, invite, and share"
```

---

## Task 7: 个人中心页

**Files:**
- Create: `frontend/src/pages/profile/index.tsx`
- Create: `frontend/src/pages/profile/index.scss`
- Create: `frontend/src/pages/profile/index.config.ts`

- [ ] **Step 1: 页面配置**

`frontend/src/pages/profile/index.config.ts`:

```typescript
export default definePageConfig({
  navigationBarTitleText: "我的",
});
```

- [ ] **Step 2: 创建个人中心页**

`frontend/src/pages/profile/index.tsx`:

```typescript
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useAuthStore } from "../../stores/auth";
import "./index.scss";

export default function ProfilePage() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Taro.showModal({
      title: "退出登录",
      content: "确定要退出登录吗？",
      success: (res) => {
        if (res.confirm) {
          logout();
          Taro.redirectTo({ url: "/pages/index/index" });
        }
      },
    });
  };

  return (
    <View className="profile-page">
      {/* User info */}
      <View className="user-section">
        <View className="avatar-placeholder">
          {user?.avatar ? (
            <Image className="avatar-img" src={user.avatar} />
          ) : (
            <Text className="avatar-text">{(user?.nickname || "?")[0]}</Text>
          )}
        </View>
        <Text className="nickname">{user?.nickname || "微信用户"}</Text>
      </View>

      {/* Menu */}
      <View className="menu-section">
        <View className="menu-item">
          <Text className="menu-label">关于共享日程</Text>
          <Text className="menu-arrow">›</Text>
        </View>
      </View>

      {/* Logout */}
      <View className="logout-section">
        <Text className="logout-btn" onClick={handleLogout}>退出登录</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 样式**

`frontend/src/pages/profile/index.scss`:

```scss
.profile-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.user-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 32px 48px;
  background: #fff;
  margin-bottom: 16px;
}

.avatar-placeholder {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: #4A90D9;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  overflow: hidden;
}

.avatar-img {
  width: 120px;
  height: 120px;
}

.avatar-text {
  font-size: 48px;
  color: #fff;
  font-weight: 600;
}

.nickname {
  font-size: 34px;
  font-weight: 600;
  color: #1a1a1a;
}

.menu-section {
  background: #fff;
  margin-bottom: 16px;
}

.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 28px 32px;
  border-bottom: 1px solid #f0f0f0;
}

.menu-label {
  font-size: 28px;
  color: #333;
}

.menu-arrow {
  font-size: 32px;
  color: #ccc;
}

.logout-section {
  padding: 64px 32px;
  text-align: center;
}

.logout-btn {
  font-size: 28px;
  color: #FF4D4F;
}
```

- [ ] **Step 4: 验证编译 + Commit**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
git add frontend/src/pages/profile/
git commit -m "feat: add profile page with logout"
```

---

## Task 8: 最终验证

- [ ] **Step 1: 运行后端测试**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: 全部通过（35 个：1 health + 3 users + 18 groups + 13 events）

- [ ] **Step 2: H5 编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -10
```

Expected: compiled successfully

- [ ] **Step 3: 微信小程序编译**

```bash
cd frontend && npm run build:weapp 2>&1 | tail -10
```

Expected: Compiled successfully
