# 上线准备：生产就绪改造 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将代码从开发状态改造为生产就绪：真实微信登录、生产 Docker、CI/CD、安全加固、健康检查增强。

**Architecture:** 后端代码通过环境变量区分 dev/prod 行为（mock vs 真实），Docker 多阶段构建 + nginx 反向代理，GitHub Actions 做 CI 测试 + CD 镜像推送。

**Tech Stack:** FastAPI, Docker, nginx, GitHub Actions, gunicorn, PostgreSQL, Redis

---

## Task 1: 真实微信登录 + 安全加固

**Files:**
- Modify: `backend/app/services/wechat_service.py`
- Modify: `backend/app/api/users.py`
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: 在 wechat_service.py 添加 code2session**

在文件开头添加 `import httpx`，然后在文件末尾追加：

```python
async def code2session(code: str) -> dict:
    """Call WeChat code2session API to get openid."""
    import httpx
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APP_ID,
        "secret": settings.WECHAT_APP_SECRET,
        "js_code": code,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
        data = resp.json()
    if "errcode" in data and data["errcode"] != 0:
        logger.error(f"WeChat code2session failed: {data}")
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="微信登录失败")
    return data
```

- [ ] **Step 2: 修改 users.py 使用真实登录**

将 `backend/app/api/users.py` 中的 `wechat_login` 函数改为：

```python
@router.post("/login", response_model=TokenResponse)
async def wechat_login(
    request: WechatLoginRequest, db: AsyncSession = Depends(get_db)
):
    if settings.DEBUG and not settings.WECHAT_APP_ID:
        openid = f"dev_{request.code}"
    else:
        from app.services.wechat_service import code2session
        wx_data = await code2session(request.code)
        openid = wx_data["openid"]

    user = await get_or_create_user(db, openid)
    access_token = create_access_token(data={"sub": user.openid})
    return TokenResponse(access_token=access_token)
```

- [ ] **Step 3: 在 config.py 添加 SECRET_KEY 校验**

在 `backend/app/core/config.py` 中，在 `settings = Settings()` 之后添加：

```python
# Validate SECRET_KEY in production
if not settings.DEBUG and settings.SECRET_KEY == "dev-secret-key-change-in-production":
    raise RuntimeError(
        "FATAL: SECRET_KEY must be changed in production. "
        "Set a random string of at least 32 characters."
    )
```

- [ ] **Step 4: 运行测试**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: 49 passed（DEBUG=True 所以仍走 mock 路径）

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/wechat_service.py backend/app/api/users.py backend/app/core/config.py
git commit -m "feat: add real WeChat login and SECRET_KEY validation"
```

---

## Task 2: 健康检查增强 + Swagger 控制

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/tests/test_health.py`

- [ ] **Step 1: 添加 redis 依赖（已有）并更新 main.py**

将 `backend/app/main.py` 替换为：

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.ai import router as ai_router
from app.api.events import router as events_router
from app.api.groups import router as groups_router
from app.api.users import router as users_router
from app.core.config import settings
from app.core.database import async_session_maker
from app.core.scheduler import start_scheduler, stop_scheduler

app = FastAPI(
    title=settings.APP_NAME,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(groups_router)
app.include_router(events_router)
app.include_router(ai_router)


@app.on_event("startup")
async def startup():
    start_scheduler()


@app.on_event("shutdown")
async def shutdown():
    stop_scheduler()


@app.get("/health")
async def health_check():
    checks = {"api": "ok"}

    # DB check
    try:
        async with async_session_maker() as db:
            await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"

    # Redis check
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    status_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        content={
            "status": "ok" if status_ok else "degraded",
            "service": settings.APP_NAME,
            "checks": checks,
        },
        status_code=200 if status_ok else 503,
    )
```

- [ ] **Step 2: 更新健康检查测试**

Replace `backend/tests/test_health.py`:

```python
async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["service"] == "共享日程 API"
    assert "checks" in data
    assert data["checks"]["api"] == "ok"
```

- [ ] **Step 3: 运行测试**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: 49 passed

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py backend/tests/test_health.py
git commit -m "feat: enhance health check with DB/Redis status and control Swagger in prod"
```

---

## Task 3: 生产 Dockerfile + entrypoint

**Files:**
- Rewrite: `backend/Dockerfile`
- Create: `backend/entrypoint.sh`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: 添加 gunicorn 到 requirements.txt**

在 `backend/requirements.txt` 末尾追加：

```
gunicorn==22.0.0
```

- [ ] **Step 2: 重写 backend/Dockerfile**

```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Make entrypoint executable
RUN chmod +x entrypoint.sh

EXPOSE 8000

# Default: production mode
ENTRYPOINT ["./entrypoint.sh"]
```

- [ ] **Step 3: 创建 backend/entrypoint.sh**

```bash
#!/bin/bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting server..."
if [ "$DEBUG" = "true" ] || [ "$DEBUG" = "True" ]; then
    echo "Development mode: uvicorn with reload"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "Production mode: gunicorn"
    exec gunicorn app.main:app \
        -w ${WORKERS:-4} \
        -k uvicorn.workers.UvicornWorker \
        -b 0.0.0.0:8000 \
        --access-logfile - \
        --error-logfile -
fi
```

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/entrypoint.sh backend/requirements.txt
git commit -m "feat: production Dockerfile with gunicorn and auto-migration entrypoint"
```

---

## Task 4: Nginx + 生产 docker-compose

**Files:**
- Create: `nginx/nginx.conf`
- Create: `nginx/Dockerfile`
- Create: `docker-compose.prod.yml`
- Create: `.env.production.example`

- [ ] **Step 1: 创建 nginx/nginx.conf**

```nginx
upstream backend {
    server backend:8000;
}

server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    location /health {
        proxy_pass http://backend;
    }

    location / {
        return 404 '{"detail": "Not Found"}';
        add_header Content-Type application/json;
    }
}
```

- [ ] **Step 2: 创建 nginx/Dockerfile**

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: 创建 docker-compose.prod.yml**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD is required}
      POSTGRES_DB: ${DB_NAME:-family_schedule}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres}"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: always

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: always

  backend:
    build:
      context: ./backend
    env_file: .env.production
    environment:
      DATABASE_URL: postgresql+asyncpg://${DB_USER:-postgres}:${DB_PASSWORD}@db:5432/${DB_NAME:-family_schedule}
      REDIS_URL: redis://redis:6379/0
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    restart: always

  nginx:
    build:
      context: ./nginx
    ports:
      - "${PORT:-80}:80"
    depends_on:
      backend:
        condition: service_healthy
    restart: always

volumes:
  pgdata:
```

- [ ] **Step 4: 创建 .env.production.example**

```bash
# ============================
# 必须修改
# ============================
SECRET_KEY=your-random-secret-key-at-least-32-chars
DB_PASSWORD=your-secure-db-password
WECHAT_APP_ID=wx1234567890
WECHAT_APP_SECRET=your-wechat-app-secret
DEEPSEEK_API_KEY=sk-your-deepseek-key

# ============================
# 可选修改
# ============================
DEBUG=false
APP_NAME=共享日程 API
CORS_ORIGINS=["https://your-domain.com"]
LLM_PROVIDER=deepseek
DEEPSEEK_MODEL=deepseek-chat
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# ============================
# Docker 内部（通常不需要改）
# ============================
DB_USER=postgres
DB_NAME=family_schedule
PORT=80
WORKERS=4
```

- [ ] **Step 5: 更新 .env.example 补全缺少的变量**

替换 `.env.example`：

```bash
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/family_schedule

# Redis
REDIS_URL=redis://redis:6379/0

# JWT
SECRET_KEY=dev-secret-key-change-in-production

# CORS
CORS_ORIGINS=["http://localhost:3000"]

# WeChat Mini Program
WECHAT_APP_ID=
WECHAT_APP_SECRET=

# LLM
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat

# App
DEBUG=true
```

- [ ] **Step 6: Commit**

```bash
git add nginx/ docker-compose.prod.yml .env.production.example .env.example
git commit -m "feat: add production docker-compose with nginx, env templates"
```

---

## Task 5: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 创建 CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  backend-test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: family_schedule_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/family_schedule
      SECRET_KEY: ci-test-secret-key
      DEBUG: "true"

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        working-directory: backend
        run: pip install -r requirements.txt

      - name: Create test database
        run: |
          PGPASSWORD=postgres psql -h localhost -U postgres -c "CREATE DATABASE family_schedule_test;"

      - name: Run tests
        working-directory: backend
        run: python -m pytest tests/ -v --tb=short

  frontend-build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "18"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Build H5
        working-directory: frontend
        run: npm run build:h5

      - name: Build WeChat Mini Program
        working-directory: frontend
        run: npm run build:weapp
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI for backend tests and frontend builds"
```

---

## Task 6: GitHub Actions CD

**Files:**
- Create: `.github/workflows/cd.yml`

- [ ] **Step 1: 创建 CD workflow**

`.github/workflows/cd.yml`:

```yaml
name: CD

on:
  push:
    branches: [main, master]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    if: github.event_name == 'push'

    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push backend image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/backend:latest
            ghcr.io/${{ github.repository }}/backend:sha-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push nginx image
        uses: docker/build-push-action@v5
        with:
          context: ./nginx
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/nginx:latest
            ghcr.io/${{ github.repository }}/nginx:sha-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "ci: add GitHub Actions CD for Docker image builds"
```

---

## Task 7: 最终验证

- [ ] **Step 1: 后端测试**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: 49 passed

- [ ] **Step 2: 前端编译**

```bash
cd frontend && npm run build:h5 2>&1 | tail -5
```

Expected: compiled successfully

- [ ] **Step 3: 验证 dev docker-compose 仍可用**

```bash
docker-compose up -d --build 2>&1 | tail -10
```

确认 backend、db、redis 都 healthy。然后：

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok",...,"checks":{"api":"ok","db":"ok","redis":"ok"}}`

```bash
docker-compose down
```

- [ ] **Step 4: 验证 prod docker-compose 配置语法**

```bash
docker compose -f docker-compose.prod.yml config 2>&1 | head -5
```

Expected: 输出合法的 YAML（可能因缺少 .env.production 报错，但配置语法正确即可）

- [ ] **Step 5: 验证 CI workflow 语法**

```bash
cat .github/workflows/ci.yml | python3 -c "import sys,yaml; yaml.safe_load(sys.stdin); print('Valid YAML')"
cat .github/workflows/cd.yml | python3 -c "import sys,yaml; yaml.safe_load(sys.stdin); print('Valid YAML')"
```
