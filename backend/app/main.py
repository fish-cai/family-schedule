from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.ai import router as ai_router
from app.api.events import router as events_router
from app.api.groups import router as groups_router
from app.api.users import router as users_router
from app.core.config import settings
from app.core.database import async_session_maker
from app.core.scheduler import start_scheduler, stop_scheduler

app = FastAPI(
    title=settings.APP_NAME,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(groups_router)
app.include_router(events_router)
app.include_router(ai_router)


@app.on_event("startup")
async def startup():
    start_scheduler()


@app.on_event("shutdown")
async def shutdown():
    stop_scheduler()


@app.get("/health")
async def health_check():
    checks = {"api": "ok"}

    # DB check
    try:
        async with async_session_maker() as db:
            await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"

    # Redis check
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    status_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        content={
            "status": "ok" if status_ok else "degraded",
            "service": settings.APP_NAME,
            "checks": checks,
        },
        status_code=200 if status_ok else 503,
    )
