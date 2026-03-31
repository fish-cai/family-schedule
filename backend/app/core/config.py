from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "共享日程 API"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/family_schedule"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # WeChat
    WECHAT_APP_ID: str = ""
    WECHAT_APP_SECRET: str = ""

    # LLM
    LLM_PROVIDER: str = "deepseek"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
