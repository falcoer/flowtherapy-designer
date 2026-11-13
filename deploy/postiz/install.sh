#!/usr/bin/env bash
# Installe Postiz sur un VPS Ubuntu neuf (à lancer en root depuis ce dossier).
# Idempotent : relancé, il garde le .env existant et met juste les conteneurs à jour.
set -euo pipefail
cd "$(dirname "$0")"
DEST=/opt/postiz

# 1. Docker
if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# 2. Swap de 2 Go : marge pour les pics de Postiz et Temporal sur 4 Go de mémoire
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# 3. Pare-feu : SSH et web seulement
if command -v ufw >/dev/null; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

# 4. Fichiers et secrets
mkdir -p "$DEST"
cp -r docker-compose.yml Caddyfile dynamicconfig "$DEST"/
if [ ! -f "$DEST/.env" ]; then
  cp .env.example "$DEST/.env"
  gen() { openssl rand -hex 32; }
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(gen)/; s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(gen)/; s/^TEMPORAL_DB_PASSWORD=.*/TEMPORAL_DB_PASSWORD=$(gen)/" "$DEST/.env"
fi
chmod 600 "$DEST/.env"

# 5. Démarrage
cd "$DEST"
docker compose pull
docker compose up -d
docker compose ps
