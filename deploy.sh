#!/bin/bash
# 一键部署脚本 - 从本地同步代码到服务器并重启服务
set -e

SERVER="ubuntu@124.223.81.74"
REMOTE_DIR="/home/ubuntu/family-schedule"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTHCHECK_URL="https://fishschedule.cloud/health"
FALLBACK_HEALTHCHECK_URL="http://124.223.81.74/health"

echo "📦 同步代码到服务器..."
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='__pycache__' \
  --exclude='.DS_Store' \
  --exclude='.env' \
  --exclude='.env.production' \
  --exclude='dist' \
  --exclude='frontend/.swc' \
  -e "ssh -o StrictHostKeyChecking=no" \
  "$(dirname "$0")/" "${SERVER}:${REMOTE_DIR}/"

echo "🔄 重建并重启服务..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && sudo docker compose --env-file .env.production -f ${COMPOSE_FILE} up -d --build"

echo "⏳ 等待服务健康检查..."
sleep 10

echo "🏥 检查服务状态..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && sudo docker compose --env-file .env.production -f ${COMPOSE_FILE} ps"

echo ""
echo "✅ 部署完成！"
if curl -fsS "${HEALTHCHECK_URL}" | python3 -m json.tool; then
  exit 0
fi

echo "⚠️ HTTPS 健康检查失败，尝试 HTTP 回退检查..."
curl -fsS "${FALLBACK_HEALTHCHECK_URL}" | python3 -m json.tool
