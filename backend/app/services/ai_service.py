import json
import logging
import re
from datetime import datetime, timedelta
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
    tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after = (now + timedelta(days=2)).strftime("%Y-%m-%d")
    weekday = WEEKDAY_NAMES[now.weekday()]
    return SYSTEM_PROMPT_TEMPLATE.format(
        now=now.strftime("%Y-%m-%d %H:%M"),
        weekday=weekday,
        tomorrow=tomorrow,
        day_after=day_after,
    )


def extract_json(text: str) -> dict:
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        text = match.group(1)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def validate_parsed_event(data: dict) -> None:
    if "title" not in data or not data["title"]:
        raise ValueError("Missing title")
    if "start_time" not in data or not data["start_time"]:
        raise ValueError("Missing start_time")


async def parse_event_text(text: str) -> dict:
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
