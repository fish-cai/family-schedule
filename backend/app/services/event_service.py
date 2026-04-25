import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.event import Event, EventVisibility
from app.models.group_member import GroupMember, MemberRole
from app.models.user import User
from app.schemas.event import EventCreate, EventUpdate
from app.services.group_service import get_member_role
from app.services.reminder_service import (
    create_reminders,
    delete_reminders_for_event,
    get_remind_minutes,
    update_reminders,
)

BYDAY_MAP = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def _expand_recurring(event_dict: dict, query_start: datetime, query_end: datetime) -> list[dict]:
    """Expand a recurring event into virtual instances within the query range."""
    rule = event_dict.get("repeat_rule")
    if not rule or not rule.get("freq"):
        return [event_dict]

    freq = rule["freq"]
    interval = rule.get("interval", 1)
    byday = rule.get("byday")

    tz = ZoneInfo("Asia/Shanghai")
    orig_start = event_dict["start_time"]
    if isinstance(orig_start, str):
        orig_start = datetime.fromisoformat(orig_start)
    if orig_start.tzinfo is None:
        orig_start = orig_start.replace(tzinfo=tz)

    orig_end = event_dict.get("end_time")
    duration = None
    if orig_end:
        if isinstance(orig_end, str):
            orig_end = datetime.fromisoformat(orig_end)
        if orig_end.tzinfo is None:
            orig_end = orig_end.replace(tzinfo=tz)
        duration = orig_end - orig_start

    # Ensure query times are tz-aware
    if query_start.tzinfo is None:
        query_start = query_start.replace(tzinfo=tz)
    if query_end.tzinfo is None:
        query_end = query_end.replace(tzinfo=tz)

    instances = []
    # Limit expansion to 90 days max to prevent runaway loops
    max_date = min(query_end, orig_start + timedelta(days=90))

    if freq == "daily":
        cur = orig_start
        while cur <= max_date:
            if cur >= query_start - timedelta(days=1):
                inst = dict(event_dict)
                inst["start_time"] = cur
                inst["end_time"] = cur + duration if duration else None
                instances.append(inst)
            cur += timedelta(days=interval)

    elif freq == "weekly" and byday:
        target_days = [BYDAY_MAP[d] for d in byday if d in BYDAY_MAP]
        cur = orig_start - timedelta(days=orig_start.weekday())  # Monday of that week
        while cur <= max_date:
            for wd in target_days:
                day = cur + timedelta(days=wd)
                if day < orig_start:
                    continue
                if day > max_date:
                    break
                if day >= query_start - timedelta(days=1):
                    inst = dict(event_dict)
                    inst["start_time"] = day.replace(
                        hour=orig_start.hour, minute=orig_start.minute, second=orig_start.second
                    )
                    inst["end_time"] = inst["start_time"] + duration if duration else None
                    instances.append(inst)
            cur += timedelta(weeks=interval)

    elif freq == "monthly":
        target_day = orig_start.day
        cur_month = orig_start.replace(day=1)
        while cur_month <= max_date:
            try:
                day = cur_month.replace(day=target_day)
            except ValueError:
                cur_month = (cur_month + timedelta(days=32)).replace(day=1)
                continue
            if day >= orig_start and day >= query_start - timedelta(days=1) and day <= max_date:
                inst = dict(event_dict)
                inst["start_time"] = day
                inst["end_time"] = day + duration if duration else None
                instances.append(inst)
            cur_month = (cur_month + timedelta(days=32)).replace(day=1)

    return instances if instances else [event_dict]


def _event_to_dict(
    event: Event, creator_nickname: str, remind_minutes: list[int] | None = None
) -> dict:
    return {
        "id": str(event.id),
        "title": event.title,
        "description": event.description,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "is_all_day": event.is_all_day,
        "location": event.location,
        "color": event.color,
        "visibility": event.visibility.value,
        "repeat_rule": event.repeat_rule,
        "group_id": str(event.group_id) if event.group_id else None,
        "creator_id": str(event.creator_id),
        "creator_nickname": creator_nickname,
        "created_at": event.created_at,
        "remind_minutes": remind_minutes or [],
    }


def _event_to_busy_dict(event: Event) -> dict:
    return {
        "id": str(event.id),
        "title": "有安排",
        "description": "",
        "start_time": event.start_time,
        "end_time": event.end_time,
        "is_all_day": event.is_all_day,
        "location": "",
        "color": "",
        "visibility": event.visibility.value,
        "repeat_rule": None,
        "group_id": str(event.group_id) if event.group_id else None,
        "creator_id": str(event.creator_id),
        "creator_nickname": "",
        "created_at": event.created_at,
        "remind_minutes": [],
    }


async def create_event(db: AsyncSession, user: User, data: EventCreate) -> Event:
    group_id = uuid.UUID(data.group_id) if data.group_id else None

    if group_id is not None:
        role = await get_member_role(db, group_id, user.id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="非组内成员，无法创建日程",
            )

    event = Event(
        title=data.title,
        description=data.description,
        start_time=data.start_time,
        end_time=data.end_time,
        is_all_day=data.is_all_day,
        location=data.location,
        color=data.color,
        visibility=data.visibility,
        repeat_rule=data.repeat_rule,
        group_id=group_id,
        creator_id=user.id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    if data.remind_minutes:
        await create_reminders(db, event, user.id, data.remind_minutes)
        await db.commit()

    return event


async def query_events(
    db: AsyncSession,
    user_id: uuid.UUID,
    start: datetime,
    end: datetime,
    group_id: uuid.UUID | None = None,
) -> list[dict]:
    # Match events that either fall in range OR have a repeat rule (starting before range end)
    time_filter = (
        or_(
            # Normal events in range
            (Event.start_time < end) & or_(Event.end_time > start, Event.end_time.is_(None)),
            # Recurring events that started before range end
            (Event.repeat_rule.isnot(None)) & (Event.start_time < end),
        ),
    )

    if group_id is not None:
        role = await get_member_role(db, group_id, user_id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="非组内成员，无法查看日程",
            )

        result = await db.execute(
            select(Event)
            .where(
                Event.group_id == group_id,
                *time_filter,
            )
            .options(selectinload(Event.creator))
            .order_by(Event.start_time)
        )
        events = result.scalars().all()
    else:
        # Get all groups user belongs to
        member_result = await db.execute(
            select(GroupMember.group_id).where(GroupMember.user_id == user_id)
        )
        group_ids = [row[0] for row in member_result.all()]

        # Personal events + events in groups the user belongs to
        result = await db.execute(
            select(Event)
            .where(
                or_(
                    # Personal events (no group)
                    (Event.group_id.is_(None)) & (Event.creator_id == user_id),
                    # Group events for all user's groups
                    Event.group_id.in_(group_ids) if group_ids else Event.id.is_(None),
                ),
                *time_filter,
            )
            .options(selectinload(Event.creator))
            .order_by(Event.start_time)
        )
        events = result.scalars().all()

    result_list = []
    for event in events:
        creator_id = event.creator_id
        is_own = str(creator_id) == str(user_id)
        vis = event.visibility

        if is_own or vis == EventVisibility.PUBLIC:
            nickname = event.creator.nickname if event.creator else ""
            if is_own:
                rm = await get_remind_minutes(db, event.id, user_id)
            else:
                rm = []
            base = _event_to_dict(event, nickname, rm)
            for inst in _expand_recurring(base, start, end):
                result_list.append(inst)
        elif vis == EventVisibility.BUSY:
            base = _event_to_busy_dict(event)
            for inst in _expand_recurring(base, start, end):
                result_list.append(inst)
        # PRIVATE from others: skip entirely

    result_list.sort(key=lambda e: e["start_time"] if e["start_time"] else "")
    return result_list


async def get_event_detail(
    db: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID
) -> dict:
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.creator))
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="日程不存在",
        )

    is_own = str(event.creator_id) == str(user_id)

    if event.group_id is None:
        # Personal event: only creator can view
        if not is_own:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权查看",
            )
        nickname = event.creator.nickname if event.creator else ""
        rm = await get_remind_minutes(db, event.id, user_id)
        return _event_to_dict(event, nickname, rm)
    else:
        # Group event: check membership
        role = await get_member_role(db, event.group_id, user_id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="非组内成员，无法查看日程",
            )

        if not is_own:
            if event.visibility == EventVisibility.PRIVATE:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="无权查看",
                )
            if event.visibility == EventVisibility.BUSY:
                return _event_to_busy_dict(event)

        nickname = event.creator.nickname if event.creator else ""
        rm = await get_remind_minutes(db, event.id, user_id)
        return _event_to_dict(event, nickname, rm)


async def can_edit_event(
    db: AsyncSession, event: Event, user_id: uuid.UUID
) -> bool:
    if str(event.creator_id) == str(user_id):
        return True

    if event.group_id is not None:
        role = await get_member_role(db, event.group_id, user_id)
        if role in (MemberRole.CREATOR, MemberRole.ADMIN):
            return True

    return False


async def update_event(
    db: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID, data: EventUpdate
) -> dict:
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.creator))
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="日程不存在",
        )

    if not await can_edit_event(db, event, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权修改该日程",
        )

    update_data = data.model_dump(exclude_unset=True)
    remind_minutes = update_data.pop("remind_minutes", None)
    for field, value in update_data.items():
        setattr(event, field, value)

    await db.commit()
    await db.refresh(event)

    if remind_minutes is not None:
        await update_reminders(db, event, user_id, remind_minutes)
        await db.commit()

    # Re-load creator after refresh
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.creator))
    )
    event = result.scalar_one()
    nickname = event.creator.nickname if event.creator else ""
    rm = await get_remind_minutes(db, event.id, user_id)
    return _event_to_dict(event, nickname, rm)


async def delete_event(
    db: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(Event).where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="日程不存在",
        )

    if not await can_edit_event(db, event, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权删除该日程",
        )

    await delete_reminders_for_event(db, event.id)
    await db.delete(event)
    await db.commit()
