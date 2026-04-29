#!/usr/bin/env bash
# Runs on Hetzner VM. Installs nginx, deploys v96/v97 bundle, serves on 127.0.0.1:8080.
set -e

echo '=== 1. install nginx ==='
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx 2>&1 | tail -3

echo '=== 2. unpack bundle ==='
rm -rf /var/www/vsfb-kiosk
mkdir -p /var/www/vsfb-kiosk
tar xzf /tmp/vsfb-dist.tgz -C /var/www/vsfb-kiosk
chown -R www-data:www-data /var/www/vsfb-kiosk
ls /var/www/vsfb-kiosk
echo '-- index.html refs --'
grep -oE '(src|href)="[^"]*"' /var/www/vsfb-kiosk/index.html | head -5

echo '=== 3. nginx site ==='
cat > /etc/nginx/sites-available/vsfb-kiosk <<'NGX'
server {
    listen 127.0.0.1:8080 default_server;
    server_name _;
    root /var/www/vsfb-kiosk;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    add_header Access-Control-Allow-Origin "*" always;
    location = /favicon.ico { log_not_found off; access_log off; }
}
NGX
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/vsfb-kiosk /etc/nginx/sites-enabled/vsfb-kiosk
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo '=== 4. verify locally ==='
curl -sI -o /dev/null -w 'retro code=%{http_code}\n' http://127.0.0.1:8080/retro
curl -sI -o /dev/null -w 'index code=%{http_code}\n' http://127.0.0.1:8080/
echo '-- bundle hash from served index --'
curl -s http://127.0.0.1:8080/ | grep -oE '(src|href)="/assets/index-[^"]*"' | head -2
