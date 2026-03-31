# P1：AI 智能创建日程设计

> 版本：v1.0 | 日期：2026-03-31

---

## 一、范围

用户输入自然语言描述，后端通过 LLM 解析为结构化日程数据，跳转创建页预填充，用户确认后保存。支持重复规则识别。

### 包含

- 后端：`POST /api/ai/parse-event` 解析接口
- 后端：LLM 调用抽象层（可配置 provider）
- 后端：DeepSeek 默认实现
- 后端：Prompt 设计（含重复规则、相对日期解析）
- 前端：日历主页 AI 入口（底部半屏文字输入弹窗）
- 前端：创建页接收预填充参数（含 repeat_rule 只读显示）
- 后端：解析接口测试

### 不包含

- 语音输入（后续迭代，文字 → 语音只是输入方式扩展）
- 多轮对话修正
- 完整的重复规则编辑 UI（仅只读显示 LLM 解析结果）

---

## 二、核心流程

```
用户点击 AI 入口
  → 弹出文字输入框
  → 输入"每周三下午3点在学校门口接小明放学"
  → POST /api/ai/parse-event { text: "..." }
  → LLM 返回结构化 JSON
  → 跳转创建页，字段自动填充
  → 用户确认/修改后保存
```

---

## 三、后端设计

### 3.1 API

**`POST /api/ai/parse-event`**

请求体：
```json
{
  "text": "每周三下午3点在学校门口接小明放学"
}
```

响应 200：
```json
{
  "title": "接小明放学",
  "start_time": "2026-04-01T15:00:00+08:00",
  "end_time": "2026-04-01T16:00:00+08:00",
  "is_all_day": false,
  "location": "学校门口",
  "description": "",
  "repeat_rule": {
    "freq": "weekly",
    "interval": 1,
    "byday": ["WE"]
  }
}
```

错误响应：
- 400：无法解析（LLM 返回格式错误或无法识别）
- 429：LLM API 限流

### 3.2 LLM 抽象层

```
backend/app/services/llm/
├── base.py          # LLMProvider 抽象基类
├── deepseek.py      # DeepSeek 实现（默认）
└── __init__.py      # get_llm_provider() 工厂函数
```

**base.py**:
```python
from abc import ABC, abstractmethod

class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, system_prompt: str, user_message: str) -> str:
        """Send a message and return the response text."""
        ...
```

**deepseek.py**:
```python
class DeepSeekProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "deepseek-chat"):
        self.api_key = api_key
        self.model = model

    async def chat(self, system_prompt: str, user_message: str) -> str:
        # POST https://api.deepseek.com/chat/completions
        # Headers: Authorization: Bearer {api_key}
        # Body: { model, messages: [{role: system, content}, {role: user, content}] }
        # Use httpx async client
        ...
```

**__init__.py**:
```python
def get_llm_provider() -> LLMProvider:
    if settings.LLM_PROVIDER == "deepseek":
        return DeepSeekProvider(api_key=settings.DEEPSEEK_API_KEY, model=settings.DEEPSEEK_MODEL)
    # 未来可扩展 claude, openai
    raise ValueError(f"Unknown LLM provider: {settings.LLM_PROVIDER}")
```

### 3.3 AI Service

**`backend/app/services/ai_service.py`**:

```python
async def parse_event_text(text: str) -> dict:
    provider = get_llm_provider()
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    system_prompt = build_system_prompt(now)
    response = await provider.chat(system_prompt, text)
    parsed = extract_json(response)  # 从 LLM 响应中提取 JSON
    validate_parsed_event(parsed)     # 校验必填字段
    return parsed
```

### 3.4 Prompt 设计

```
你是一个日程解析助手。当前时间是 {now_iso}（{weekday_chinese}）。

用户会用自然语言描述一个日程，请解析为以下 JSON 格式（只输出 JSON，不要其他文字）：

{
  "title": "日程标题（简洁）",
  "start_time": "ISO 8601 格式，含时区 +08:00",
  "end_time": "ISO 8601 格式 或 null",
  "is_all_day": false,
  "location": "地点，没有则空字符串",
  "description": "补充描述，没有则空字符串",
  "repeat_rule": null 或 {"freq": "daily|weekly|monthly", "interval": 1, "byday": ["MO","TU",...]}
}

规则：
- "明天"指 {tomorrow}，"后天"指 {day_after}，"下周一"指 {next_monday} 等
- 如果没有指定结束时间，默认持续 1 小时
- 如果没有指定具体时间但有日期，设为全天事件
- "每天"→ freq=daily，"每周X"→ freq=weekly+byday，"每月X号"→ freq=monthly
- start_time 取最近的下一个匹配时间（如"每周三"取下一个周三）
```

### 3.5 配置扩展

在 `backend/app/core/config.py` 的 Settings 中添加：

```python
# LLM
LLM_PROVIDER: str = "deepseek"
DEEPSEEK_API_KEY: str = ""
DEEPSEEK_MODEL: str = "deepseek-chat"
```

在 `.env.example` 中添加：

```
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
```

### 3.6 路由

新建 `backend/app/api/ai.py`:

```python
router = APIRouter(prefix="/api/ai", tags=["ai"])

@router.post("/parse-event")
async def parse_event(body: ParseEventRequest, current_user = Depends(get_current_user)):
    result = await ai_service.parse_event_text(body.text)
    return result
```

Schema:
```python
class ParseEventRequest(BaseModel):
    text: str = Field(min_length=2, max_length=500)
```

注册到 `main.py`。

---

## 四、前端设计

### 4.1 日历主页改造

FAB 按钮从单个 "+" 改为展开菜单：
- 点击 FAB → 展开两个选项：
  - "手动创建"（笔图标）→ 跳转创建页
  - "AI 创建"（对话图标）→ 打开文字输入弹窗
- 再次点击或点击遮罩收起

### 4.2 AI 输入弹窗

底部半屏弹窗：
- 输入框 + 发送按钮
- placeholder："描述你的日程，如"明天下午3点开会""
- 发送后显示加载状态
- 解析成功 → 关闭弹窗 → 跳转创建页（URL 参数传递解析结果）
- 解析失败 → 显示错误提示，保留输入内容

### 4.3 创建页接收解析结果

创建页通过 URL 参数 `?ai_result=encodeURIComponent(JSON)` 接收预填充数据。

页面加载时检查 `ai_result` 参数，如有则解析 JSON 填充各字段。

### 4.4 重复规则只读显示

创建页增加一行显示 repeat_rule（如果有）：
- "每周三重复" / "每天重复" / "每月15号重复"
- 只读文本，不可编辑
- 保存时原样传给后端

### 4.5 新增文件

| 文件 | 说明 |
|------|------|
| `frontend/src/components/ai-input/index.tsx` | AI 输入弹窗组件 |
| `frontend/src/components/ai-input/index.scss` | 弹窗样式 |
| `frontend/src/services/api.ts` | 添加 parseEvent API 方法 |
| `frontend/src/types/index.ts` | 添加 ParseEventResponse 类型 |
| `frontend/src/pages/calendar/index.tsx` | 改造 FAB 按钮 |
| `frontend/src/pages/event/create.tsx` | 支持 ai_result 参数 + repeat_rule 显示 |

---

## 五、后端文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/core/config.py` | 修改 | 添加 LLM 配置 |
| `backend/.env.example` | 修改 | 添加 LLM 环境变量 |
| `backend/app/services/llm/__init__.py` | 新建 | Provider 工厂 |
| `backend/app/services/llm/base.py` | 新建 | 抽象基类 |
| `backend/app/services/llm/deepseek.py` | 新建 | DeepSeek 实现 |
| `backend/app/services/ai_service.py` | 新建 | 解析逻辑 + prompt |
| `backend/app/schemas/ai.py` | 新建 | ParseEventRequest |
| `backend/app/api/ai.py` | 新建 | AI 路由 |
| `backend/app/main.py` | 修改 | 注册 AI 路由 |
| `backend/tests/test_ai.py` | 新建 | 解析测试（mock LLM） |
