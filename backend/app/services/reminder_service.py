import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.event import Event
from app.models.reminder import Reminder, ReminderStatus
from app.models.user import User

logger = logging.getLogger(__name__)


async def create_reminders(
    db: AsyncSession,
    event: Event,
    user_id: uuid.UUID,
    remind_minutes: list[int],
) -> None:
    for minutes in remind_minutes:
        remind_at = event.start_time - timedelta(minutes=minutes)
        reminder = Reminder(
            event_id=event.id,
            user_id=user_id,
            remind_at=remind_at,
            status=ReminderStatus.PENDING,
        )
        db.add(reminder)
    await db.flush()


async def update_reminders(
    db: AsyncSession,
    event: Event,
    user_id: uuid.UUID,
    remind_minutes: list[int],
) -> None:
    # Delete old PENDING reminders for this event+user
    await db.execute(
        delete(Reminder).where(
            Reminder.event_id == event.id,
            Reminder.user_id == user_id,
            Reminder.status == ReminderStatus.PENDING,
        )
    )
    # Create new ones
    await create_reminders(db, event, user_id, remind_minutes)


async def delete_reminders_for_event(db: AsyncSession, event_id: uuid.UUID) -> None:
    await db.execute(delete(Reminder).where(Reminder.event_id == event_id))


async def get_remind_minutes(
    db: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID
) -> list[int]:
    result = await db.execute(
        select(Reminder).where(
            Reminder.event_id == event_id,
            Reminder.user_id == user_id,
            Reminder.status == ReminderStatus.PENDING,
        )
    )
    reminders = result.scalars().all()
    # Load the event to compute minutes difference
    event_result = await db.execute(select(Event).where(Event.id == event_id))
    event = event_result.scalar_one_or_none()
    if not event:
        return []
    minutes_list = []
    for r in reminders:
        diff = event.start_time - r.remind_at
        minutes = int(diff.total_seconds() / 60)
        if minutes > 0:
            minutes_list.append(minutes)
    return sorted(minutes_list)


async def scan_and_send(db: AsyncSession) -> int:
    """Scan for due reminders and send notifications. Returns count sent."""
    from app.services.wechat_service import send_subscribe_message

    now = datetime.now().astimezone()
    result = await db.execute(
        select(Reminder)
        .where(
            Reminder.status == ReminderStatus.PENDING,
            Reminder.remind_at <= now,
        )
        .options(selectinload(Reminder.event), selectinload(Reminder.user))
    )
    reminders = result.scalars().all()
    sent_count = 0
    for reminder in reminders:
        try:
            event = reminder.event
            user = reminder.user
            if not event or not user:
                reminder.status = ReminderStatus.FAILED
                continue
            success = await send_subscribe_message(
                openid=user.openid,
                data={
                    "event_title": event.title,
                    "event_time": event.start_time.isoformat(),
                    "location": event.location or "",
                },
            )
            reminder.status = ReminderStatus.SENT if success else ReminderStatus.FAILED
            sent_count += 1
        except Exception as e:
            logger.error(f"Failed to send reminder {reminder.id}: {e}")
            reminder.status = ReminderStatus.FAILED
    await db.commit()
    return sent_count
