# 「共享日程」项目初始化技术设计

> 版本：v1.0 | 日期：2026-03-27
> 基于产品设计文档：`docs/superpowers/specs/2026-03-26-family-schedule-design.md`

---

## 一、技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 前端框架 | **Taro 4 + React + TypeScript** | React 生态强，跨端能力好（后续可出 RN App），TS 类型安全 |
| 状态管理 | **Zustand** | 轻量、简洁，适合中小型项目 |
| 后端框架 | **FastAPI (Python)** | 异步高性能，AI/LLM 集成方便，自动生成 API 文档 |
| ORM | **SQLAlchemy 2.0 (async) + Alembic** | Python 最成熟的 ORM + 迁移方案 |
| 数据库 | **PostgreSQL 15** | JSON 字段支持好，适合日程的 repeat_rule/settings 等结构 |
| 缓存 | **Redis 7** | 微信 access_token 缓存、JWT 黑名单、后续任务队列基础 |
| 容器化 | **Docker Compose** | 一键启动本地开发环境 |

---

## 二、项目结构（Monorepo）

```
family-schedule/
├── frontend/                    # Taro 微信小程序
│   ├── src/
│   │   ├── pages/              # 页面（首页、日历组、发现、我的）
│   │   ├── components/         # 公共组件
│   │   ├── services/           # API 请求封装
│   │   ├── stores/             # 状态管理（Zustand）
│   │   ├── utils/              # 工具函数
│   │   ├── types/              # TypeScript 类型定义
│   │   └── app.tsx             # 入口
│   ├── package.json
│   └── tsconfig.json
│
├── backend/
│   ├── app/
│   │   ├── api/               # 路由层（按模块拆分）
│   │   │   ├── events.py      # 日程相关接口
│   │   │   ├── groups.py      # 日历组相关接口
│   │   │   ├── users.py       # 用户相关接口
│   │   │   ├── ai.py          # AI语音创建接口
│   │   │   ├── sharing.py     # 分享相关接口
│   │   │   └── notifications.py # 通知提醒接口
│   │   ├── models/            # SQLAlchemy 数据模型
│   │   ├── schemas/           # Pydantic 请求/响应模型
│   │   ├── services/          # 业务逻辑层
│   │   ├── core/              # 配置、安全、依赖注入
│   │   └── main.py            # FastAPI 入口
│   ├── alembic/               # 数据库迁移
│   ├── tests/                 # 测试
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml          # PostgreSQL + Redis + Backend
├── docs/                       # 设计文档
├── .env.example                # 环境变量模板
└── .gitignore
```

---

## 三、后端架构

### 3.1 分层设计

```
API 路由层 (api/)  →  业务逻辑层 (services/)  →  数据层 (models/)
     ↑                      ↑
Pydantic schemas        SQLAlchemy ORM
(请求校验/响应序列化)      (数据库操作)
```

### 3.2 模块划分

| 模块 | API 路由 | Service | Model |
|------|---------|---------|-------|
| 用户体系 | `users.py` | `user_service.py` | `user.py` |
| 日程管理 | `events.py` | `event_service.py` | `event.py`, `reminder.py`, `template.py` |
| 日历组 | `groups.py` | `group_service.py` | `calendar_group.py`, `group_member.py` |
| AI语音 | `ai.py` | `ai_service.py` | — (调用 LLM API) |
| 分享 | `sharing.py` | `sharing_service.py` | — (复用 group 模型) |
| 通知提醒 | `notifications.py` | `notification_service.py` | `reminder.py` |

### 3.3 关键技术决策

- **异步优先**：FastAPI + async SQLAlchemy，所有 I/O 操作异步
- **认证**：微信 `wx.login()` → 后端用 code 换 openid → JWT token
- **配置管理**：Pydantic Settings，从环境变量读取，`.env` 文件本地开发

---

## 四、数据模型

### 4.1 实体定义

所有模型共享基础字段：`id` (UUID, 主键), `created_at`, `updated_at`

**User**

| 字段 | 类型 | 说明 |
|------|------|------|
| openid | str | 唯一索引，微信 OpenID |
| unionid | str (可选) | 唯一索引，微信 UnionID |
| nickname | str | 昵称 |
| avatar | str | 头像 URL |
| settings | JSON | 默认提醒时间、视图偏好、农历开关等 |

**CalendarGroup**

| 字段 | 类型 | 说明 |
|------|------|------|
| name | str | 组名 |
| icon | str | 图标 |
| color | str | 标识色 (#HEX) |
| description | str (可选) | 简介 |
| creator_id | FK → User | 创建者 |
| invite_code | str | 唯一索引，6位随机邀请码 |
| max_members | int | 默认10 |

**GroupMember**

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | FK → CalendarGroup | 所属组 |
| user_id | FK → User | 成员 |
| role | Enum | creator / admin / member |
| | 联合唯一 | group_id + user_id |

**Event**

| 字段 | 类型 | 说明 |
|------|------|------|
| title | str | 日程标题 |
| description | str (可选) | 描述 |
| start_time | datetime | 开始时间 |
| end_time | datetime (可选) | 结束时间 |
| is_all_day | bool | 是否全天 |
| location | str (可选) | 地点 |
| color | str (可选) | 颜色标签 |
| visibility | Enum | public / busy / private |
| repeat_rule | JSON (可选) | RRULE 格式 |
| group_id | FK → CalendarGroup (可选) | null = 个人日历 |
| creator_id | FK → User | 创建者 |
| template_id | FK → Template (可选) | 来源模板 |

**Reminder**

| 字段 | 类型 | 说明 |
|------|------|------|
| event_id | FK → Event | 关联日程 |
| user_id | FK → User | 提醒对象 |
| remind_at | datetime | 提醒时间 |
| status | Enum | pending / sent / failed |

**Template**

| 字段 | 类型 | 说明 |
|------|------|------|
| name | str | 模板名 |
| category | str | 分类 |
| preset_data | JSON | 预设数据 |
| is_system | bool | 系统预设 vs 用户自建 |
| creator_id | FK → User (可选) | 用户自建时 |
| usage_count | int | 使用次数 |

### 4.2 索引策略

| 索引 | 字段 | 用途 |
|------|------|------|
| Event 复合索引 | `(group_id, start_time)` | 按组查某时间段日程（最高频） |
| Event 复合索引 | `(creator_id, start_time)` | 查个人日程 |
| Reminder 复合索引 | `(status, remind_at)` | 定时任务扫描待发送提醒 |

---

## 五、Docker 开发环境

### 5.1 服务编排

| 服务 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| db | postgres:15 | 5432 | 数据持久化到 volume |
| redis | redis:7 | 6379 | 缓存 |
| backend | 自建 Dockerfile | 8000 | FastAPI 热重载，挂载代码目录 |

### 5.2 前端开发方式

前端不放进 Docker。Taro 开发使用微信开发者工具预览，本地 `npm run dev` 启动，通过 API 代理连接后端 `localhost:8000`。

---

## 六、初始化范围

### 6.1 本次要做

- Taro 项目初始化 + TypeScript + Zustand
- FastAPI 项目初始化 + 目录结构 + 配置管理
- SQLAlchemy 模型定义 + Alembic 迁移配置
- Docker Compose 编排（PostgreSQL + Redis + Backend）
- `.env.example` + `.gitignore`
- 微信登录 API 骨架（第一个可运行的接口）

### 6.2 本次不做

- 具体页面 UI 开发
- AI 语音功能接入
- 微信消息推送
- 云部署配置
- CI/CD

### 6.3 验收标准

1. `docker-compose up` 一键启动后端 + 数据库 + Redis
2. 访问 `http://localhost:8000/docs` 看到 FastAPI Swagger 文档
3. 数据库表已通过 Alembic 迁移创建
4. 前端 `npm run dev` 能启动 Taro 开发服务器
5. 前端能调通后端健康检查接口
