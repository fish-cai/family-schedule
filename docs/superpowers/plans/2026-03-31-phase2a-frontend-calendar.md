# Phase 2A 前端日历核心页面 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现微信小程序前端的日历主页（可折叠月历 + 日程列表）、日程创建/编辑/详情页、Zustand 状态管理、API 集成。

**Architecture:** Taro 4 + React 页面组件，Zustand store 管理状态，services/api.ts 统一 HTTP 请求。页面间通过 Taro.navigateTo 跳转，通过 URL 参数传递 id/date。Store 通过 subscribe 实现跨页面数据同步。

**Tech Stack:** Taro 4.1.11, React 18, TypeScript 5.4, Zustand 5, Sass

---

## 文件结构

```
frontend/src/
├── app.config.ts                    # 修改：注册新页面路由
├── app.ts                           # 修改：启动时自动登录
├── types/index.ts                   # 修改：补充 Group/Event 类型
├── services/api.ts                  # 修改：添加 auth/groups/events API
├── stores/
│   ├── auth.ts                      # 新建：认证状态
│   ├── calendar.ts                  # 新建：日历 UI 状态
│   ├── event.ts                     # 新建：日程数据
│   └── group.ts                     # 新建：日历组数据
├── pages/
│   ├── index/index.tsx              # 修改：自动跳转日历页
│   ├── calendar/
│   │   ├── index.tsx                # 新建：日历主页
│   │   ├── index.scss               # 新建：日历主页样式
│   │   └── index.config.ts          # 新建：页面配置
│   └── event/
│       ├── create.tsx               # 新建：日程创建/编辑页
│       ├── create.scss              # 新建：创建页样式
│       ├── create.config.ts         # 新建：页面配置
│       ├── detail.tsx               # 新建：日程详情页
│       ├── detail.scss              # 新建：详情页样式
│       └── detail.config.ts         # 新建：页面配置
└── components/
    └── calendar-grid/
        ├── index.tsx                # 新建：月历网格组件（可折叠）
        └── index.scss               # 新建：月历样式
```

---

## Task 1: 类型定义 + API 服务层

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 扩展类型定义**

在 `frontend/src/types/index.ts` 末尾追加：

```typescript
export interface GroupResponse {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  invite_code: string;
  max_members: number;
  member_count: number;
  my_role: string;
  created_at: string;
}

export interface EventResponse {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string | null;
  is_all_day: boolean;
  location: string;
  color: string;
  visibility: string;
  repeat_rule: Record<string, unknown> | null;
  group_id: string | null;
  creator_id: string;
  creator_nickname: string;
  created_at: string;
}

export interface EventCreate {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string | null;
  is_all_day?: boolean;
  location?: string;
  color?: string;
  visibility?: "public" | "busy" | "private";
  repeat_rule?: Record<string, unknown> | null;
  group_id?: string | null;
}

export interface EventUpdate {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string | null;
  is_all_day?: boolean;
  location?: string;
  color?: string;
  visibility?: "public" | "busy" | "private";
  repeat_rule?: Record<string, unknown> | null;
}
```

- [ ] **Step 2: 扩展 API 服务**

将 `frontend/src/services/api.ts` 替换为完整内容：

```typescript
import Taro from "@tarojs/taro";
import type {
  TokenResponse,
  User,
  GroupResponse,
  EventResponse,
  EventCreate,
  EventUpdate,
} from "../types";

const BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://your-production-api.com";

interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: Record<string, unknown>;
  needAuth?: boolean;
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = "GET", data, needAuth = true } = options;

  const header: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (needAuth) {
    const token = Taro.getStorageSync("access_token");
    if (token) {
      header["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await Taro.request({
    url: `${BASE_URL}${url}`,
    method,
    data,
    header,
  });

  if (response.statusCode === 401) {
    Taro.removeStorageSync("access_token");
    Taro.redirectTo({ url: "/pages/index/index" });
    throw new Error("登录已过期");
  }

  if (response.statusCode >= 400) {
    const detail = response.data?.detail || "请求失败";
    throw new Error(detail);
  }

  return response.data as T;
}

// Health
export async function healthCheck() {
  return request<{ status: string; service: string }>({
    url: "/health",
    needAuth: false,
  });
}

// Auth
export async function login(code: string): Promise<TokenResponse> {
  return request<TokenResponse>({
    url: "/api/users/login",
    method: "POST",
    data: { code },
    needAuth: false,
  });
}

export async function getMe(): Promise<User> {
  return request<User>({ url: "/api/users/me" });
}

// Groups
export async function getMyGroups(): Promise<GroupResponse[]> {
  return request<GroupResponse[]>({ url: "/api/groups" });
}

// Events
export async function createEvent(data: EventCreate): Promise<EventResponse> {
  return request<EventResponse>({
    url: "/api/events",
    method: "POST",
    data: data as unknown as Record<string, unknown>,
  });
}

export async function getEvents(
  start: string,
  end: string,
  groupId?: string
): Promise<EventResponse[]> {
  let url = `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  if (groupId) {
    url += `&group_id=${groupId}`;
  }
  return request<EventResponse[]>({ url });
}

export async function getEventDetail(id: string): Promise<EventResponse> {
  return request<EventResponse>({ url: `/api/events/${id}` });
}

export async function updateEvent(
  id: string,
  data: EventUpdate
): Promise<EventResponse> {
  return request<EventResponse>({
    url: `/api/events/${id}`,
    method: "PUT",
    data: data as unknown as Record<string, unknown>,
  });
}

export async function deleteEvent(id: string): Promise<void> {
  await request<void>({ url: `/api/events/${id}`, method: "DELETE" });
}
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

Expected: 编译成功，无类型错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat: add types and API service for groups and events"
```

---

## Task 2: Zustand Stores

**Files:**
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/stores/calendar.ts`
- Create: `frontend/src/stores/event.ts`
- Create: `frontend/src/stores/group.ts`

- [ ] **Step 1: 创建 auth store**

`frontend/src/stores/auth.ts`:

```typescript
import { create } from "zustand";
import Taro from "@tarojs/taro";
import type { User } from "../types";
import { login as apiLogin, getMe } from "../services/api";

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  loading: false,

  login: async () => {
    set({ loading: true });
    try {
      // 小程序环境用 Taro.login()，开发环境用 mock code
      let code: string;
      if (process.env.TARO_ENV === "weapp") {
        const res = await Taro.login();
        code = res.code;
      } else {
        code = "dev_h5_user";
      }

      const tokenRes = await apiLogin(code);
      Taro.setStorageSync("access_token", tokenRes.access_token);

      const user = await getMe();
      set({ token: tokenRes.access_token, user, loading: false });
    } catch (e) {
      console.error("Login failed:", e);
      set({ loading: false });
    }
  },

  loadFromStorage: async () => {
    const token = Taro.getStorageSync("access_token");
    if (!token) return;

    set({ loading: true });
    try {
      const user = await getMe();
      set({ token, user, loading: false });
    } catch {
      Taro.removeStorageSync("access_token");
      set({ token: null, user: null, loading: false });
    }
  },

  logout: () => {
    Taro.removeStorageSync("access_token");
    set({ token: null, user: null });
  },
}));
```

- [ ] **Step 2: 创建 calendar store**

`frontend/src/stores/calendar.ts`:

```typescript
import { create } from "zustand";

interface CalendarState {
  currentMonth: Date;
  selectedDate: Date;
  isExpanded: boolean;
  setMonth: (date: Date) => void;
  selectDate: (date: Date) => void;
  toggleExpand: () => void;
  goToToday: () => void;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  currentMonth: new Date(),
  selectedDate: new Date(),
  isExpanded: false,

  setMonth: (date) => set({ currentMonth: date }),

  selectDate: (date) =>
    set({
      selectedDate: date,
      currentMonth: new Date(date.getFullYear(), date.getMonth(), 1),
    }),

  toggleExpand: () => set((s) => ({ isExpanded: !s.isExpanded })),

  goToToday: () => {
    const today = new Date();
    set({
      selectedDate: today,
      currentMonth: new Date(today.getFullYear(), today.getMonth(), 1),
    });
  },
}));
```

- [ ] **Step 3: 创建 event store**

`frontend/src/stores/event.ts`:

```typescript
import { create } from "zustand";
import type { EventResponse, EventCreate, EventUpdate } from "../types";
import * as api from "../services/api";

interface EventState {
  events: EventResponse[];
  loading: boolean;
  fetchEvents: (start: string, end: string) => Promise<void>;
  createEvent: (data: EventCreate) => Promise<EventResponse>;
  updateEvent: (id: string, data: EventUpdate) => Promise<EventResponse>;
  deleteEvent: (id: string) => Promise<void>;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  loading: false,

  fetchEvents: async (start, end) => {
    set({ loading: true });
    try {
      const events = await api.getEvents(start, end);
      set({ events, loading: false });
    } catch (e) {
      console.error("Fetch events failed:", e);
      set({ loading: false });
    }
  },

  createEvent: async (data) => {
    const event = await api.createEvent(data);
    set((s) => ({ events: [...s.events, event] }));
    return event;
  },

  updateEvent: async (id, data) => {
    const updated = await api.updateEvent(id, data);
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? updated : e)),
    }));
    return updated;
  },

  deleteEvent: async (id) => {
    await api.deleteEvent(id);
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
  },
}));
```

- [ ] **Step 4: 创建 group store**

`frontend/src/stores/group.ts`:

```typescript
import { create } from "zustand";
import type { GroupResponse } from "../types";
import { getMyGroups } from "../services/api";

interface GroupState {
  groups: GroupResponse[];
  loading: boolean;
  fetchGroups: () => Promise<void>;
  getGroupColor: (groupId: string | null) => string;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  loading: false,

  fetchGroups: async () => {
    set({ loading: true });
    try {
      const groups = await getMyGroups();
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
}));
```

- [ ] **Step 5: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

Expected: 编译成功

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/
git commit -m "feat: add Zustand stores for auth, calendar, events, groups"
```

---

## Task 3: App 启动登录 + 页面路由注册

**Files:**
- Modify: `frontend/src/app.config.ts`
- Modify: `frontend/src/app.ts`
- Modify: `frontend/src/pages/index/index.tsx`

- [ ] **Step 1: 更新 app.config.ts 注册新页面**

```typescript
export default defineAppConfig({
  pages: [
    "pages/calendar/index",
    "pages/event/create",
    "pages/event/detail",
    "pages/index/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#fff",
    navigationBarTitleText: "共享日程",
    navigationBarTextStyle: "black",
  },
});
```

- [ ] **Step 2: 更新 app.ts 启动时自动登录**

```typescript
import { PropsWithChildren } from "react";
import { useLaunch } from "@tarojs/taro";
import { useAuthStore } from "./stores/auth";

import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    const { loadFromStorage, login } = useAuthStore.getState();
    loadFromStorage().then(() => {
      const { token } = useAuthStore.getState();
      if (!token) {
        login();
      }
    });
  });

  return children;
}

export default App;
```

- [ ] **Step 3: 简化 index 页面为重定向**

将 `frontend/src/pages/index/index.tsx` 替换为：

```typescript
import { useEffect } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useAuthStore } from "../../stores/auth";

export default function Index() {
  const { token, loading } = useAuthStore();

  useEffect(() => {
    if (!loading && token) {
      Taro.redirectTo({ url: "/pages/calendar/index" });
    }
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
git add frontend/src/app.config.ts frontend/src/app.ts frontend/src/pages/index/index.tsx
git commit -m "feat: register new pages and add auto-login on startup"
```

---

## Task 4: 月历网格组件

**Files:**
- Create: `frontend/src/components/calendar-grid/index.tsx`
- Create: `frontend/src/components/calendar-grid/index.scss`

- [ ] **Step 1: 创建月历组件**

`frontend/src/components/calendar-grid/index.tsx`:

```typescript
import { View, Text } from "@tarojs/components";
import { useCalendarStore } from "../../stores/calendar";
import type { EventResponse } from "../../types";
import "./index.scss";

interface CalendarGridProps {
  events: EventResponse[];
  getGroupColor: (groupId: string | null) => string;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun

  // Fill previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  // Fill next month to complete grid (6 rows)
  while (days.length < 42) {
    const last = days[days.length - 1];
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }

  return days;
}

function getEventDotsForDate(
  date: Date,
  events: EventResponse[],
  getGroupColor: (groupId: string | null) => string
): string[] {
  const dayEvents = events.filter((e) => {
    const start = new Date(e.start_time);
    return isSameDay(start, date);
  });

  // Deduplicate by group_id, take up to 3 colors
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const e of dayEvents) {
    const key = e.group_id || "__personal__";
    if (!seen.has(key) && colors.length < 3) {
      seen.add(key);
      colors.push(getGroupColor(e.group_id));
    }
  }
  return colors;
}

export default function CalendarGrid({ events, getGroupColor }: CalendarGridProps) {
  const { currentMonth, selectedDate, isExpanded, selectDate, toggleExpand } =
    useCalendarStore();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const allDays = getMonthDays(year, month);
  const today = new Date();

  // Collapsed: show 2 rows containing selectedDate
  const selectedIndex = allDays.findIndex((d) => isSameDay(d, selectedDate));
  const selectedRow = Math.floor((selectedIndex >= 0 ? selectedIndex : 14) / 7);
  const startRow = selectedRow;
  const visibleDays = isExpanded
    ? allDays
    : allDays.slice(startRow * 7, (startRow + 2) * 7);

  return (
    <View className="calendar-grid">
      {/* Weekday headers */}
      <View className="weekday-row">
        {WEEKDAYS.map((w) => (
          <View key={w} className="weekday-cell">
            <Text className="weekday-text">{w}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View className="day-grid">
        {visibleDays.map((date, i) => {
          const isCurrentMonth = date.getMonth() === month;
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const dots = getEventDotsForDate(date, events, getGroupColor);

          return (
            <View
              key={i}
              className={`day-cell ${!isCurrentMonth ? "other-month" : ""} ${isSelected ? "selected" : ""}`}
              onClick={() => selectDate(new Date(date))}
            >
              <View className={`day-number ${isToday ? "today" : ""}`}>
                <Text>{date.getDate()}</Text>
              </View>
              {dots.length > 0 && (
                <View className="dot-row">
                  {dots.map((color, di) => (
                    <View
                      key={di}
                      className="dot"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Expand/collapse toggle */}
      <View className="toggle-bar" onClick={toggleExpand}>
        <View className={`toggle-arrow ${isExpanded ? "up" : "down"}`} />
      </View>
    </View>
  );
}
```

- [ ] **Step 2: 创建月历样式**

`frontend/src/components/calendar-grid/index.scss`:

```scss
.calendar-grid {
  padding: 0 16px;
  background: #fff;
}

.weekday-row {
  display: flex;
}

.weekday-cell {
  flex: 1;
  text-align: center;
  padding: 8px 0;
}

.weekday-text {
  font-size: 24px;
  color: #999;
}

.day-grid {
  display: flex;
  flex-wrap: wrap;
}

.day-cell {
  width: calc(100% / 7);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  box-sizing: border-box;

  &.other-month {
    .day-number text {
      color: #ccc;
    }
  }

  &.selected .day-number {
    background: #4A90D9;
    border-radius: 50%;

    text {
      color: #fff;
      font-weight: 600;
    }
  }
}

.day-number {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;

  text {
    font-size: 28px;
    color: #1a1a1a;
  }

  &.today text {
    color: #4A90D9;
    font-weight: 600;
  }
}

.dot-row {
  display: flex;
  gap: 4px;
  margin-top: 2px;
  height: 10px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.toggle-bar {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.toggle-arrow {
  width: 40px;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;

  &.up {
    background: #ccc;
  }
}
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: add collapsible calendar grid component"
```

---

## Task 5: 日历主页

**Files:**
- Create: `frontend/src/pages/calendar/index.tsx`
- Create: `frontend/src/pages/calendar/index.scss`
- Create: `frontend/src/pages/calendar/index.config.ts`

- [ ] **Step 1: 创建页面配置**

`frontend/src/pages/calendar/index.config.ts`:

```typescript
export default definePageConfig({
  navigationBarTitleText: "共享日程",
});
```

- [ ] **Step 2: 创建日历主页**

`frontend/src/pages/calendar/index.tsx`:

```typescript
import { useEffect, useCallback } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import CalendarGrid from "../../components/calendar-grid";
import { useCalendarStore } from "../../stores/calendar";
import { useEventStore } from "../../stores/event";
import { useGroupStore } from "../../stores/group";
import "./index.scss";

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${month}月${day}日 · ${weekdays[date.getDay()]}`;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { currentMonth, selectedDate, setMonth, goToToday } = useCalendarStore();
  const { events, loading, fetchEvents } = useEventStore();
  const { groups, fetchGroups, getGroupColor } = useGroupStore();

  const loadMonthEvents = useCallback(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    fetchEvents(start, end);
  }, [currentMonth, fetchEvents]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    loadMonthEvents();
  }, [loadMonthEvents]);

  // Reload when returning from create/edit
  useDidShow(() => {
    loadMonthEvents();
  });

  // Filter events for selected date
  const dayEvents = events.filter((e) => {
    const start = new Date(e.start_time);
    return (
      start.getFullYear() === selectedDate.getFullYear() &&
      start.getMonth() === selectedDate.getMonth() &&
      start.getDate() === selectedDate.getDate()
    );
  });

  const prevMonth = () => {
    const m = currentMonth.getMonth();
    const y = currentMonth.getFullYear();
    setMonth(new Date(y, m - 1, 1));
  };

  const nextMonth = () => {
    const m = currentMonth.getMonth();
    const y = currentMonth.getFullYear();
    setMonth(new Date(y, m + 1, 1));
  };

  const getGroupName = (groupId: string | null): string | null => {
    if (!groupId) return null;
    const group = groups.find((g) => g.id === groupId);
    return group?.name || null;
  };

  const handleEventClick = (eventId: string) => {
    Taro.navigateTo({ url: `/pages/event/detail?id=${eventId}` });
  };

  const handleCreate = () => {
    const dateStr = selectedDate.toISOString().slice(0, 10);
    Taro.navigateTo({ url: `/pages/event/create?date=${dateStr}` });
  };

  return (
    <View className="calendar-page">
      {/* Header */}
      <View className="header">
        <View className="header-left">
          <Text className="month-label" onClick={prevMonth}>◀</Text>
          <Text className="month-title">
            {currentMonth.getFullYear()}年{MONTH_NAMES[currentMonth.getMonth()]}
          </Text>
          <Text className="month-label" onClick={nextMonth}>▶</Text>
        </View>
        <Text className="today-btn" onClick={goToToday}>
          今天
        </Text>
      </View>

      {/* Calendar Grid */}
      <CalendarGrid events={events} getGroupColor={getGroupColor} />

      {/* Divider */}
      <View className="divider" />

      {/* Day events */}
      <View className="events-section">
        <Text className="date-label">{formatDate(selectedDate)}</Text>

        {loading && <Text className="hint">加载中...</Text>}

        {!loading && dayEvents.length === 0 && (
          <Text className="hint">暂无日程</Text>
        )}

        {dayEvents.map((event) => {
          const isBusy = event.title === "有安排";
          const groupName = getGroupName(event.group_id);
          const color = getGroupColor(event.group_id);

          return (
            <View
              key={event.id}
              className={`event-card ${isBusy ? "busy" : ""}`}
              style={{ borderLeftColor: color }}
              onClick={() => handleEventClick(event.id)}
            >
              <View className="event-main">
                <Text className="event-title">{event.title}</Text>
                <View className="event-meta">
                  <Text className="event-time">
                    {event.is_all_day
                      ? "全天"
                      : `${formatTime(event.start_time)}${event.end_time ? " - " + formatTime(event.end_time) : ""}`}
                  </Text>
                  {event.location ? (
                    <Text className="event-location"> · {event.location}</Text>
                  ) : null}
                </View>
              </View>
              {groupName && (
                <View className="group-tag" style={{ color, backgroundColor: color + "20" }}>
                  <Text>{groupName}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* FAB */}
      <View className="fab" onClick={handleCreate}>
        <Text className="fab-icon">+</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 创建日历主页样式**

`frontend/src/pages/calendar/index.scss`:

```scss
.calendar-page {
  min-height: 100vh;
  background: #fff;
  padding-bottom: 120px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.month-title {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a1a;
}

.month-label {
  font-size: 24px;
  color: #999;
  padding: 8px;
}

.today-btn {
  font-size: 28px;
  color: #4A90D9;
  font-weight: 600;
  padding: 8px 16px;
}

.divider {
  height: 1px;
  background: #f0f0f0;
  margin: 8px 32px;
}

.events-section {
  padding: 16px 32px;
}

.date-label {
  font-size: 26px;
  color: #666;
  margin-bottom: 16px;
  display: block;
}

.hint {
  font-size: 26px;
  color: #ccc;
  text-align: center;
  padding: 48px 0;
  display: block;
}

.event-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: #f8f9fa;
  border-radius: 16px;
  border-left: 6px solid #4A90D9;
  margin-bottom: 16px;

  &.busy {
    border-left-color: #999;
  }
}

.event-main {
  flex: 1;
}

.event-title {
  font-size: 28px;
  font-weight: 500;
  color: #1a1a1a;
}

.event-meta {
  display: flex;
  margin-top: 6px;
}

.event-time {
  font-size: 24px;
  color: #999;
}

.event-location {
  font-size: 24px;
  color: #999;
}

.group-tag {
  font-size: 20px;
  padding: 4px 12px;
  border-radius: 8px;
  margin-left: 12px;
  flex-shrink: 0;
}

.fab {
  position: fixed;
  right: 40px;
  bottom: 60px;
  width: 96px;
  height: 96px;
  background: #4A90D9;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(74, 144, 217, 0.3);
}

.fab-icon {
  font-size: 48px;
  color: #fff;
  line-height: 1;
}
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/calendar/
git commit -m "feat: add calendar main page with collapsible month view"
```

---

## Task 6: 日程创建/编辑页

**Files:**
- Create: `frontend/src/pages/event/create.tsx`
- Create: `frontend/src/pages/event/create.scss`
- Create: `frontend/src/pages/event/create.config.ts`

- [ ] **Step 1: 创建页面配置**

`frontend/src/pages/event/create.config.ts`:

```typescript
export default definePageConfig({
  navigationBarTitleText: "创建日程",
});
```

- [ ] **Step 2: 创建日程创建/编辑页**

`frontend/src/pages/event/create.tsx`:

```typescript
import { useEffect, useState } from "react";
import { View, Text, Input, Switch, Picker } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEventStore } from "../../stores/event";
import { useGroupStore } from "../../stores/group";
import { getEventDetail } from "../../services/api";
import type { EventCreate, EventUpdate } from "../../types";
import "./create.scss";

const PRESET_COLORS = ["#4A90D9", "#FF6B6B", "#52C41A", "#FAAD14", "#722ED1", "#EB2F96"];
const VISIBILITY_OPTIONS = [
  { value: "public", label: "公开" },
  { value: "busy", label: "仅显示忙碌" },
  { value: "private", label: "私密" },
];

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

function toTimeStr(d: Date): string {
  return `${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
}

function toISOWithTZ(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00+08:00`;
}

export default function EventCreatePage() {
  const router = useRouter();
  const eventId = router.params.id || null;
  const initialDate = router.params.date || toDateStr(new Date());
  const isEdit = !!eventId;

  const { createEvent, updateEvent } = useEventStore();
  const { groups, fetchGroups } = useGroupStore();

  const [title, setTitle] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(toTimeStr(new Date()));
  const [endDate, setEndDate] = useState(initialDate);
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return toTimeStr(d);
  });
  const [location, setLocation] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState("public");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (isEdit && eventId) {
      Taro.setNavigationBarTitle({ title: "编辑日程" });
      getEventDetail(eventId).then((e) => {
        setTitle(e.title);
        setIsAllDay(e.is_all_day);
        const start = new Date(e.start_time);
        setStartDate(toDateStr(start));
        setStartTime(toTimeStr(start));
        if (e.end_time) {
          const end = new Date(e.end_time);
          setEndDate(toDateStr(end));
          setEndTime(toTimeStr(end));
        }
        setLocation(e.location);
        setGroupId(e.group_id);
        setVisibility(e.visibility);
        if (e.color) setColor(e.color);
      });
    }
  }, [isEdit, eventId]);

  const groupPickerRange = ["个人", ...groups.map((g) => g.name)];
  const groupPickerValue = groupId
    ? groups.findIndex((g) => g.id === groupId) + 1
    : 0;

  const visibilityIndex = VISIBILITY_OPTIONS.findIndex(
    (v) => v.value === visibility
  );

  const handleSave = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return;
    }

    const startISO = isAllDay
      ? `${startDate}T00:00:00+08:00`
      : toISOWithTZ(startDate, startTime);
    const endISO = isAllDay
      ? `${endDate}T23:59:59+08:00`
      : toISOWithTZ(endDate, endTime);

    if (new Date(endISO) < new Date(startISO)) {
      Taro.showToast({ title: "结束时间不能早于开始时间", icon: "none" });
      return;
    }

    setSaving(true);
    try {
      if (isEdit && eventId) {
        const data: EventUpdate = {
          title: title.trim(),
          is_all_day: isAllDay,
          start_time: startISO,
          end_time: endISO,
          location,
          color,
          visibility: groupId ? (visibility as "public" | "busy" | "private") : undefined,
        };
        await updateEvent(eventId, data);
        Taro.showToast({ title: "已更新", icon: "success" });
      } else {
        const data: EventCreate = {
          title: title.trim(),
          is_all_day: isAllDay,
          start_time: startISO,
          end_time: endISO,
          location,
          color,
          group_id: groupId,
          visibility: groupId ? (visibility as "public" | "busy" | "private") : "public",
        };
        await createEvent(data);
        Taro.showToast({ title: "已创建", icon: "success" });
      }
      setTimeout(() => Taro.navigateBack(), 500);
    } catch (e: any) {
      Taro.showToast({ title: e.message || "保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="create-page">
      {/* Title */}
      <View className="form-section">
        <Input
          className="title-input"
          placeholder="日程标题"
          value={title}
          onInput={(e) => setTitle(e.detail.value)}
          maxlength={128}
        />
      </View>

      {/* All day toggle */}
      <View className="form-row">
        <Text className="form-label">全天</Text>
        <Switch checked={isAllDay} onChange={(e) => setIsAllDay(e.detail.value)} color="#4A90D9" />
      </View>

      {/* Start */}
      <View className="form-row">
        <Text className="form-label">开始</Text>
        <View className="picker-group">
          <Picker mode="date" value={startDate} onChange={(e) => setStartDate(e.detail.value)}>
            <Text className="picker-value">{startDate}</Text>
          </Picker>
          {!isAllDay && (
            <Picker mode="time" value={startTime} onChange={(e) => setStartTime(e.detail.value)}>
              <Text className="picker-value">{startTime}</Text>
            </Picker>
          )}
        </View>
      </View>

      {/* End */}
      <View className="form-row">
        <Text className="form-label">结束</Text>
        <View className="picker-group">
          <Picker mode="date" value={endDate} onChange={(e) => setEndDate(e.detail.value)}>
            <Text className="picker-value">{endDate}</Text>
          </Picker>
          {!isAllDay && (
            <Picker mode="time" value={endTime} onChange={(e) => setEndTime(e.detail.value)}>
              <Text className="picker-value">{endTime}</Text>
            </Picker>
          )}
        </View>
      </View>

      {/* Location */}
      <View className="form-row">
        <Text className="form-label">地点</Text>
        <Input
          className="form-input"
          placeholder="可选"
          value={location}
          onInput={(e) => setLocation(e.detail.value)}
          maxlength={256}
        />
      </View>

      {/* Group */}
      <View className="form-row">
        <Text className="form-label">日历组</Text>
        <Picker
          mode="selector"
          range={groupPickerRange}
          value={groupPickerValue}
          onChange={(e) => {
            const idx = Number(e.detail.value);
            setGroupId(idx === 0 ? null : groups[idx - 1].id);
          }}
        >
          <Text className="picker-value">
            {groupPickerValue === 0 ? "个人" : groups[groupPickerValue - 1]?.name}
          </Text>
        </Picker>
      </View>

      {/* Visibility - only show when group selected */}
      {groupId && (
        <View className="form-row">
          <Text className="form-label">可见性</Text>
          <Picker
            mode="selector"
            range={VISIBILITY_OPTIONS.map((v) => v.label)}
            value={visibilityIndex >= 0 ? visibilityIndex : 0}
            onChange={(e) => {
              setVisibility(VISIBILITY_OPTIONS[Number(e.detail.value)].value);
            }}
          >
            <Text className="picker-value">
              {VISIBILITY_OPTIONS[visibilityIndex >= 0 ? visibilityIndex : 0].label}
            </Text>
          </Picker>
        </View>
      )}

      {/* Color */}
      <View className="form-row">
        <Text className="form-label">颜色</Text>
        <View className="color-picker">
          {PRESET_COLORS.map((c) => (
            <View
              key={c}
              className={`color-dot ${color === c ? "active" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </View>
      </View>

      {/* Save button */}
      <View className="save-section">
        <View className={`save-btn ${saving ? "disabled" : ""}`} onClick={!saving ? handleSave : undefined}>
          <Text className="save-text">{saving ? "保存中..." : "保存"}</Text>
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 创建样式**

`frontend/src/pages/event/create.scss`:

```scss
.create-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.form-section {
  background: #fff;
  padding: 24px 32px;
  margin-bottom: 16px;
}

.title-input {
  font-size: 34px;
  font-weight: 500;
  width: 100%;
  padding: 16px 0;
}

.form-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

.form-label {
  font-size: 28px;
  color: #333;
  flex-shrink: 0;
  width: 120px;
}

.form-input {
  font-size: 28px;
  color: #333;
  text-align: right;
  flex: 1;
}

.picker-group {
  display: flex;
  gap: 16px;
  align-items: center;
}

.picker-value {
  font-size: 28px;
  color: #4A90D9;
}

.color-picker {
  display: flex;
  gap: 16px;
}

.color-dot {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 4px solid transparent;

  &.active {
    border-color: #333;
  }
}

.save-section {
  padding: 48px 32px;
}

.save-btn {
  background: #4A90D9;
  border-radius: 16px;
  padding: 24px 0;
  text-align: center;

  &.disabled {
    opacity: 0.5;
  }
}

.save-text {
  font-size: 32px;
  color: #fff;
  font-weight: 600;
}
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/event/create.tsx frontend/src/pages/event/create.scss frontend/src/pages/event/create.config.ts
git commit -m "feat: add event create/edit page with form validation"
```

---

## Task 7: 日程详情页

**Files:**
- Create: `frontend/src/pages/event/detail.tsx`
- Create: `frontend/src/pages/event/detail.scss`
- Create: `frontend/src/pages/event/detail.config.ts`

- [ ] **Step 1: 创建页面配置**

`frontend/src/pages/event/detail.config.ts`:

```typescript
export default definePageConfig({
  navigationBarTitleText: "日程详情",
});
```

- [ ] **Step 2: 创建详情页**

`frontend/src/pages/event/detail.tsx`:

```typescript
import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { getEventDetail } from "../../services/api";
import { useEventStore } from "../../stores/event";
import { useGroupStore } from "../../stores/group";
import { useAuthStore } from "../../stores/auth";
import type { EventResponse } from "../../types";
import "./detail.scss";

const VISIBILITY_LABELS: Record<string, string> = {
  public: "公开",
  busy: "仅显示忙碌",
  private: "私密",
};

function formatDateTime(iso: string, isAllDay: boolean): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (isAllDay) return date;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

export default function EventDetailPage() {
  const router = useRouter();
  const eventId = router.params.id;

  const [event, setEvent] = useState<EventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { deleteEvent } = useEventStore();
  const { groups } = useGroupStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    getEventDetail(eventId)
      .then(setEvent)
      .catch((e) => {
        Taro.showToast({ title: e.message || "加载失败", icon: "none" });
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading || !event) {
    return (
      <View className="detail-page">
        <Text className="loading-text">加载中...</Text>
      </View>
    );
  }

  const groupName = event.group_id
    ? groups.find((g) => g.id === event.group_id)?.name || "日历组"
    : "个人";
  const groupColor = event.group_id
    ? groups.find((g) => g.id === event.group_id)?.color || "#4A90D9"
    : "#999";

  const handleEdit = () => {
    Taro.navigateTo({ url: `/pages/event/create?id=${event.id}` });
  };

  const handleDelete = () => {
    Taro.showModal({
      title: "确认删除",
      content: "确定要删除这条日程吗？",
      confirmColor: "#FF4D4F",
      success: async (res) => {
        if (res.confirm) {
          try {
            await deleteEvent(event.id);
            Taro.showToast({ title: "已删除", icon: "success" });
            setTimeout(() => Taro.navigateBack(), 500);
          } catch (e: any) {
            Taro.showToast({ title: e.message || "删除失败", icon: "none" });
          }
        }
      },
    });
  };

  return (
    <View className="detail-page">
      {/* Header with edit button */}
      <View className="detail-header">
        <Text className="detail-title">{event.title}</Text>
        <Text className="edit-btn" onClick={handleEdit}>编辑</Text>
      </View>

      <View className="detail-divider" />

      {/* Info rows */}
      <View className="info-section">
        <View className="info-row">
          <Text className="info-icon">📅</Text>
          <Text className="info-text">
            {formatDateTime(event.start_time, event.is_all_day)}
          </Text>
        </View>

        {event.end_time && (
          <View className="info-row">
            <Text className="info-icon">🕐</Text>
            <Text className="info-text">
              至 {formatDateTime(event.end_time, event.is_all_day)}
            </Text>
          </View>
        )}

        {event.location ? (
          <View className="info-row">
            <Text className="info-icon">📍</Text>
            <Text className="info-text">{event.location}</Text>
          </View>
        ) : null}

        <View className="info-row">
          <Text className="info-icon">📋</Text>
          <View className="group-badge" style={{ color: groupColor, backgroundColor: groupColor + "20" }}>
            <Text>{groupName}</Text>
          </View>
        </View>

        {event.group_id && (
          <View className="info-row">
            <Text className="info-icon">👁</Text>
            <Text className="info-text">{VISIBILITY_LABELS[event.visibility] || event.visibility}</Text>
          </View>
        )}

        {event.description ? (
          <View className="info-row">
            <Text className="info-icon">📝</Text>
            <Text className="info-text">{event.description}</Text>
          </View>
        ) : null}
      </View>

      <View className="detail-divider" />

      <View className="info-section">
        <View className="info-row">
          <Text className="info-label">创建者</Text>
          <Text className="info-text">{event.creator_nickname}</Text>
        </View>
      </View>

      {/* Delete button */}
      <View className="delete-section">
        <Text className="delete-btn" onClick={handleDelete}>
          删除日程
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 创建样式**

`frontend/src/pages/event/detail.scss`:

```scss
.detail-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.loading-text {
  display: block;
  text-align: center;
  padding: 96px 0;
  color: #999;
  font-size: 28px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32px;
  background: #fff;
}

.detail-title {
  font-size: 40px;
  font-weight: 700;
  color: #1a1a1a;
  flex: 1;
}

.edit-btn {
  font-size: 28px;
  color: #4A90D9;
  font-weight: 600;
  padding: 8px 16px;
}

.detail-divider {
  height: 16px;
  background: #f8f9fa;
}

.info-section {
  background: #fff;
  padding: 8px 0;
}

.info-row {
  display: flex;
  align-items: center;
  padding: 20px 32px;
  gap: 16px;
}

.info-icon {
  font-size: 32px;
  width: 48px;
  text-align: center;
  flex-shrink: 0;
}

.info-label {
  font-size: 28px;
  color: #999;
  width: 120px;
  flex-shrink: 0;
}

.info-text {
  font-size: 28px;
  color: #333;
}

.group-badge {
  font-size: 24px;
  padding: 6px 16px;
  border-radius: 8px;
}

.delete-section {
  padding: 64px 32px;
  text-align: center;
}

.delete-btn {
  font-size: 28px;
  color: #FF4D4F;
}
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/event/detail.tsx frontend/src/pages/event/detail.scss frontend/src/pages/event/detail.config.ts
git commit -m "feat: add event detail page with edit and delete"
```

---

## Task 8: 最终验证

- [ ] **Step 1: 完整编译验证**

```bash
cd frontend && npm run build:h5 2>&1 | tail -20
```

Expected: BUILD SUCCESS，无错误

- [ ] **Step 2: 启动 H5 开发服务器验证页面渲染**

```bash
cd frontend && npm run dev:h5
```

打开浏览器访问 http://localhost:10086（Taro H5 默认端口），验证：
1. 自动登录流程（需要后端 docker-compose up 运行中）
2. 日历主页渲染：月历网格 + 日程列表
3. 点击 "+" 跳转创建页，表单可填写
4. 创建日程后返回主页，列表刷新

- [ ] **Step 3: 验证小程序编译**

```bash
cd frontend && npm run build:weapp 2>&1 | tail -10
```

Expected: BUILD SUCCESS
