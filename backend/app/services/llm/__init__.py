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
