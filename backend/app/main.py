from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.groups import router as groups_router
from app.api.users import router as users_router
from app.core.config import settings

app = FastAPI(title=settings.APP_NAME, docs_url="/docs", redoc_url="/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(groups_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}
