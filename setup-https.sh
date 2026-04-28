#!/bin/bash
# HTTPS 初始化脚本 - 仅首次申请证书或修复证书时运行
# 用法: ssh ubuntu@124.223.81.74 'bash -s' < setup-https.sh
set -e

DOMAIN="fishschedule.cloud"
REMOTE_DIR="/home/ubuntu/family-schedule"
COMPOSE_FILE="docker-compose.prod.yml"

echo "1. 安装 certbot..."
sudo apt-get update -qq
sudo apt-get install -y -qq certbot

echo "2. 停止 nginx 释放 80 端口..."
cd "${REMOTE_DIR}"
sudo docker compose --env-file .env.production -f "${COMPOSE_FILE}" stop nginx

echo "3. 申请 Let's Encrypt 证书..."
sudo certbot certonly --standalone -d "${DOMAIN}" --non-interactive --agree-tos --email admin@${DOMAIN}

echo "4. 使用仓库内的生产 nginx/docker compose 配置重启服务..."
sudo docker compose --env-file .env.production -f "${COMPOSE_FILE}" up -d --build

echo "5. 配置证书自动续期..."
(sudo crontab -l 2>/dev/null | grep -v 'certbot renew'; echo "0 3 1 * * certbot renew --pre-hook 'docker compose --env-file ${REMOTE_DIR}/.env.production -f ${REMOTE_DIR}/${COMPOSE_FILE} stop nginx' --post-hook 'docker compose --env-file ${REMOTE_DIR}/.env.production -f ${REMOTE_DIR}/${COMPOSE_FILE} start nginx'") | sudo crontab -

echo ""
echo "✅ HTTPS 配置完成！"
echo "后续日常发布只需要运行 ./deploy.sh"
echo "访问: https://fishschedule.cloud/health"
