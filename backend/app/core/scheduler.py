import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.database import async_session_maker

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def check_reminders():
    """Periodic job: scan and send due reminders."""
    from app.services.reminder_service import scan_and_send

    async with async_session_maker() as db:
        try:
            count = await scan_and_send(db)
            if count > 0:
                logger.info(f"Sent {count} reminders")
        except Exception as e:
            logger.error(f"Reminder scan failed: {e}")


def start_scheduler():
    scheduler.add_job(check_reminders, "interval", minutes=1, id="check_reminders")
    scheduler.start()
    logger.info("Reminder scheduler started")


def stop_scheduler():
    scheduler.shutdown()
