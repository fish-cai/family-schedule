# 上线准备：生产就绪改造设计

> 版本：v1.0 | 日期：2026-03-31

---

## 一、范围

代码层面的生产就绪改造：真实微信登录、生产 Docker 配置、CI/CD、环境变量管理、安全加固。

### 包含

- 真实微信 `code2session` 登录（开发模式保留 mock）
- 生产 Dockerfile（多阶段构建，gunicorn）
- 生产 docker-compose（nginx 反向代理 + 后端 + DB + Redis）
- 数据库迁移自动化（entrypoint.sh）
- GitHub Actions CI（测试 + 构建）
- GitHub Actions CD（Docker 镜像推送）
- 健康检查增强（DB + Redis 连通性）
- 安全加固（SECRET_KEY 校验、CORS 收紧、Swagger 控制）
- 环境变量模板完善

### 不包含

- SSL/HTTPS 证书配置
- 域名购买和备案
- 云服务具体部署操作
- 监控告警（Prometheus/Grafana）
- 日志收集（ELK）

---

## 二、真实微信登录

### 2.1 当前状态

`backend/app/api/users.py` 中 `wechat_login` 对所有 code 生成 `dev_{code}` 的 openid。

### 2.2 改造方案

在 `wechat_service.py` 添加 `code2session` 方法：

```python
async def code2session(code: str) -> dict:
    """调用微信 code2session API 获取 openid 和 session_key"""
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APP_ID,
        "secret": settings.WECHAT_APP_SECRET,
        "js_code": code,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params)
        data = resp.json()
    if "errcode" in data and data["errcode"] != 0:
        raise HTTPException(400, detail="微信登录失败")
    return data  # { openid, session_key, unionid? }
```

`users.py` 登录逻辑改为：

```python
if settings.DEBUG and not settings.WECHAT_APP_ID:
    openid = f"dev_{request.code}"
else:
    wx_data = await code2session(request.code)
    openid = wx_data["openid"]
```

逻辑不变：有 WECHAT_APP_ID 时走真实，没有时走 mock。

---

## 三、生产 Docker 配置

### 3.1 backend/Dockerfile（重写）

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS production
COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
```

### 3.2 backend/entrypoint.sh（新建）

```bash
#!/bin/bash
set -e
echo "Running database migrations..."
alembic upgrade head
echo "Starting server..."
exec gunicorn app.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  -b 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

需要在 requirements.txt 添加 `gunicorn`。

### 3.3 nginx/nginx.conf（新建）

```nginx
upstream backend {
    server backend:8000;
}

server {
    listen 80;
    server_name _;

    # API 反向代理
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 健康检查
    location /health {
        proxy_pass http://backend;
    }

    # Swagger（仅开发）
    location /docs {
        proxy_pass http://backend;
    }

    location /redoc {
        proxy_pass http://backend;
    }

    # 默认返回 404（小程序不需要静态文件托管）
    location / {
        return 404;
    }
}
```

### 3.4 nginx/Dockerfile（新建）

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 3.5 docker-compose.prod.yml（新建）

```yaml
version: "3.8"

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME:-family_schedule}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres}"]
      interval: 5s
      retries: 5
    restart: always

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5
    restart: always

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    env_file: .env.production
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      retries: 3
      start_period: 30s
    restart: always

  nginx:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    ports:
      - "${PORT:-80}:80"
    depends_on:
      backend:
        condition: service_healthy
    restart: always

volumes:
  pgdata:
```

---

## 四、环境变量管理

### 4.1 .env.production.example

```bash
# ===== 必须修改 =====
SECRET_KEY=your-random-secret-key-at-least-32-chars
DB_PASSWORD=your-secure-db-password

# ===== 微信 =====
WECHAT_APP_ID=wx1234567890
WECHAT_APP_SECRET=your-wechat-app-secret

# ===== AI =====
DEEPSEEK_API_KEY=sk-your-deepseek-key

# ===== 可选修改 =====
DEBUG=false
DATABASE_URL=postgresql+asyncpg://postgres:${DB_PASSWORD}@db:5432/family_schedule
REDIS_URL=redis://redis:6379/0
CORS_ORIGINS=["https://your-domain.com"]
LLM_PROVIDER=deepseek
DEEPSEEK_MODEL=deepseek-chat
APP_NAME=共享日程 API

# ===== Docker =====
DB_USER=postgres
DB_NAME=family_schedule
PORT=80
```

---

## 五、GitHub Actions CI/CD

### 5.1 CI — .github/workflows/ci.yml

触发：push 和 PR 到 main/master。

Jobs:
1. **backend-test**：启动 PostgreSQL service，安装 Python 依赖，创建测试数据库，运行 pytest
2. **frontend-build**：安装 Node 依赖，运行 `npm run build:h5`

### 5.2 CD — .github/workflows/cd.yml

触发：push 到 main/master（CI 通过后）。

Jobs:
1. 构建后端 Docker 镜像
2. 推送到 GitHub Container Registry（ghcr.io）
3. Tag 格式：`ghcr.io/{owner}/family-schedule-backend:latest` 和 `:sha-{短hash}`

---

## 六、健康检查增强

当前 `/health` 只返回 `{"status": "ok"}`。增强为检查 DB 和 Redis：

```python
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
        r = redis.from_url(settings.REDIS_URL)
        await r.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    status_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        content={"status": "ok" if status_ok else "degraded", "checks": checks},
        status_code=200 if status_ok else 503,
    )
```

---

## 七、安全加固

### 7.1 SECRET_KEY 校验

在 Settings 中添加 validator：启动时如果 `DEBUG=false` 且 `SECRET_KEY` 是默认值 `"dev-secret-key-change-in-production"`，抛出错误拒绝启动。

### 7.2 CORS 收紧

生产环境 `.env.production` 中 `CORS_ORIGINS` 设置为实际域名，不再是 `["http://localhost:3000"]`。

### 7.3 Swagger 控制

`DEBUG=false` 时，`docs_url=None, redoc_url=None`，关闭 API 文档。

---

## 八、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/api/users.py` | 修改 | 真实微信 code2session 登录 |
| `backend/app/services/wechat_service.py` | 修改 | 添加 code2session 方法 |
| `backend/app/main.py` | 修改 | 增强健康检查 + Swagger 控制 |
| `backend/app/core/config.py` | 修改 | SECRET_KEY 校验 |
| `backend/Dockerfile` | 重写 | 多阶段生产构建 |
| `backend/entrypoint.sh` | 新建 | 迁移 + gunicorn 启动 |
| `backend/requirements.txt` | 修改 | 添加 gunicorn |
| `docker-compose.prod.yml` | 新建 | 生产编排 |
| `nginx/nginx.conf` | 新建 | 反向代理 |
| `nginx/Dockerfile` | 新建 | Nginx 镜像 |
| `.env.production.example` | 新建 | 生产环境变量模板 |
| `.github/workflows/ci.yml` | 新建 | CI：测试+构建 |
| `.github/workflows/cd.yml` | 新建 | CD：镜像推送 |
| `backend/tests/test_health.py` | 修改 | 更新健康检查测试 |
