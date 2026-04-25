#!/bin/bash
# HTTPS 配置脚本 - 域名备案通过后运行
# 用法: ssh ubuntu@124.223.81.74 'bash -s' < setup-https.sh
set -e

DOMAIN="fishschedule.cloud"

echo "1. 安装 certbot..."
sudo apt-get update -qq
sudo apt-get install -y -qq certbot

echo "2. 停止 nginx 释放 80 端口..."
cd /home/ubuntu/family-schedule
sudo docker compose --env-file .env.production -f docker-compose.prod.yml stop nginx

echo "3. 申请 Let's Encrypt 证书..."
sudo certbot certonly --standalone -d "${DOMAIN}" --non-interactive --agree-tos --email admin@${DOMAIN}

echo "4. 配置 nginx SSL..."
cat > /home/ubuntu/family-schedule/nginx/nginx.conf << 'NGINXEOF'
upstream backend {
    server backend:8000;
}

server {
    listen 80;
    server_name fishschedule.cloud;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name fishschedule.cloud;

    ssl_certificate /etc/letsencrypt/live/fishschedule.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fishschedule.cloud/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 10M;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

echo "5. 更新 docker-compose 挂载证书..."
cat > /home/ubuntu/family-schedule/docker-compose.prod.yml << 'YAMLEOF'
services:
  db:
    image: postgres:16-alpine
    env_file: .env.production
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
      - "80:80"
      - "443:443"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      backend:
        condition: service_healthy
    restart: always

volumes:
  pgdata:
YAMLEOF

echo "6. 重建并启动所有服务..."
cd /home/ubuntu/family-schedule
sudo docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

echo "7. 配置证书自动续期..."
(sudo crontab -l 2>/dev/null; echo "0 3 1 * * certbot renew --pre-hook 'docker compose -f /home/ubuntu/family-schedule/docker-compose.prod.yml stop nginx' --post-hook 'docker compose -f /home/ubuntu/family-schedule/docker-compose.prod.yml start nginx'") | sudo crontab -

echo ""
echo "✅ HTTPS 配置完成！"
echo "访问: https://fishschedule.cloud/health"
