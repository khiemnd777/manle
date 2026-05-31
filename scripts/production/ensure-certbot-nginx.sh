#!/usr/bin/env sh
set -eu

FE_DOMAIN="${FE_DOMAIN:-manle.info}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.manle.info}"
API_DOMAIN="${API_DOMAIN:-api.manle.info}"

FE_UPSTREAM="${FE_UPSTREAM:-http://127.0.0.1:5173}"
ADMIN_UPSTREAM="${ADMIN_UPSTREAM:-http://127.0.0.1:5174}"
API_UPSTREAM="${API_UPSTREAM:-http://127.0.0.1:8787}"
ENV_FILE="${ENV_FILE:-.env.prod}"

env_value() {
  key="$1"
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

NGINX_CLIENT_MAX_BODY_SIZE="${NGINX_CLIENT_MAX_BODY_SIZE:-$(env_value NGINX_CLIENT_MAX_BODY_SIZE)}"
NGINX_CLIENT_MAX_BODY_SIZE="${NGINX_CLIENT_MAX_BODY_SIZE:-20m}"

: "${PROD_CERTBOT_EMAIL:?PROD_CERTBOT_EMAIL is required}"

if [ "${PROD_SUDO_PASSWORD_STDIN:-}" = "1" ] && [ -z "${PROD_SUDO_PASSWORD:-}" ]; then
  IFS= read -r PROD_SUDO_PASSWORD || true
fi

run_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if [ -n "${PROD_SUDO_PASSWORD:-}" ]; then
    printf '%s\n' "$PROD_SUDO_PASSWORD" | sudo -S -p '' "$@"
    return
  fi

  sudo "$@"
}

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    run_sudo apt-get update
    run_sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx
    return
  fi

  echo "Unsupported server package manager. Install nginx, certbot, and python3-certbot-nginx manually." >&2
  exit 1
}

write_http_nginx_config() {
  tmp_file="$(mktemp)"

  cat > "$tmp_file" <<EOF_NGINX
map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 80;
  listen [::]:80;
  server_name ${FE_DOMAIN};

  location / {
    proxy_pass ${FE_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}

server {
  listen 80;
  listen [::]:80;
  server_name ${ADMIN_DOMAIN};

  location / {
    proxy_pass ${ADMIN_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}

server {
  listen 80;
  listen [::]:80;
  server_name ${API_DOMAIN};
  client_max_body_size ${NGINX_CLIENT_MAX_BODY_SIZE};

  location / {
    proxy_pass ${API_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}
EOF_NGINX

  run_sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  run_sudo cp "$tmp_file" /etc/nginx/sites-available/manle.conf
  rm -f "$tmp_file"
  run_sudo ln -sf /etc/nginx/sites-available/manle.conf /etc/nginx/sites-enabled/manle.conf
  run_sudo rm -f /etc/nginx/sites-enabled/default
  run_sudo nginx -t
}

write_ssl_nginx_config() {
  tmp_file="$(mktemp)"

  cat > "$tmp_file" <<EOF_NGINX
map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 80;
  listen [::]:80;
  server_name ${FE_DOMAIN};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${FE_DOMAIN};
  ssl_certificate /etc/letsencrypt/live/${FE_DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${FE_DOMAIN}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  location / {
    proxy_pass ${FE_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}

server {
  listen 80;
  listen [::]:80;
  server_name ${ADMIN_DOMAIN};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${ADMIN_DOMAIN};
  ssl_certificate /etc/letsencrypt/live/${ADMIN_DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${ADMIN_DOMAIN}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  location / {
    proxy_pass ${ADMIN_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}

server {
  listen 80;
  listen [::]:80;
  server_name ${API_DOMAIN};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${API_DOMAIN};
  client_max_body_size ${NGINX_CLIENT_MAX_BODY_SIZE};
  ssl_certificate /etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${API_DOMAIN}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  location / {
    proxy_pass ${API_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}
EOF_NGINX

  run_sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  run_sudo cp "$tmp_file" /etc/nginx/sites-available/manle.conf
  rm -f "$tmp_file"
  run_sudo ln -sf /etc/nginx/sites-available/manle.conf /etc/nginx/sites-enabled/manle.conf
  run_sudo rm -f /etc/nginx/sites-enabled/default
  run_sudo nginx -t
}

all_certs_exist() {
  run_sudo test -f "/etc/letsencrypt/live/${FE_DOMAIN}/fullchain.pem" \
    && run_sudo test -f "/etc/letsencrypt/live/${ADMIN_DOMAIN}/fullchain.pem" \
    && run_sudo test -f "/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem"
}

issue_cert() {
  domain="$1"

  if run_sudo test -f "/etc/letsencrypt/live/${domain}/fullchain.pem"; then
    echo "Certificate already exists for ${domain}"
    return
  fi

  run_sudo certbot --nginx --non-interactive --agree-tos --redirect --email "$PROD_CERTBOT_EMAIL" -d "$domain"
}

install_packages

if all_certs_exist; then
  write_ssl_nginx_config
else
  write_http_nginx_config
fi

if command -v systemctl >/dev/null 2>&1; then
  run_sudo systemctl enable --now nginx
else
  run_sudo service nginx start || true
fi

issue_cert "$FE_DOMAIN"
issue_cert "$ADMIN_DOMAIN"
issue_cert "$API_DOMAIN"

if all_certs_exist; then
  write_ssl_nginx_config
fi

run_sudo nginx -t

if command -v systemctl >/dev/null 2>&1; then
  run_sudo systemctl reload nginx
  run_sudo systemctl enable --now certbot.timer || true
else
  run_sudo service nginx reload || true
fi

echo "Nginx and Certbot are ready for ${FE_DOMAIN}, ${ADMIN_DOMAIN}, ${API_DOMAIN}"
