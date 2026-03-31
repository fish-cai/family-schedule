# Phase 2B：日历组管理 + 个人中心设计

> 版本：v1.0 | 日期：2026-03-31
> 基于产品设计文档 P0 功能定义

---

## 一、范围

实现日历组管理页面（列表、创建、详情含成员管理和邀请分享）、个人中心页面、底部 TabBar 导航。

### 包含

- 底部 TabBar（日历 / 日历组 / 我的）
- 日历组列表页（创建 + 加入入口）
- 日历组创建页
- 日历组详情页（信息、成员列表、邀请码、微信分享、编辑、退出/解散）
- 个人中心页（用户信息、退出登录）
- 微信分享卡片邀请
- 分享落地页（点击卡片自动加入日历组）

### 不包含

- 管理员角色提升/降级
- 组头像上传
- 用户资料编辑
- 成员权限细化 UI

---

## 二、TabBar 配置

```json
{
  "tabBar": {
    "color": "#999999",
    "selectedColor": "#4A90D9",
    "backgroundColor": "#ffffff",
    "borderStyle": "white",
    "list": [
      {
        "pagePath": "pages/calendar/index",
        "text": "日历",
        "iconPath": "assets/tab-calendar.png",
        "selectedIconPath": "assets/tab-calendar-active.png"
      },
      {
        "pagePath": "pages/group/index",
        "text": "日历组",
        "iconPath": "assets/tab-group.png",
        "selectedIconPath": "assets/tab-group-active.png"
      },
      {
        "pagePath": "pages/profile/index",
        "text": "我的",
        "iconPath": "assets/tab-profile.png",
        "selectedIconPath": "assets/tab-profile-active.png"
      }
    ]
  }
}
```

MVP 阶段使用文字代替图标（Taro H5 模式支持无图标 TabBar），或使用简单的 SVG/PNG 占位图标。

**重要**：TabBar 页面（calendar/index、group/index、profile/index）之间必须用 `Taro.switchTab()` 跳转，不能用 `navigateTo`。非 TabBar 页面（group/create、group/detail）正常用 `navigateTo`。

---

## 三、页面结构

```
pages/
├── calendar/index          # 已有 TabBar 页
├── group/
│   ├── index.tsx           # 新建：日历组列表页 (TabBar)
│   ├── index.scss
│   ├── index.config.ts
│   ├── create.tsx          # 新建：创建日历组页
│   ├── create.scss
│   ├── create.config.ts
│   ├── detail.tsx          # 新建：日历组详情页
│   ├── detail.scss
│   └── detail.config.ts
├── profile/
│   ├── index.tsx           # 新建：个人中心页 (TabBar)
│   ├── index.scss
│   └── index.config.ts
├── event/                  # 已有
└── index/                  # 已有
```

---

## 四、日历组列表页

### 4.1 布局

```
┌─────────────────────────────┐
│  我的日历组                   │
├─────────────────────────────┤
│  [+ 创建日历组]  [加入日历组] │  ← 两个操作按钮
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │ ● 我们家          3人  │  │  ← 颜色圆点 + 名称 + 成员数
│  │   创建者               │  │  ← 我的角色
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ ● 闺蜜群          5人  │  │
│  │   成员                 │  │
│  └───────────────────────┘  │
│                             │
│  暂无日历组                  │  ← 空状态
└─────────────────────────────┘
```

### 4.2 交互规则

- 进入页面调用 `GET /api/groups` 加载列表。
- 点击"创建日历组" → `navigateTo` 创建页。
- 点击"加入日历组" → 弹出模态框输入邀请码 → 调用 `POST /api/groups/{group_id}/join`。
  - 由于加入需要 group_id，但用户只有邀请码，需要一个查找逻辑。**简化方案**：前端先调用 `GET /api/groups` 列出所有组（本地无法搜索），因此改为：前端弹窗让用户输入 group_id + invite_code，或者后端新增一个按邀请码查找组的接口。
  - **决定**：新增后端接口 `POST /api/groups/join` 只需要 `invite_code`，后端根据邀请码找到组并加入。
- 点击组卡片 → `navigateTo` 详情页。
- `useDidShow` 刷新列表（从创建/详情页返回时）。

### 4.3 后端新增接口

**`POST /api/groups/join`** — 通过邀请码加入日历组（无需知道 group_id）

请求体：
```json
{ "invite_code": "ABC123" }
```

响应 200：
```json
{ "detail": "加入成功", "group_id": "uuid" }
```

业务规则：
- 根据 invite_code 查找组，找不到返回 400
- 其余逻辑同原 `POST /api/groups/{group_id}/join`

---

## 五、日历组创建页

### 5.1 表单字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 名称 | 文本输入 | 是 | 最多 64 字 |
| 图标 | 选择器 | 否 | 预设图标列表（family/friends/work/sport/study/other） |
| 颜色 | 颜色选择器 | 否 | 6 色预设，默认 #4A90D9 |
| 描述 | 多行文本 | 否 | 最多 256 字 |

### 5.2 交互规则

- 保存调用 `POST /api/groups`。
- 创建成功后 `redirectTo` 组详情页（不是 navigateTo，避免返回到创建页）。

---

## 六、日历组详情页

### 6.1 布局

```
┌─────────────────────────────┐
│  ← 返回              [编辑] │  ← creator/admin 可见
├─────────────────────────────┤
│  ● 我们家                    │  ← 颜色圆点 + 组名
│  家庭日历                    │  ← 描述
├─────────────────────────────┤
│  邀请成员                    │
│  ┌───────────────────────┐  │
│  │ 邀请码: ABC123  [复制] │  │
│  │ [分享给微信好友]       │  │  ← 触发微信分享
│  └───────────────────────┘  │
├─────────────────────────────┤
│  成员 (3/10)                 │
│  ┌───────────────────────┐  │
│  │ 小明妈妈    创建者     │  │
│  │ 小明爸爸    管理员  [×]│  │  ← creator 可移除
│  │ 奶奶        成员    [×]│  │  ← creator/admin 可移除
│  └───────────────────────┘  │
├─────────────────────────────┤
│  [退出日历组] / [解散日历组]  │  ← 角色决定显示哪个
└─────────────────────────────┘
```

### 6.2 交互规则

- 加载：调用 `GET /api/groups/{id}` 获取组详情（含成员列表）。
- 复制邀请码：调用 `Taro.setClipboardData`。
- 分享给微信好友：使用 `useShareAppMessage` 返回分享参数。
  - 分享路径：`/pages/index/index?join_group_id={group_id}&invite_code={code}`
  - 分享标题：`邀请你加入「{group_name}」`
  - 分享图片：可选，MVP 使用默认截图
- 编辑按钮 → `navigateTo` 编辑页（复用创建页，URL 参数 `?id=xxx`）。
- 移除成员 → 二次确认 → `DELETE /api/groups/{id}/members/{user_id}` → 刷新。
- 退出日历组 → 二次确认 → `DELETE /api/groups/{id}/members/{my_user_id}` → `navigateBack`。
- 解散日历组 → 二次确认 → `DELETE /api/groups/{id}` → `switchTab` 到日历组列表。

### 6.3 权限显示规则

| 操作 | creator | admin | member |
|------|---------|-------|--------|
| 编辑按钮 | ✅ | ✅ | ❌ |
| 移除 member | ✅ | ✅ | ❌ |
| 移除 admin | ✅ | ❌ | ❌ |
| 退出日历组 | ❌ | ✅ | ✅ |
| 解散日历组 | ✅ | ❌ | ❌ |

---

## 七、分享落地页逻辑

用户通过微信分享卡片点击进入小程序时：

1. 进入 `pages/index/index`，URL 参数包含 `join_group_id` 和 `invite_code`。
2. index 页面检查参数，如有加入信息：
   - 先完成登录流程
   - 登录成功后调用 `POST /api/groups/{join_group_id}/join`（带 invite_code）
   - 成功 → 跳转到该组详情页
   - 失败（已是成员/人满等）→ 提示错误 → 跳转日历主页

---

## 八、个人中心页

### 8.1 布局

```
┌─────────────────────────────┐
│                             │
│     [头像]                   │
│     微信用户                 │  ← nickname
│                             │
├─────────────────────────────┤
│  关于共享日程            >   │
├─────────────────────────────┤
│                             │
│  [退出登录]                  │  ← 红色文字按钮
└─────────────────────────────┘
```

### 8.2 交互规则

- 加载用户信息：从 `useAuthStore` 读取。
- 退出登录：调用 `useAuthStore.logout()` → 清除 token → `redirectTo` index 页重新登录。

---

## 九、Store 扩展

### 9.1 扩展 group store

在 `frontend/src/stores/group.ts` 添加方法：

```typescript
createGroup(data: GroupCreate): Promise<GroupResponse>
joinGroupByCode(inviteCode: string): Promise<{ group_id: string }>
deleteGroup(id: string): Promise<void>
updateGroup(id: string, data: GroupUpdate): Promise<GroupResponse>
removeMember(groupId: string, userId: string): Promise<void>
```

### 9.2 API 扩展

在 `frontend/src/services/api.ts` 添加：

```typescript
createGroup(data): Promise<GroupResponse>
getGroupDetail(id): Promise<GroupDetailResponse>
updateGroup(id, data): Promise<GroupResponse>
deleteGroup(id): Promise<void>
joinGroupByCode(inviteCode): Promise<{ detail: string; group_id: string }>
removeMember(groupId, userId): Promise<void>
```

### 9.3 类型扩展

```typescript
interface GroupCreate {
  name: string;
  icon?: string;
  color?: string;
  description?: string;
}

interface GroupUpdate {
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
}

interface GroupDetailResponse extends GroupResponse {
  members: GroupMemberResponse[];
}

interface GroupMemberResponse {
  user_id: string;
  nickname: string;
  avatar: string;
  role: string;
}
```

---

## 十、后端修改

### 新增接口

**`POST /api/groups/join`** — 通过邀请码加入（无需 group_id）

实现：在 `group_service.py` 添加 `join_group_by_code(db, user_id, invite_code)` 函数，根据 invite_code 查找组后复用现有 join 逻辑。

路由注册在 `groups.py`，放在 `/{group_id}/join` 之前避免路径冲突。

---

## 十一、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/app.config.ts` | 修改 | 添加 tabBar 配置和新页面路由 |
| `frontend/src/assets/` | 新建 | TabBar 图标（6个 PNG） |
| `frontend/src/types/index.ts` | 修改 | 添加 Group CRUD 类型 |
| `frontend/src/services/api.ts` | 修改 | 添加 group CRUD API 方法 |
| `frontend/src/stores/group.ts` | 修改 | 添加 CRUD 方法 |
| `frontend/src/pages/index/index.tsx` | 修改 | 处理分享落地参数 |
| `frontend/src/pages/calendar/index.tsx` | 修改 | 调整 navigateTo → switchTab 兼容 |
| `frontend/src/pages/group/index.tsx` | 新建 | 日历组列表页 |
| `frontend/src/pages/group/index.scss` | 新建 | 列表页样式 |
| `frontend/src/pages/group/index.config.ts` | 新建 | 页面配置 |
| `frontend/src/pages/group/create.tsx` | 新建 | 创建/编辑日历组页 |
| `frontend/src/pages/group/create.scss` | 新建 | 创建页样式 |
| `frontend/src/pages/group/create.config.ts` | 新建 | 页面配置 |
| `frontend/src/pages/group/detail.tsx` | 新建 | 日历组详情页 |
| `frontend/src/pages/group/detail.scss` | 新建 | 详情页样式 |
| `frontend/src/pages/group/detail.config.ts` | 新建 | 页面配置 |
| `frontend/src/pages/profile/index.tsx` | 新建 | 个人中心页 |
| `frontend/src/pages/profile/index.scss` | 新建 | 个人中心样式 |
| `frontend/src/pages/profile/index.config.ts` | 新建 | 页面配置 |
| `backend/app/services/group_service.py` | 修改 | 添加 join_by_code 函数 |
| `backend/app/api/groups.py` | 修改 | 添加 POST /api/groups/join 路由 |
| `backend/tests/test_groups.py` | 修改 | 添加 join_by_code 测试 |
