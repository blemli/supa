#!/bin/sh
# nginx in front of envoy: contributes /up and maps the second dashboard login (DASHBOARD2_*)
# onto the primary basic-auth pair - envoy's htpasswd template only holds one user.
set -e
: > /tmp/auth-map.conf
if [ -n "${DASHBOARD2_USERNAME:-}" ] && [ -n "${DASHBOARD2_PASSWORD:-}" ]; then
    FROM=$(printf '%s:%s' "$DASHBOARD2_USERNAME" "$DASHBOARD2_PASSWORD" | base64 | tr -d '\n')
    TO=$(printf '%s:%s' "$DASHBOARD_USERNAME" "$DASHBOARD_PASSWORD" | base64 | tr -d '\n')
    printf '"Basic %s" "Basic %s";\n' "$FROM" "$TO" > /tmp/auth-map.conf
fi
nginx -c /dritte/nginx.conf &
exec /bin/sh /docker-entrypoint.sh
