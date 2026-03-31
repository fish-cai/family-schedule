import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_subscribe_message(
    openid: str,
    data: dict,
    template_id: str = "",
    page: str = "",
) -> bool:
    """Send WeChat subscribe message. Mock in dev mode."""
    if settings.DEBUG or not settings.WECHAT_APP_ID:
        logger.info(
            f"[MOCK] 推送订阅消息给 {openid}: "
            f"title={data.get('event_title')}, time={data.get('event_time')}"
        )
        return True

    # Production: call WeChat API
    # POST https://api.weixin.qq.com/cgi-bin/message/subscribe/send
    # Requires access_token from Redis cache
    # Not implemented in MVP
    logger.warning("WeChat subscribe message not implemented for production")
    return False


async def code2session(code: str) -> dict:
    """Call WeChat code2session API to get openid."""
    import httpx
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
