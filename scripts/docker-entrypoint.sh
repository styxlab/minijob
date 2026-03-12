#!/bin/sh
set -e
# Start Redis in same container only when requested (e.g. USE_REDIS_IN_CONTAINER=1)
if [ -n "${USE_REDIS_IN_CONTAINER}" ] && command -v redis-server >/dev/null 2>&1; then
  redis-server --daemonize yes
  for i in 1 2 3 4 5; do
    redis-cli ping 2>/dev/null && break
    sleep 1
  done
fi
exec "$@"
