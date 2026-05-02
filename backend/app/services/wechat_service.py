import logging

import httpx
import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

ACCESS_TOKEN_KEY = "wechat:access_token"


async def _get_access_token() -> str | None:
    """Get cached access_token from Redis, or fetch fresh one from WeChat."""
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        token = await redis.get(ACCESS_TOKEN_KEY)
        if token:
            return token

        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": settings.WECHAT_APP_ID,
            "secret": settings.WECHAT_APP_SECRET,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            data = resp.json()
        if "access_token" not in data:
            logger.error(f"WeChat access_token failed: {data}")
            return None
        token = data["access_token"]
        # WeChat returns expires_in=7200; cache for 7000 to be safe
        await redis.set(ACCESS_TOKEN_KEY, token, ex=7000)
        return token
    finally:
        await redis.aclose()


async def send_subscribe_message(
    openid: str,
    data: dict,
    template_id: str = "",
    page: str = "pages/calendar/index",
) -> bool:
    """Send WeChat subscribe message. Mock in dev mode."""
    if settings.DEBUG or not settings.WECHAT_APP_ID:
        logger.info(
            f"[MOCK] 推送订阅消息给 {openid}: "
            f"title={data.get('event_title')}, time={data.get('event_time')}"
        )
        return True

    tpl_id = template_id or settings.WECHAT_REMIND_TEMPLATE_ID
    if not tpl_id:
        logger.warning("WECHAT_REMIND_TEMPLATE_ID not configured")
        return False

    access_token = await _get_access_token()
    if not access_token:
        return False

    # Template "日程提醒" (template_id: _idRS9yaoezl2Zw2PVKZHGAB6FIB_1aOBaqddzbf7VI)
    # 日程名称 → thing12, 提醒事项 → thing3, 提醒时间 → time11, 事项地点 → thing4
    payload = {
        "touser": openid,
        "template_id": tpl_id,
        "page": page,
        "data": {
            "thing12": {"value": _truncate(data.get("group_name") or "个人", 20)},
            "thing3": {"value": _truncate(data.get("event_title", ""), 20)},
            "time11": {"value": _format_time(data.get("event_time", ""))},
            "thing4": {"value": _truncate(data.get("location") or "无", 20)},
        },
    }

    url = f"https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token={access_token}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload)
        result = resp.json()
    if result.get("errcode") != 0:
        logger.error(f"subscribe/send failed: openid={openid} result={result}")
        return False
    return True


def _truncate(s: str, max_len: int) -> str:
    """WeChat template thing fields are limited to 20 chars."""
    return s[: max_len - 1] + "…" if len(s) > max_len else s


def _format_time(iso: str) -> str:
    """Format ISO datetime to '2026年4月25日 15:00' for WeChat time field."""
    if not iso:
        return ""
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%Y年%m月%d日 %H:%M")
    except Exception:
        return iso[:19]


async def code2session(code: str) -> dict:
    """Call WeChat code2session API to get openid."""
    from fastapi import HTTPException
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APP_ID,
        "secret": settings.WECHAT_APP_SECRET,
        "js_code": code,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
        data = resp.json()
    if "errcode" in data and data["errcode"] != 0:
        logger.error(f"WeChat code2session failed: {data}")
        raise HTTPException(status_code=400, detail="微信登录失败")
    return data
