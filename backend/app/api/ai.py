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
