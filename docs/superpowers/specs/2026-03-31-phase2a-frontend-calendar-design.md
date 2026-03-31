# Phase 2A：前端日历核心页面设计

> 版本：v1.0 | 日期：2026-03-31
> 基于产品设计文档 P0 功能定义，聚焦日历主页 + 日程 CRUD

---

## 一、范围

实现微信小程序前端的日历核心体验：可折叠月历主页、日程创建/编辑/删除全流程。

### 包含

- 可折叠月历主页（月视图 + 当日日程列表）
- 日程创建全屏表单页
- 日程详情/编辑/删除页
- 微信登录 + Token 持久化
- Zustand 状态管理
- API 服务层（对接 Phase 1 后端 API）

### 不包含

- 农历显示（单独阶段）
- 日历组创建/管理页面（Phase 2B）
- 个人中心（Phase 2B）
- AI 语音、微信推送、分享功能

---

## 二、页面结构

```
pages/
├── calendar/
│   ├── index.tsx          # 日历主页
│   ├── index.scss
│   └── index.config.ts
├── event/
│   ├── create.tsx         # 日程创建页（复用为编辑页，通过 URL 参数 ?id=xxx 区分）
│   ├── create.scss
│   ├── create.config.ts
│   ├── detail.tsx         # 日程详情页
│   ├── detail.scss
│   └── detail.config.ts
└── index/                 # 已有，改为自动跳转到 calendar 或 login
```

在 `app.config.ts` 中注册新页面，`pages/calendar/index` 作为首页。

---

## 三、日历主页设计

### 3.1 布局

```
┌─────────────────────────────┐
│  2026年4月          [今天]   │  ← 顶部标题栏
├─────────────────────────────┤
│  日  一  二  三  四  五  六  │  ← 星期头
│  12  13  14 [15] 16  17  18 │  ← 折叠态：当前周
│  19  20  21· 22  23  24· 25 │  ← 折叠态：下一周
├─────────────────────────────┤  ← 下拉展开完整月历
│  4月15日 · 星期三            │
│  ┌───────────────────────┐  │
│  │▌接小明放学             │  │  ← 日程卡片，左侧颜色条
│  │ 15:00-15:30 · 学校门口 │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │▌家庭晚餐              │  │
│  │ 18:00-19:00   [我们家] │  │  ← 日历组标签
│  └───────────────────────┘  │
│                         [+] │  ← FAB 按钮
└─────────────────────────────┘
```

### 3.2 交互规则

- **月历折叠/展开**：默认折叠显示 2 行（包含当前选中日期的周 + 下一周）。下拉手势展开完整 6 行月历，上滑收起。
- **日期切换**：点击日期 → 高亮选中 → 更新下方日程列表。左右滑动切换月份。
- **今天按钮**：点击回到今天日期并选中。
- **日程小圆点**：有日程的日期底部显示彩色圆点，颜色取自日历组颜色（个人日程用默认灰色）。最多显示 3 个圆点。
- **日程列表**：按 start_time 升序排列。点击日程卡片 → 跳转详情页。
- **FAB 按钮**：点击 → 跳转创建页，自动带入当前选中日期。
- **空状态**：当天无日程时显示"暂无日程"占位文案。
- **busy 类型日程**：显示为灰色卡片，标题为"有安排"，不显示地点等详情。

### 3.3 数据加载

- 进入页面时，调用 `GET /api/events?start={月初}&end={月末}` 获取当月所有日程。
- 切换月份时重新请求。
- 同时调用 `GET /api/groups` 获取日历组列表（用于颜色映射）。

---

## 四、日程创建页设计

### 4.1 表单字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 标题 | 文本输入 | 是 | 最多 128 字 |
| 全天 | 开关 | 否 | 默认关。开启后隐藏时间选择器，仅显示日期 |
| 开始时间 | 日期时间选择器 | 是 | 默认：从日历主页带入的日期 + 当前整点 |
| 结束时间 | 日期时间选择器 | 否 | 默认：开始时间 + 1 小时 |
| 地点 | 文本输入 | 否 | 最多 256 字 |
| 日历组 | 选择器 | 否 | 选项：个人（默认）+ 用户所属的日历组列表 |
| 可见性 | 选择器 | 否 | 公开（默认）/ 仅显示忙碌 / 私密。仅在选择了日历组时显示 |
| 颜色 | 颜色选择器 | 否 | 预设 6 色圆点可选，默认跟随日历组颜色 |

### 4.2 交互规则

- 编辑模式：URL 参数 `?id=xxx`，页面标题改为"编辑日程"，加载已有数据填充表单。
- 保存：调用 `POST /api/events`（创建）或 `PUT /api/events/{id}`（编辑）。
- 保存成功后返回上一页（日历主页或详情页），触发日程列表刷新。
- 表单验证：标题不能为空，结束时间不能早于开始时间。

### 4.3 可见性说明

- 仅当选择了日历组时才显示可见性选项。
- 个人日程不需要设置可见性（只有自己能看到）。

---

## 五、日程详情页设计

### 5.1 布局

```
┌─────────────────────────────┐
│  ← 返回              [编辑] │  ← 有权限时显示
├─────────────────────────────┤
│  接小明放学                  │  ← 标题，大字
│  ─────────────────────────  │
│  📅 2026年4月15日            │
│  🕐 15:00 - 15:30           │
│  📍 学校门口                 │
│  📋 我们家                   │  ← 日历组名 + 颜色
│  👁 公开                     │  ← 可见性
│  ─────────────────────────  │
│  创建者：小明妈妈            │
│                             │
│  [删除日程]                  │  ← 红色文字按钮，有权限时显示
└─────────────────────────────┘
```

### 5.2 交互规则

- 加载：调用 `GET /api/events/{id}` 获取详情。
- 编辑按钮：跳转到 `pages/event/create?id=xxx`。
- 删除按钮：二次确认弹窗 → 调用 `DELETE /api/events/{id}` → 返回日历主页。
- 权限判断：后端已处理权限（403），前端根据 `creator_id === currentUser.id` 或日历组角色判断是否显示编辑/删除按钮。简化实现：总是显示按钮，后端 403 时提示"无权限"。

---

## 六、状态管理 (Zustand)

### 6.1 Store 划分

```typescript
// stores/auth.ts
useAuthStore {
  token: string | null
  user: User | null
  login(code: string): Promise<void>
  logout(): void
}

// stores/calendar.ts
useCalendarStore {
  currentMonth: Date        // 当前显示月份
  selectedDate: Date        // 选中日期
  isExpanded: boolean       // 月历是否展开
  setMonth(date: Date): void
  selectDate(date: Date): void
  toggleExpand(): void
}

// stores/event.ts
useEventStore {
  events: EventResponse[]           // 当月日程缓存
  loading: boolean
  fetchEvents(start, end): Promise<void>
  createEvent(data): Promise<void>
  updateEvent(id, data): Promise<void>
  deleteEvent(id): Promise<void>
}

// stores/group.ts
useGroupStore {
  groups: GroupResponse[]
  fetchGroups(): Promise<void>
}
```

### 6.2 数据流

```
用户操作 → Store action → API 调用 → 更新 Store state → 页面自动重渲染
```

---

## 七、API 服务层

### 7.1 扩展 services/api.ts

在现有 `request<T>()` 基础上新增：

```typescript
// Auth
loginWithCode(code: string): Promise<TokenResponse>

// Groups
getMyGroups(): Promise<GroupResponse[]>

// Events
createEvent(data: EventCreate): Promise<EventResponse>
getEvents(start: string, end: string, groupId?: string): Promise<EventResponse[]>
getEventDetail(id: string): Promise<EventResponse>
updateEvent(id: string, data: EventUpdate): Promise<EventResponse>
deleteEvent(id: string): Promise<void>
```

### 7.2 Token 管理

- 登录成功后将 token 存入 `Taro.setStorageSync('access_token', token)`。
- `request()` 函数自动从 Storage 读取 token 添加到 Authorization header。
- Token 过期（401）时自动跳转登录流程。

### 7.3 登录流程

小程序启动时：
1. 检查本地是否有 token
2. 有 → 调用 `GET /api/users/me` 验证
3. 无或失效 → 调用 `Taro.login()` 获取 code → `POST /api/users/login` → 存储 token

MVP 阶段使用 mock 登录（后端已支持 `dev_{code}` 模式）。

---

## 八、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/app.config.ts` | 修改 | 注册新页面路由 |
| `frontend/src/pages/calendar/index.tsx` | 新建 | 日历主页 |
| `frontend/src/pages/calendar/index.scss` | 新建 | 日历主页样式 |
| `frontend/src/pages/calendar/index.config.ts` | 新建 | 页面配置 |
| `frontend/src/pages/event/create.tsx` | 新建 | 日程创建/编辑页 |
| `frontend/src/pages/event/create.scss` | 新建 | 创建页样式 |
| `frontend/src/pages/event/create.config.ts` | 新建 | 页面配置 |
| `frontend/src/pages/event/detail.tsx` | 新建 | 日程详情页 |
| `frontend/src/pages/event/detail.scss` | 新建 | 详情页样式 |
| `frontend/src/pages/event/detail.config.ts` | 新建 | 页面配置 |
| `frontend/src/services/api.ts` | 修改 | 添加 groups/events API 方法 |
| `frontend/src/stores/auth.ts` | 新建 | 认证状态管理 |
| `frontend/src/stores/calendar.ts` | 新建 | 日历状态管理 |
| `frontend/src/stores/event.ts` | 新建 | 日程状态管理 |
| `frontend/src/stores/group.ts` | 新建 | 日历组状态管理 |
| `frontend/src/types/index.ts` | 修改 | 补充 Group/Event 类型定义 |
| `frontend/src/pages/index/index.tsx` | 修改 | 改为自动跳转日历主页 |
