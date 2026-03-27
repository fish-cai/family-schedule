# Project Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the full monorepo scaffolding so that `docker-compose up` starts the backend + DB + Redis, Swagger docs are accessible, database tables are created via Alembic, and the Taro frontend can call the backend health check.

**Architecture:** Monorepo with `frontend/` (Taro + React + TypeScript) and `backend/` (FastAPI + SQLAlchemy async + Alembic). Docker Compose orchestrates PostgreSQL 15, Redis 7, and the FastAPI dev server. Frontend runs locally via `npm run dev` and proxies API calls to `localhost:8000`.

**Tech Stack:** Taro 4, React, TypeScript, Zustand, FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL 15, Redis 7, Docker Compose

---

## File Structure

```
family-schedule/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app entry, health check, router registration
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py              # Pydantic Settings (env vars)
│   │   │   ├── database.py            # Async SQLAlchemy engine + session
│   │   │   └── security.py            # JWT token helpers
│   │   ├── models/
│   │   │   ├── __init__.py            # Re-export all models (for Alembic)
│   │   │   ├── base.py               # Declarative base + common columns
│   │   │   ├── user.py               # User model
│   │   │   ├── calendar_group.py     # CalendarGroup model
│   │   │   ├── group_member.py       # GroupMember model
│   │   │   ├── event.py              # Event model
│   │   │   ├── reminder.py           # Reminder model
│   │   │   └── template.py           # Template model
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── user.py               # User Pydantic schemas
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   └── user_service.py       # User business logic
│   │   └── api/
│   │       ├── __init__.py
│   │       ├── deps.py               # Shared dependencies (get_db)
│   │       └── users.py              # User/auth routes
│   ├── alembic/
│   │   ├── env.py                    # Alembic config (async)
│   │   ├── script.py.mako            # Migration template
│   │   └── versions/                 # Auto-generated migrations
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py              # Pytest fixtures (async client, test DB)
│   │   ├── test_health.py           # Health check test
│   │   └── test_users.py           # User/auth endpoint tests
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   └── pytest.ini
│
├── frontend/                         # Created by Taro CLI (Task 7)
│   ├── src/
│   │   ├── app.tsx
│   │   ├── app.config.ts
│   │   ├── pages/
│   │   │   └── index/
│   │   │       ├── index.tsx
│   │   │       └── index.config.ts
│   │   ├── services/
│   │   │   └── api.ts               # API client with base URL config
│   │   └── types/
│   │       └── index.ts             # Shared TypeScript types
│   ├── config/
│   │   └── dev.ts                   # Dev config (API proxy)
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml
├── .env.example
├── .gitignore
└── docs/
```

---

### Task 1: Backend project structure + configuration

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/requirements.txt`
- Create: `backend/pytest.ini`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: Create backend directory structure**

```bash
mkdir -p backend/app/core backend/app/models backend/app/schemas backend/app/services backend/app/api backend/tests
touch backend/app/__init__.py backend/app/core/__init__.py backend/app/models/__init__.py backend/app/schemas/__init__.py backend/app/services/__init__.py backend/app/api/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: Create requirements.txt**

Create `backend/requirements.txt`:

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.0
pydantic-settings==2.5.0
python-jose[cryptography]==3.3.0
redis==5.1.0
httpx==0.27.0
pytest==8.3.0
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Create config.py**

Create `backend/app/core/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "共享日程 API"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/family_schedule"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # WeChat
    WECHAT_APP_ID: str = ""
    WECHAT_APP_SECRET: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
```

- [ ] **Step 4: Create pytest.ini**

Create `backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

- [ ] **Step 5: Write the failing health check test**

Create `backend/tests/conftest.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
```

Create `backend/tests/test_health.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "共享日程 API"
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd backend && pip install -r requirements.txt && pytest tests/test_health.py -v
```

Expected: FAIL — `app.main` does not exist yet.

- [ ] **Step 7: Write minimal FastAPI app with health check**

Create `backend/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(title=settings.APP_NAME, docs_url="/docs", redoc_url="/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd backend && pytest tests/test_health.py -v
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat: initialize backend with FastAPI, config, and health check"
```

---

### Task 2: Docker Compose + Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create Backend Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Step 2: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: family_schedule
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  pgdata:
```

- [ ] **Step 3: Create .env.example**

Create `.env.example`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/family_schedule

# Redis
REDIS_URL=redis://redis:6379/0

# JWT
SECRET_KEY=change-this-to-a-random-string

# WeChat Mini Program
WECHAT_APP_ID=
WECHAT_APP_SECRET=
```

- [ ] **Step 4: Create .gitignore**

Create `.gitignore`:

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/

# Node
node_modules/
dist/

# Env
.env

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Taro
frontend/.temp/

# Docker
pgdata/
```

- [ ] **Step 5: Copy .env.example to .env for local dev**

```bash
cp .env.example .env
```

- [ ] **Step 6: Start Docker Compose and verify**

```bash
docker-compose up --build -d
```

Wait for services to start, then:

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok","service":"共享日程 API"}`

Verify Swagger docs at: `http://localhost:8000/docs`

- [ ] **Step 7: Stop Docker Compose**

```bash
docker-compose down
```

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml .env.example .gitignore backend/Dockerfile
git commit -m "feat: add Docker Compose with PostgreSQL, Redis, and backend"
```

---

### Task 3: SQLAlchemy async database setup

**Files:**
- Create: `backend/app/core/database.py`
- Create: `backend/app/models/base.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_database.py`

- [ ] **Step 1: Write failing database connection test**

Create `backend/tests/test_database.py`:

```python
import pytest

from app.core.database import async_engine


@pytest.mark.asyncio
async def test_database_engine_created():
    assert async_engine is not None
    assert "asyncpg" in str(async_engine.url)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_database.py -v
```

Expected: FAIL — `app.core.database` has no `async_engine`.

- [ ] **Step 3: Create database.py**

Create `backend/app/core/database.py`:

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

async_engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)

async_session_maker = async_sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db():
    async with async_session_maker() as session:
        yield session
```

- [ ] **Step 4: Create base model**

Create `backend/app/models/base.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && pytest tests/test_database.py -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/database.py backend/app/models/base.py backend/tests/test_database.py
git commit -m "feat: add async SQLAlchemy engine, session, and base model"
```

---

### Task 4: SQLAlchemy data models

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/calendar_group.py`
- Create: `backend/app/models/group_member.py`
- Create: `backend/app/models/event.py`
- Create: `backend/app/models/reminder.py`
- Create: `backend/app/models/template.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create User model**

Create `backend/app/models/user.py`:

```python
from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    openid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    unionid: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    nickname: Mapped[str] = mapped_column(String(64), default="")
    avatar: Mapped[str] = mapped_column(String(512), default="")
    settings: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_events = relationship("Event", back_populates="creator")
    group_memberships = relationship("GroupMember", back_populates="user")
```

- [ ] **Step 2: Create CalendarGroup model**

Create `backend/app/models/calendar_group.py`:

```python
import secrets

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


def generate_invite_code() -> str:
    return secrets.token_urlsafe(6)[:6].upper()


class CalendarGroup(TimestampMixin, Base):
    __tablename__ = "calendar_groups"

    name: Mapped[str] = mapped_column(String(64))
    icon: Mapped[str] = mapped_column(String(128), default="")
    color: Mapped[str] = mapped_column(String(7), default="#4A90D9")
    description: Mapped[str] = mapped_column(String(256), default="")
    creator_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    invite_code: Mapped[str] = mapped_column(
        String(10), unique=True, index=True, default=generate_invite_code
    )
    max_members: Mapped[int] = mapped_column(Integer, default=10)

    creator = relationship("User")
    members = relationship("GroupMember", back_populates="group")
    events = relationship("Event", back_populates="group")
```

- [ ] **Step 3: Create GroupMember model**

Create `backend/app/models/group_member.py`:

```python
import enum

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class MemberRole(str, enum.Enum):
    CREATOR = "creator"
    ADMIN = "admin"
    MEMBER = "member"


class GroupMember(TimestampMixin, Base):
    __tablename__ = "group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_user"),
    )

    group_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calendar_groups.id")
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole), default=MemberRole.MEMBER
    )

    group = relationship("CalendarGroup", back_populates="members")
    user = relationship("User", back_populates="group_memberships")
```

- [ ] **Step 4: Create Event model**

Create `backend/app/models/event.py`:

```python
import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class EventVisibility(str, enum.Enum):
    PUBLIC = "public"
    BUSY = "busy"
    PRIVATE = "private"


class Event(TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_group_start", "group_id", "start_time"),
        Index("ix_events_creator_start", "creator_id", "start_time"),
    )

    title: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(String(1024), default="")
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    location: Mapped[str] = mapped_column(String(256), default="")
    color: Mapped[str] = mapped_column(String(7), default="")
    visibility: Mapped[EventVisibility] = mapped_column(
        Enum(EventVisibility), default=EventVisibility.PUBLIC
    )
    repeat_rule: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    group_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calendar_groups.id"), nullable=True
    )
    creator_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    template_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id"), nullable=True
    )

    creator = relationship("User", back_populates="created_events")
    group = relationship("CalendarGroup", back_populates="events")
    reminders = relationship("Reminder", back_populates="event")
```

- [ ] **Step 5: Create Reminder model**

Create `backend/app/models/reminder.py`:

```python
import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ReminderStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class Reminder(TimestampMixin, Base):
    __tablename__ = "reminders"
    __table_args__ = (
        Index("ix_reminders_status_time", "status", "remind_at"),
    )

    event_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id")
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    remind_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[ReminderStatus] = mapped_column(
        Enum(ReminderStatus), default=ReminderStatus.PENDING
    )

    event = relationship("Event", back_populates="reminders")
    user = relationship("User")
```

- [ ] **Step 6: Create Template model**

Create `backend/app/models/template.py`:

```python
from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Template(TimestampMixin, Base):
    __tablename__ = "templates"

    name: Mapped[str] = mapped_column(String(64))
    category: Mapped[str] = mapped_column(String(32), default="")
    preset_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    creator_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 7: Update models __init__.py to re-export all models**

Update `backend/app/models/__init__.py`:

```python
from app.models.base import Base
from app.models.user import User
from app.models.calendar_group import CalendarGroup
from app.models.group_member import GroupMember, MemberRole
from app.models.event import Event, EventVisibility
from app.models.reminder import Reminder, ReminderStatus
from app.models.template import Template

__all__ = [
    "Base",
    "User",
    "CalendarGroup",
    "GroupMember",
    "MemberRole",
    "Event",
    "EventVisibility",
    "Reminder",
    "ReminderStatus",
    "Template",
]
```

- [ ] **Step 8: Verify models import without errors**

```bash
cd backend && python -c "from app.models import Base, User, CalendarGroup, GroupMember, Event, Reminder, Template; print('All models imported successfully')"
```

Expected: `All models imported successfully`

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/
git commit -m "feat: add all SQLAlchemy data models (User, CalendarGroup, GroupMember, Event, Reminder, Template)"
```

---

### Task 5: Alembic migration setup

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/` (directory)

- [ ] **Step 1: Initialize Alembic**

```bash
cd backend && alembic init alembic
```

This creates `alembic/` directory and `alembic.ini`.

- [ ] **Step 2: Update alembic.ini**

In `backend/alembic.ini`, find the line `sqlalchemy.url = driver://user:pass@localhost/dbname` and replace it with:

```ini
sqlalchemy.url = postgresql+asyncpg://postgres:postgres@localhost:5432/family_schedule
```

- [ ] **Step 3: Replace alembic/env.py with async version**

Replace `backend/alembic/env.py` entirely:

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = create_async_engine(settings.DATABASE_URL)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Generate initial migration**

Make sure PostgreSQL is running (`docker-compose up db -d`), then:

```bash
cd backend && alembic revision --autogenerate -m "create initial tables"
```

Expected: A new file in `backend/alembic/versions/` with the table creation SQL for all 6 models.

- [ ] **Step 5: Run migration**

```bash
cd backend && alembic upgrade head
```

Expected: Tables created in the `family_schedule` database.

- [ ] **Step 6: Verify tables exist**

```bash
docker-compose exec db psql -U postgres -d family_schedule -c "\dt"
```

Expected: Tables listed — `users`, `calendar_groups`, `group_members`, `events`, `reminders`, `templates`, `alembic_version`.

- [ ] **Step 7: Commit**

```bash
git add backend/alembic/ backend/alembic.ini
git commit -m "feat: add Alembic async migration setup with initial tables"
```

---

### Task 6: User auth API skeleton (WeChat login + JWT)

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/services/user_service.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/users.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_users.py`

- [ ] **Step 1: Create security.py (JWT helpers)**

Create `backend/app/core/security.py`:

```python
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.core.config import settings

ALGORITHM = "HS256"


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
```

- [ ] **Step 2: Create user Pydantic schemas**

Create `backend/app/schemas/user.py`:

```python
from pydantic import BaseModel


class WechatLoginRequest(BaseModel):
    code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    nickname: str
    avatar: str

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Create user service**

Create `backend/app/services/user_service.py`:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_user_by_openid(db: AsyncSession, openid: str) -> User | None:
    result = await db.execute(select(User).where(User.openid == openid))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, openid: str) -> User:
    user = User(openid=openid, nickname="微信用户")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_or_create_user(db: AsyncSession, openid: str) -> User:
    user = await get_user_by_openid(db, openid)
    if user is None:
        user = await create_user(db, openid)
    return user
```

- [ ] **Step 4: Create API dependencies**

Create `backend/app/api/deps.py`:

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.services.user_service import get_user_by_openid

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    openid = payload.get("sub")
    if openid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    user = await get_user_by_openid(db, openid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    return user
```

- [ ] **Step 5: Write failing auth test**

Create `backend/tests/test_users.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_wechat_login_missing_code(client):
    response = await client.post("/api/users/login", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_wechat_login_invalid_code(client):
    response = await client.post("/api/users/login", json={"code": "invalid"})
    # In dev mode without real WeChat API, this should use mock openid
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_get_current_user_no_token(client):
    response = await client.get("/api/users/me")
    assert response.status_code == 403
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_users.py -v
```

Expected: FAIL — routes not registered.

- [ ] **Step 7: Create users API route**

Create `backend/app/api/users.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.user import TokenResponse, UserResponse, WechatLoginRequest
from app.services.user_service import get_or_create_user

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/login", response_model=TokenResponse)
async def wechat_login(
    request: WechatLoginRequest, db: AsyncSession = Depends(get_db)
):
    """
    WeChat mini-program login.
    In development: uses the code directly as a mock openid.
    In production: exchanges code for openid via WeChat API.
    """
    if settings.DEBUG and not settings.WECHAT_APP_ID:
        # Dev mode: use code as mock openid
        openid = f"dev_{request.code}"
    else:
        # TODO: implement real WeChat code-to-session exchange
        # https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
        openid = f"dev_{request.code}"

    user = await get_or_create_user(db, openid)
    access_token = create_access_token(data={"sub": user.openid})
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current logged-in user info."""
    return UserResponse(
        id=str(current_user.id),
        nickname=current_user.nickname,
        avatar=current_user.avatar,
    )
```

- [ ] **Step 8: Register router in main.py**

Modify `backend/app/main.py` — add after the CORS middleware:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.users import router as users_router
from app.core.config import settings

app = FastAPI(title=settings.APP_NAME, docs_url="/docs", redoc_url="/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}
```

- [ ] **Step 9: Update conftest.py to use test database**

Replace `backend/tests/conftest.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models import Base

# Use a separate test database
TEST_DATABASE_URL = settings.DATABASE_URL.replace("family_schedule", "family_schedule_test")

test_engine = create_async_engine(TEST_DATABASE_URL)
test_session_maker = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


async def override_get_db():
    async with test_session_maker() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
async def setup_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
```

Note: You need to create the test database first:

```bash
docker-compose exec db psql -U postgres -c "CREATE DATABASE family_schedule_test;"
```

- [ ] **Step 10: Run all tests**

```bash
cd backend && pytest -v
```

Expected: All tests PASS (test_health, test_users).

- [ ] **Step 11: Commit**

```bash
git add backend/app/core/security.py backend/app/schemas/ backend/app/services/ backend/app/api/ backend/tests/ backend/app/main.py
git commit -m "feat: add user auth API skeleton with WeChat login mock and JWT"
```

---

### Task 7: Taro frontend initialization

**Files:**
- Create: `frontend/` (entire Taro project via CLI)
- Create: `frontend/src/services/api.ts`
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: Install Taro CLI globally**

```bash
npm install -g @tarojs/cli
```

- [ ] **Step 2: Create Taro project**

```bash
cd /path/to/family-schedule && taro init frontend
```

When prompted:
- Template: default
- Framework: React
- TypeScript: Yes
- CSS preprocessor: Sass
- Package manager: npm

- [ ] **Step 3: Install Zustand**

```bash
cd frontend && npm install zustand
```

- [ ] **Step 4: Create API service**

Create `frontend/src/services/api.ts`:

```typescript
import Taro from "@tarojs/taro";

const BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://your-production-api.com";

interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: Record<string, unknown>;
  needAuth?: boolean;
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = "GET", data, needAuth = false } = options;

  const header: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (needAuth) {
    const token = Taro.getStorageSync("access_token");
    if (token) {
      header["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await Taro.request({
    url: `${BASE_URL}${url}`,
    method,
    data,
    header,
  });

  return response.data as T;
}

export async function healthCheck(): Promise<{ status: string; service: string }> {
  return request({ url: "/health" });
}
```

- [ ] **Step 5: Create shared types**

Create `frontend/src/types/index.ts`:

```typescript
export interface User {
  id: string;
  nickname: string;
  avatar: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}
```

- [ ] **Step 6: Update index page to show health check result**

Replace `frontend/src/pages/index/index.tsx`:

```typescript
import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import { healthCheck } from "../../services/api";
import type { HealthResponse } from "../../types";
import "./index.scss";

export default function Index() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    healthCheck()
      .then(setHealth)
      .catch((err) => setError(err.message || "连接失败"));
  }, []);

  return (
    <View className="index">
      <Text>共享日程</Text>
      {health && <Text>后端状态: {health.status}</Text>}
      {error && <Text>连接错误: {error}</Text>}
    </View>
  );
}
```

- [ ] **Step 7: Start dev server and verify**

```bash
cd frontend && npm run dev:weapp
```

Expected: Taro compiles successfully. Open in WeChat DevTools to preview.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: initialize Taro frontend with React, TypeScript, API service, and health check page"
```

---

### Task 8: Integration verification

**Files:** None new — this task verifies everything works together.

- [ ] **Step 1: Start all backend services**

```bash
docker-compose up --build -d
```

- [ ] **Step 2: Verify health check**

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok","service":"共享日程 API"}`

- [ ] **Step 3: Verify Swagger docs**

Open `http://localhost:8000/docs` in browser.

Expected: FastAPI Swagger UI showing `/health`, `/api/users/login`, `/api/users/me` endpoints.

- [ ] **Step 4: Verify database tables**

```bash
docker-compose exec db psql -U postgres -d family_schedule -c "\dt"
```

Expected: 7 tables listed (users, calendar_groups, group_members, events, reminders, templates, alembic_version).

- [ ] **Step 5: Test login flow via curl**

```bash
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"code": "test123"}'
```

Expected: `{"access_token":"eyJ...","token_type":"bearer"}`

Use the returned token:

```bash
curl http://localhost:8000/api/users/me \
  -H "Authorization: Bearer <paste_token_here>"
```

Expected: `{"id":"...","nickname":"微信用户","avatar":""}`

- [ ] **Step 6: Start frontend**

```bash
cd frontend && npm run dev:weapp
```

Expected: Taro compiles successfully.

- [ ] **Step 7: Run all backend tests**

```bash
cd backend && pytest -v
```

Expected: All tests PASS.

- [ ] **Step 8: Final commit — update README placeholder**

No additional code changes. All verification passed. Project initialization complete.

```bash
git add -A && git status
```

If there are any uncommitted changes, commit them:

```bash
git commit -m "chore: project initialization complete"
```
