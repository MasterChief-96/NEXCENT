#!/bin/sh
set -eu
: "${ADMINER_GATE_USER:?Set ADMINER_GATE_USER}"
: "${ADMINER_GATE_PASSWORD:?Set ADMINER_GATE_PASSWORD}"
[ "${#ADMINER_GATE_PASSWORD}" -ge 16 ] || { echo 'Adminer gate password must contain at least 16 characters.' >&2; exit 1; }
# -i reads stdin; the password is not included in the process arguments.
printf '%s\n' "$ADMINER_GATE_PASSWORD" | htpasswd -iBc /etc/nginx/adminer.htpasswd "$ADMINER_GATE_USER" >/dev/null 2>&1
chmod 644 /etc/nginx/adminer.htpasswd
