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
