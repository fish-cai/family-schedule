from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

async_engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)

async_session_maker = async_sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db():
    async with async_session_maker() as session:
        yield session
