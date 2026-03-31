import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.event import EventCreate, EventResponse, EventUpdate
from app.services import event_service

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    event = await event_service.create_event(db, current_user, data)
    # Reload with creator for nickname
    result = await db.execute(
        select(event.__class__)
        .where(event.__class__.id == event.id)
        .options(selectinload(event.__class__.creator))
    )
    event = result.scalar_one()
    nickname = event.creator.nickname if event.creator else ""
    d = event_service._event_to_dict(event, nickname)
    return EventResponse(**d)


@router.get("", response_model=list[EventResponse])
async def list_events(
    start: datetime = Query(...),
    end: datetime = Query(...),
    group_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EventResponse]:
    events = await event_service.query_events(db, current_user.id, start, end, group_id)
    return [EventResponse(**e) for e in events]


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    detail = await event_service.get_event_detail(db, event_id, current_user.id)
    return EventResponse(**detail)


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    updated = await event_service.update_event(db, event_id, current_user.id, data)
    return EventResponse(**updated)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await event_service.delete_event(db, event_id, current_user.id)
