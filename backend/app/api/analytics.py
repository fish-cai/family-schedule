from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class TrackRequest(BaseModel):
    name: str = Field(max_length=64)
    properties: dict | None = None


@router.post("/track")
async def track(
    body: TrackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    db.add(AnalyticsEvent(
        user_id=current_user.id,
        name=body.name,
        properties=body.properties,
    ))
    await db.commit()
    return {"ok": True}
