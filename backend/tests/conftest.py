import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models import Base

TEST_DATABASE_URL = settings.DATABASE_URL.replace("family_schedule", "family_schedule_test")


async def override_get_db():
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
async def setup_database():
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def auth_header(openid: str) -> dict:
    token = create_access_token(data={"sub": openid})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def user_a(client):
    openid = "dev_user_a"
    await client.post("/api/users/login", json={"code": "user_a"})
    return openid, auth_header(openid)


@pytest.fixture
async def user_b(client):
    openid = "dev_user_b"
    await client.post("/api/users/login", json={"code": "user_b"})
    return openid, auth_header(openid)
