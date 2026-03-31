# P1 AI 智能创建日程 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户输入自然语言，LLM 解析为结构化日程数据（含重复规则），跳转创建页预填充确认后保存。

**Architecture:** 后端新增 AI 解析 API，LLM 调用抽象为 provider 接口（默认 DeepSeek），Prompt 引导 LLM 输出固定 JSON schema。前端日历主页新增 AI 入口弹窗，创建页支持接收预填充参数。

**Tech Stack:** FastAPI, httpx (LLM API 调用), DeepSeek API, Taro 4, React 18, TypeScript, Zustand

---

## Task 1: 后端 LLM 抽象层 + DeepSeek 实现

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`
- Create: `backend/app/services/llm/__init__.py`
- Create: `backend/app/services/llm/base.py`
- Create: `backend/app/services/llm/deepseek.py`

- [ ] **Step 1: 扩展配置**

在 `backend/app/core/config.py` 的 Settings 类中，在 WeChat 配置后面添加：

```python
    # LLM
    LLM_PROVIDER: str = "deepseek"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"
```

在 `backend/.env.example` 末尾追加：

```
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
```

- [ ] **Step 2: 创建 LLM base**

`backend/app/services/llm/base.py`:

```python
from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, system_prompt: str, user_message: str) -> str:
        """Send a chat message and return the assistant's response text."""
        ...
```

- [ ] **Step 3: 创建 DeepSeek provider**

`backend/app/services/llm/deepseek.py`:

```python
import httpx

from app.services.llm.base import LLMProvider


class DeepSeekProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "deepseek-chat"):
        self.api_key = api_key
        self.model = model
        self.base_url = "https://api.deepseek.com"

    async def chat(self, system_prompt: str, user_message: str) -> str:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.1,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
```

- [ ] **Step 4: 创建 provider 工厂**

`backend/app/services/llm/__init__.py`:

```python
from app.core.config import settings
from app.services.llm.base import LLMProvider
from app.services.llm.deepseek import DeepSeekProvider


def get_llm_provider() -> LLMProvider:
    if settings.LLM_PROVIDER == "deepseek":
        return DeepSeekProvider(
            api_key=settings.DEEPSEEK_API_KEY,
            model=settings.DEEPSEEK_MODEL,
        )
    raise ValueError(f"Unknown LLM provider: {settings.LLM_PROVIDER}")
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/.env.example backend/app/services/llm/
git commit -m "feat: add LLM provider abstraction with DeepSeek implementation"
```

---

## Task 2: 后端 AI 解析服务 + API 路由

**Files:**
- Create: `backend/app/services/ai_service.py`
- Create: `backend/app/schemas/ai.py`
- Create: `backend/app/api/ai.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 创建 AI schema**

`backend/app/schemas/ai.py`:

```python
from pydantic import BaseModel, Field


class ParseEventRequest(BaseModel):
    text: str = Field(min_length=2, max_length=500)
```

- [ ] **Step 2: 创建 AI service**

`backend/app/services/ai_service.py`:

```python
import json
import logging
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status

from app.services.llm import get_llm_provider

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]

SYSTEM_PROMPT_TEMPLATE = """你是一个日程解析助手。当前时间是 {now}（{weekday}）。

用户会用自然语言描述一个日程，请解析为以下 JSON 格式。只输出 JSON，不要输出任何其他文字。

{{
  "title": "日程标题（简洁）",
  "start_time": "ISO 8601 格式，含时区 +08:00",
  "end_time": "ISO 8601 格式，含时区 +08:00，或 null",
  "is_all_day": false,
  "location": "地点，没有则空字符串",
  "description": "补充描述，没有则空字符串",
  "repeat_rule": null
}}

repeat_rule 格式（如果有重复）：
{{
  "freq": "daily" 或 "weekly" 或 "monthly",
  "interval": 1,
  "byday": ["MO","TU","WE","TH","FR","SA","SU"] (仅 weekly 时使用)
}}

规则：
- "明天"指 {tomorrow}
- "后天"指 {day_after}
- 如果没有指定结束时间，默认持续 1 小时
- 如果没有指定具体时间但有日期，设为全天事件（is_all_day=true，start_time 为当天 00:00，end_time 为当天 23:59）
- "每天"→ freq=daily
- "每周X"→ freq=weekly + 对应 byday
- "每月X号"→ freq=monthly
- start_time 取最近的下一个匹配时间
- 星期对应：周一=MO 周二=TU 周三=WE 周四=TH 周五=FR 周六=SA 周日=SU"""


def build_system_prompt() -> str:
    tz = ZoneInfo("Asia/Shanghai")
    now = datetime.now(tz)
    tomorrow = now.replace(hour=0, minute=0, second=0) + __import__("datetime").timedelta(days=1)
    day_after = tomorrow + __import__("datetime").timedelta(days=1)
    weekday = WEEKDAY_NAMES[now.weekday()]
    return SYSTEM_PROMPT_TEMPLATE.format(
        now=now.strftime("%Y-%m-%d %H:%M"),
        weekday=weekday,
        tomorrow=tomorrow.strftime("%Y-%m-%d"),
        day_after=day_after.strftime("%Y-%m-%d"),
    )


def extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    # Try to find JSON in code blocks first
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        text = match.group(1)
    # Try to parse as JSON
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find the first { ... } block
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def validate_parsed_event(data: dict) -> None:
    """Validate that parsed data has required fields."""
    if "title" not in data or not data["title"]:
        raise ValueError("Missing title")
    if "start_time" not in data or not data["start_time"]:
        raise ValueError("Missing start_time")


async def parse_event_text(text: str) -> dict:
    """Parse natural language into structured event data using LLM."""
    provider = get_llm_provider()
    system_prompt = build_system_prompt()

    try:
        response = await provider.chat(system_prompt, text)
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 服务暂时不可用，请稍后再试",
        )

    try:
        parsed = extract_json(response)
        validate_parsed_event(parsed)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(f"LLM response parse failed: {e}, response: {response[:200]}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无法解析日程信息，请尝试更清晰的描述",
        )

    return parsed
```

- [ ] **Step 3: 创建 AI 路由**

`backend/app/api/ai.py`:

```python
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.ai import ParseEventRequest
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/parse-event")
async def parse_event(
    body: ParseEventRequest,
    current_user: User = Depends(get_current_user),
):
    result = await ai_service.parse_event_text(body.text)
    return result
```

- [ ] **Step 4: 注册路由**

在 `backend/app/main.py` 中添加：

```python
from app.api.ai import router as ai_router
# ...
app.include_router(ai_router)
```

- [ ] **Step 5: 运行现有测试确认无破坏**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: 41 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai_service.py backend/app/schemas/ai.py backend/app/api/ai.py backend/app/main.py
git commit -m "feat: add AI event parsing API with LLM-powered natural language processing"
```

---

## Task 3: 后端 AI 解析测试（mock LLM）

**Files:**
- Create: `backend/tests/test_ai.py`

- [ ] **Step 1: 创建测试文件**

`backend/tests/test_ai.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest


MOCK_LLM_RESPONSE_SIMPLE = """{
  "title": "开会",
  "start_time": "2026-04-01T14:00:00+08:00",
  "end_time": "2026-04-01T15:00:00+08:00",
  "is_all_day": false,
  "location": "会议室",
  "description": "",
  "repeat_rule": null
}"""

MOCK_LLM_RESPONSE_REPEAT = """{
  "title": "接小明放学",
  "start_time": "2026-04-02T15:00:00+08:00",
  "end_time": "2026-04-02T16:00:00+08:00",
  "is_all_day": false,
  "location": "学校门口",
  "description": "",
  "repeat_rule": {
    "freq": "weekly",
    "interval": 1,
    "byday": ["WE"]
  }
}"""

MOCK_LLM_RESPONSE_ALLDAY = """{
  "title": "小明生日",
  "start_time": "2026-05-01T00:00:00+08:00",
  "end_time": "2026-05-01T23:59:00+08:00",
  "is_all_day": true,
  "location": "",
  "description": "",
  "repeat_rule": null
}"""

MOCK_LLM_RESPONSE_CODEBLOCK = """```json
{
  "title": "瑜伽课",
  "start_time": "2026-04-01T19:00:00+08:00",
  "end_time": "2026-04-01T20:00:00+08:00",
  "is_all_day": false,
  "location": "健身房",
  "description": "",
  "repeat_rule": null
}
```"""


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_simple_event(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = MOCK_LLM_RESPONSE_SIMPLE
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "明天下午2点在会议室开会"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "开会"
    assert data["location"] == "会议室"
    assert data["repeat_rule"] is None


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_repeat_event(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = MOCK_LLM_RESPONSE_REPEAT
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "每周三下午3点在学校门口接小明放学"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "接小明放学"
    assert data["repeat_rule"]["freq"] == "weekly"
    assert "WE" in data["repeat_rule"]["byday"]


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_allday_event(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = MOCK_LLM_RESPONSE_ALLDAY
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "5月1号小明生日"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_all_day"] is True
    assert data["title"] == "小明生日"


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_codeblock_response(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = MOCK_LLM_RESPONSE_CODEBLOCK
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "今晚7点去健身房上瑜伽课"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "瑜伽课"


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_llm_error(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.side_effect = Exception("API timeout")
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "明天开会"},
        headers=headers,
    )
    assert resp.status_code == 502


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_invalid_response(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = "I cannot understand that request."
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "asdfghjkl"},
        headers=headers,
    )
    assert resp.status_code == 400


async def test_parse_event_no_auth(client):
    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "明天开会"},
    )
    assert resp.status_code == 403


async def test_parse_event_empty_text(client, user_a):
    _, headers = user_a
    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": ""},
        headers=headers,
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && python -m pytest tests/test_ai.py -v --tb=short
```

Expected: 8 passed

- [ ] **Step 3: 运行全部测试**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: 49 passed (41 existing + 8 new)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_ai.py
git commit -m "test: add 8 AI event parsing tests with mocked LLM"
```

---

## Task 4: 前端类型 + API 扩展

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 添加类型**

在 `frontend/src/types/index.ts` 末尾追加：

```typescript
export interface ParseEventResponse {
  title: string;
  start_time: string;
  end_time: string | null;
  is_all_day: boolean;
  location: string;
  description: string;
  repeat_rule: {
    freq: "daily" | "weekly" | "monthly";
    interval: number;
    byday?: string[];
  } | null;
}
```

- [ ] **Step 2: 添加 API 方法**

在 `frontend/src/services/api.ts` 末尾追加：

```typescript
// AI
export async function parseEvent(text: string): Promise<ParseEventResponse> {
  return request<ParseEventResponse>({
    url: "/api/ai/parse-event",
    method: "POST",
    data: { text },
  });
}
```

同时在 import 中添加 `ParseEventResponse`：

```typescript
import type {
  // ... existing imports ...
  ParseEventResponse,
} from "../types";
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat: add AI parse event type and API method"
```

---

## Task 5: 前端 AI 输入弹窗组件

**Files:**
- Create: `frontend/src/components/ai-input/index.tsx`
- Create: `frontend/src/components/ai-input/index.scss`

- [ ] **Step 1: 创建组件**

`frontend/src/components/ai-input/index.tsx`:

```typescript
import { useState } from "react";
import { View, Text, Input } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { parseEvent } from "../../services/api";
import "./index.scss";

interface AiInputProps {
  visible: boolean;
  selectedDate: string;
  onClose: () => void;
}

export default function AiInput({ visible, selectedDate, onClose }: AiInputProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Taro.showToast({ title: "请输入日程描述", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      const result = await parseEvent(trimmed);
      const encoded = encodeURIComponent(JSON.stringify(result));
      onClose();
      setText("");
      Taro.navigateTo({
        url: `/pages/event/create?date=${selectedDate}&ai_result=${encoded}`,
      });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "解析失败，请重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="ai-overlay" onClick={onClose}>
      <View className="ai-panel" onClick={(e) => e.stopPropagation()}>
        <View className="ai-header">
          <Text className="ai-title">AI 智能创建</Text>
          <Text className="ai-close" onClick={onClose}>×</Text>
        </View>
        <View className="ai-body">
          <Input
            className="ai-input"
            placeholder="描述你的日程，如"明天下午3点开会""
            value={text}
            onInput={(e) => setText(e.detail.value)}
            maxlength={500}
            confirmType="send"
            onConfirm={handleSend}
          />
          <View
            className={`ai-send ${loading || !text.trim() ? "disabled" : ""}`}
            onClick={!loading && text.trim() ? handleSend : undefined}
          >
            <Text className="ai-send-text">{loading ? "解析中..." : "发送"}</Text>
          </View>
        </View>
        <Text className="ai-hint">
          支持自然语言，如"每周三下午3点接小明放学"、"下周五全天团建"
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: 创建样式**

`frontend/src/components/ai-input/index.scss`:

```scss
.ai-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
}

.ai-panel {
  width: 100%;
  background: #fff;
  border-radius: 24px 24px 0 0;
  padding: 32px;
  padding-bottom: 64px;
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.ai-title {
  font-size: 32px;
  font-weight: 600;
  color: #1a1a1a;
}

.ai-close {
  font-size: 40px;
  color: #999;
  padding: 8px;
  line-height: 1;
}

.ai-body {
  display: flex;
  gap: 12px;
  align-items: center;
}

.ai-input {
  flex: 1;
  font-size: 28px;
  padding: 20px 24px;
  background: #f5f5f5;
  border-radius: 12px;
}

.ai-send {
  background: #4A90D9;
  border-radius: 12px;
  padding: 20px 24px;
  flex-shrink: 0;

  &.disabled {
    opacity: 0.5;
  }
}

.ai-send-text {
  font-size: 28px;
  color: #fff;
  font-weight: 600;
}

.ai-hint {
  font-size: 22px;
  color: #bbb;
  margin-top: 16px;
  display: block;
}
```

- [ ] **Step 3: 验证编译 + Commit**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
git add frontend/src/components/ai-input/
git commit -m "feat: add AI input bottom sheet component"
```

---

## Task 6: 日历主页 FAB 改造

**Files:**
- Modify: `frontend/src/pages/calendar/index.tsx`
- Modify: `frontend/src/pages/calendar/index.scss`

- [ ] **Step 1: 改造日历主页**

在 `frontend/src/pages/calendar/index.tsx` 中：

1. 添加 import：
```typescript
import { useState } from "react";  // 添加 useState
import AiInput from "../../components/ai-input";
```

2. 在组件内添加状态：
```typescript
const [showFabMenu, setShowFabMenu] = useState(false);
const [showAiInput, setShowAiInput] = useState(false);
```

3. 替换底部 FAB 部分（替换 `{/* FAB */}` 到 `</View>` 之间的 FAB 代码）：

```tsx
      {/* FAB Menu */}
      {showFabMenu && (
        <View className="fab-overlay" onClick={() => setShowFabMenu(false)}>
          <View className="fab-menu">
            <View className="fab-menu-item" onClick={(e) => { e.stopPropagation(); setShowFabMenu(false); handleCreate(); }}>
              <Text className="fab-menu-icon">✏️</Text>
              <Text className="fab-menu-label">手动创建</Text>
            </View>
            <View className="fab-menu-item" onClick={(e) => { e.stopPropagation(); setShowFabMenu(false); setShowAiInput(true); }}>
              <Text className="fab-menu-icon">🤖</Text>
              <Text className="fab-menu-label">AI 创建</Text>
            </View>
          </View>
        </View>
      )}

      {/* FAB Button */}
      <View className="fab" onClick={() => setShowFabMenu(!showFabMenu)}>
        <Text className="fab-icon">{showFabMenu ? "×" : "+"}</Text>
      </View>

      {/* AI Input */}
      <AiInput
        visible={showAiInput}
        selectedDate={selectedDate.toISOString().slice(0, 10)}
        onClose={() => setShowAiInput(false)}
      />
```

- [ ] **Step 2: 添加 FAB 菜单样式**

在 `frontend/src/pages/calendar/index.scss` 末尾追加：

```scss
.fab-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 99;
}

.fab-menu {
  position: fixed;
  right: 40px;
  bottom: 180px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  z-index: 100;
}

.fab-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  padding: 16px 24px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.fab-menu-icon {
  font-size: 32px;
}

.fab-menu-label {
  font-size: 28px;
  color: #333;
  font-weight: 500;
}
```

Also update the existing `.fab` to add z-index:

```scss
.fab {
  // ... existing styles ...
  z-index: 100;
}
```

- [ ] **Step 3: 验证编译 + Commit**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
git add frontend/src/pages/calendar/index.tsx frontend/src/pages/calendar/index.scss
git commit -m "feat: add AI create entry to calendar FAB menu"
```

---

## Task 7: 创建页支持 AI 预填充 + 重复规则显示

**Files:**
- Modify: `frontend/src/pages/event/create.tsx`
- Modify: `frontend/src/pages/event/create.scss`

- [ ] **Step 1: 创建页支持 ai_result 参数**

在 `frontend/src/pages/event/create.tsx` 中：

1. 添加 repeat_rule state：
```typescript
const [repeatRule, setRepeatRule] = useState<Record<string, any> | null>(null);
```

2. 在读取 router params 的地方（`const initialDate = ...` 之后），添加：
```typescript
const aiResultParam = router.params.ai_result || null;
```

3. 添加 useEffect 来处理 AI 预填充（在 fetchGroups 的 useEffect 之后）：
```typescript
  useEffect(() => {
    if (aiResultParam && !isEdit) {
      try {
        const result = JSON.parse(decodeURIComponent(aiResultParam));
        if (result.title) setTitle(result.title);
        if (result.is_all_day !== undefined) setIsAllDay(result.is_all_day);
        if (result.start_time) {
          const start = new Date(result.start_time);
          setStartDate(toDateStr(start));
          setStartTime(toTimeStr(start));
        }
        if (result.end_time) {
          const end = new Date(result.end_time);
          setEndDate(toDateStr(end));
          setEndTime(toTimeStr(end));
        }
        if (result.location) setLocation(result.location);
        if (result.description) {
          // description is not in current form state, skip for now
        }
        if (result.repeat_rule) setRepeatRule(result.repeat_rule);
      } catch (e) {
        console.error("Failed to parse ai_result:", e);
      }
    }
  }, [aiResultParam, isEdit]);
```

4. 在 handleSave 中，将 repeat_rule 传给 API。在创建模式的 `const data: EventCreate = {...}` 中添加：
```typescript
repeat_rule: repeatRule || undefined,
```

5. 在表单的 reminder picker 之前，添加 repeat_rule 只读显示：

```tsx
      {/* Repeat rule (read-only, from AI) */}
      {repeatRule && (
        <View className="form-row">
          <Text className="form-label">重复</Text>
          <Text className="repeat-text">{formatRepeatRule(repeatRule)}</Text>
        </View>
      )}
```

6. 添加 formatRepeatRule 辅助函数（在组件外部）：

```typescript
function formatRepeatRule(rule: Record<string, any>): string {
  if (!rule || !rule.freq) return "";
  const dayMap: Record<string, string> = {
    MO: "一", TU: "二", WE: "三", TH: "四", FR: "五", SA: "六", SU: "日",
  };
  if (rule.freq === "daily") return "每天重复";
  if (rule.freq === "weekly" && rule.byday) {
    const days = rule.byday.map((d: string) => "周" + (dayMap[d] || d)).join("、");
    return `每周${days}重复`;
  }
  if (rule.freq === "monthly") return "每月重复";
  return "重复";
}
```

- [ ] **Step 2: 添加样式**

在 `frontend/src/pages/event/create.scss` 中追加：

```scss
.repeat-text {
  font-size: 28px;
  color: #4A90D9;
}
```

- [ ] **Step 3: 验证编译 + Commit**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
git add frontend/src/pages/event/create.tsx frontend/src/pages/event/create.scss
git commit -m "feat: support AI prefill and repeat rule display in event create page"
```

---

## Task 8: 最终验证

- [ ] **Step 1: 后端全量测试**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: 49 passed

- [ ] **Step 2: 前端 H5 编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

Expected: compiled successfully

- [ ] **Step 3: 前端微信小程序编译**

```bash
cd frontend && npm run build:weapp 2>&1 | grep -E "(Compiled|Error)"
```

Expected: Compiled successfully
