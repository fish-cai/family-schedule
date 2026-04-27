# 后端部署文档

## 架构概览

```
用户 → Nginx (80/443) → FastAPI Backend (8000) → PostgreSQL (5432)
                                                → Redis (6379)
```

- **服务器**: `ubuntu@124.223.81.74`
- **域名**: `https://fishschedule.cloud`
- **远程目录**: `/home/ubuntu/family-schedule`

---

## 组件信息

| 组件 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| PostgreSQL | `postgres:16-alpine` | 5432 | 数据持久化到 `pgdata` volume |
| Redis | `redis:7-alpine` | 6379 | 缓存与任务队列 |
| Backend | `python:3.12-slim` | 8000 | FastAPI + Gunicorn (生产 4 worker) |
| Nginx | `nginx:alpine` | 80/443 | 反向代理，HTTPS 终结 |

---

## 关键文件

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 本地开发编排 |
| `docker-compose.prod.yml` | 生产环境编排 |
| `deploy.sh` | 一键部署脚本（rsync + docker compose） |
| `setup-https.sh` | HTTPS 证书配置（Let's Encrypt） |
| `backend/Dockerfile` | 后端镜像构建 |
| `backend/entrypoint.sh` | 容器启动入口（迁移 + 启动服务） |
| `backend/alembic.ini` | 数据库迁移配置 |
| `backend/app/core/config.py` | 应用配置（环境变量定义） |
| `nginx/nginx.conf` | Nginx 路由配置 |
| `.env` | 本地开发环境变量 |
| `.env.production` | 生产环境变量（服务器上，不同步） |

---

## 环境变量

### 必须配置（生产）

| 变量 | 说明 | 示例 |
|------|------|------|
| `SECRET_KEY` | JWT 签名密钥，≥32 字符 | 随机字符串 |
| `DB_PASSWORD` | 数据库密码 | 安全密码 |
| `WECHAT_APP_ID` | 微信小程序 AppID | `wxd43411f5f6152380` |
| `WECHAT_APP_SECRET` | 微信小程序 Secret | 32 字符串 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | `sk-xxx` |

### 可选配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEBUG` | `true` | 生产设为 `false` |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@db:5432/family_schedule` | 数据库连接串 |
| `REDIS_URL` | `redis://redis:6379/0` | Redis 连接串 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080`（7天） | Token 过期时间 |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | CORS 允许域名 |
| `LLM_PROVIDER` | `deepseek` | LLM 提供商 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名称 |
| `WORKERS` | `4` | Gunicorn worker 数 |
| `PORT` | `80` | Nginx 监听端口 |

> **安全校验**: 生产环境 `DEBUG=false` 时，若 `SECRET_KEY` 仍为默认值会拒绝启动。

---

## 启动流程

### 容器启动顺序

1. **PostgreSQL** 启动 → 健康检查通过（`pg_isready`）
2. **Redis** 启动 → 健康检查通过（`redis-cli ping`）
3. **Backend** 启动 → `entrypoint.sh` 执行：
   - `alembic upgrade head`（自动执行数据库迁移）
   - 根据 `DEBUG` 启动 uvicorn（开发）或 gunicorn（生产）
4. **Nginx** 启动 → 依赖 Backend 健康检查通过

### Nginx 路由规则

| 路径 | 转发目标 |
|------|----------|
| `/api/*` | `backend:8000`（30s 超时） |
| `/health` | `backend:8000` |
| 其他 | 404 JSON |

---

## 常用操作

### 本地开发

```bash
# 启动所有服务
docker compose up -d --build

# 查看日志
docker compose logs -f backend

# 仅重启后端
docker compose restart backend

# 停止所有服务
docker compose down
```

### 部署到服务器

```bash
# 一键部署（同步代码 + 重建 + 重启）
./deploy.sh
```

脚本流程：
1. `rsync` 同步代码到服务器（排除 `.git`、`node_modules`、`.env` 等）
2. `docker compose up -d --build` 重建并重启
3. 等待健康检查 → 检查容器状态 → 测试 `/health`

### 数据库操作

```bash
# 进入服务器
ssh ubuntu@124.223.81.74

# 进入后端容器执行迁移
cd /home/ubuntu/family-schedule
sudo docker compose --env-file .env.production -f docker-compose.prod.yml exec backend alembic upgrade head

# 进入数据库
sudo docker compose --env-file .env.production -f docker-compose.prod.yml exec db psql -U postgres -d family_schedule

# 查看迁移历史
sudo docker compose --env-file .env.production -f docker-compose.prod.yml exec backend alembic history
```

### HTTPS 证书

```bash
# 首次配置（远程执行）
ssh ubuntu@124.223.81.74 'bash -s' < setup-https.sh

# 证书自动续期已通过 cron 配置（每月 1 日 3:00）
# 手动续期
ssh ubuntu@124.223.81.74 "sudo certbot renew"
```

### 查看服务状态

```bash
# 服务器上查看容器状态
ssh ubuntu@124.223.81.74 "cd /home/ubuntu/family-schedule && sudo docker compose --env-file .env.production -f docker-compose.prod.yml ps"

# 远程查看后端日志
ssh ubuntu@124.223.81.74 "cd /home/ubuntu/family-schedule && sudo docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=50 backend"

# 健康检查
curl https://fishschedule.cloud/health
```
