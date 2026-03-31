# P0 收尾：微信订阅通知设计

> 版本：v1.0 | 日期：2026-03-31

---

## 一、范围

实现日程提醒功能：创建日程时设置提醒时间，后端定时扫描到期提醒并推送微信订阅消息（MVP 阶段 mock 推送）。

### 包含

- 后端：提醒随日程创建/更新/删除联动
- 后端：APScheduler 定时任务每分钟扫描到期提醒
- 后端：微信订阅消息推送服务（mock 模式打日志）
- 后端：提醒相关测试
- 前端：日程创建/编辑页增加"提醒"选择器

### 不包含

- 用户授权订阅弹窗（需真实 AppID）
- 微信模板消息配置（上线前配置）
- 多次提醒合并
- 提醒列表页面

---

## 二、后端设计

### 2.1 已有模型

`Reminder` 模型已在 Phase 0 创建：

```python
class Reminder(TimestampMixin, Base):
    __tablename__ = "reminders"
    event_id: UUID FK → events.id
    user_id: UUID FK → users.id
    remind_at: DateTime(timezone=True)
    status: Enum(PENDING, SENT, FAILED)
```

索引：`(status, remind_at)` — 为定时扫描优化。

### 2.2 API 变更

**EventCreate schema 扩展**：

```python
class EventCreate(BaseModel):
    # ... 已有字段 ...
    remind_minutes: list[int] | None = None  # [5, 15, 30, 60]
```

创建日程时，如果 `remind_minutes` 非空，为每个值创建一条 Reminder：
- `remind_at = start_time - timedelta(minutes=n)`
- `user_id = creator_id`
- `status = PENDING`

**EventUpdate schema 扩展**：

```python
class EventUpdate(BaseModel):
    # ... 已有字段 ...
    remind_minutes: list[int] | None = None
```

更新日程时，如果传了 `remind_minutes`：
1. 删除该事件所有 PENDING 状态的旧提醒
2. 根据新的 remind_minutes 和（可能更新后的）start_time 重新创建

**EventResponse 扩展**：

```python
class EventResponse(BaseModel):
    # ... 已有字段 ...
    remind_minutes: list[int]  # 当前生效的提醒分钟数列表
```

查询日程时，从关联的 PENDING Reminders 反推出 remind_minutes。

**删除日程**：级联删除关联的所有 Reminder。

### 2.3 Service 层

**reminder_service.py** 新建：

| 函数 | 说明 |
|------|------|
| `create_reminders(db, event, user_id, remind_minutes)` | 批量创建提醒 |
| `update_reminders(db, event, user_id, remind_minutes)` | 删旧建新 |
| `delete_reminders_for_event(db, event_id)` | 删除事件所有提醒 |
| `get_remind_minutes(db, event_id, user_id)` | 从 PENDING 提醒反推分钟数 |
| `scan_and_send(db)` | 扫描到期提醒并推送 |

**event_service.py 修改**：

- `create_event`: 创建后调用 `create_reminders`
- `update_event`: 更新后调用 `update_reminders`（如 remind_minutes 传了）
- `delete_event`: 删除前调用 `delete_reminders_for_event`
- 各查询方法：在构建 response dict 时调用 `get_remind_minutes`

### 2.4 微信推送服务

**wechat_service.py** 新建：

```python
async def send_subscribe_message(openid: str, template_id: str, data: dict, page: str = "") -> bool:
    if settings.DEBUG or not settings.WECHAT_APP_ID:
        logger.info(f"[MOCK] 推送订阅消息给 {openid}: {data}")
        return True
    # 真实模式：调用微信 API
    # POST https://api.weixin.qq.com/cgi-bin/message/subscribe/send
    # 需要 access_token（从 Redis 缓存获取）
    ...
```

### 2.5 定时任务

**scheduler.py** 新建：

使用 APScheduler，在 FastAPI startup 事件中启动：

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

async def check_reminders():
    async for db in get_db():
        await reminder_service.scan_and_send(db)

scheduler.add_job(check_reminders, "interval", minutes=1)
```

在 `main.py` 的 `@app.on_event("startup")` 中启动 scheduler。

### 2.6 scan_and_send 逻辑

```
1. SELECT * FROM reminders WHERE status = 'PENDING' AND remind_at <= now()
2. 对每条记录：
   a. 加载关联的 event 和 user
   b. 调用 wechat_service.send_subscribe_message(user.openid, ...)
   c. 成功 → status = SENT, 失败 → status = FAILED
3. commit
```

---

## 三、前端设计

### 3.1 日程创建/编辑页

在现有表单中，日历组选择器下方增加"提醒"选择器。

选项：
- 不提醒（默认）
- 5 分钟前
- 15 分钟前
- 30 分钟前
- 1 小时前

使用 Picker 组件，单选。

### 3.2 类型扩展

```typescript
// EventCreate 增加
remind_minutes?: number[];

// EventResponse 增加
remind_minutes: number[];
```

### 3.3 日程详情页

显示提醒状态：如"提前 15 分钟提醒"。

---

## 四、依赖

后端新增：`apscheduler>=3.10.0`（AsyncIOScheduler）

---

## 五、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/requirements.txt` | 修改 | 添加 apscheduler |
| `backend/app/services/reminder_service.py` | 新建 | 提醒 CRUD + 扫描推送 |
| `backend/app/services/wechat_service.py` | 新建 | 微信消息推送（mock） |
| `backend/app/services/event_service.py` | 修改 | 集成提醒创建/更新/删除 |
| `backend/app/schemas/event.py` | 修改 | 添加 remind_minutes 字段 |
| `backend/app/core/scheduler.py` | 新建 | APScheduler 定时任务 |
| `backend/app/main.py` | 修改 | 启动 scheduler |
| `backend/tests/test_reminders.py` | 新建 | 提醒相关测试 |
| `frontend/src/types/index.ts` | 修改 | 添加 remind_minutes |
| `frontend/src/pages/event/create.tsx` | 修改 | 添加提醒选择器 |
| `frontend/src/pages/event/detail.tsx` | 修改 | 显示提醒信息 |
