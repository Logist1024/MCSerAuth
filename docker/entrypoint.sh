#!/usr/bin/env bash
# MCSerAuth 单镜像入口（PID 1）：先执行数据库迁移，再同容器拉起 server 与 web。
# 任一进程退出即整体退出（交给 Docker restart 策略重启），SIGTERM/SIGINT 转发给两个子进程。
#
# 手动执行一次性命令：
#   docker run --rm -it --entrypoint <image> node scripts/migrate.mjs   # 只跑迁移
set -euo pipefail

# 镜像内本脚本位于 /app/entrypoint.sh，从自身位置推导根目录
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 显式传参时直接 exec，不进入监管模式
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

echo '[entrypoint] applying database migrations...'
cd "$APP_ROOT/server"
node scripts/migrate.mjs

node dist/main.js & SERVER_PID=$!
cd "$APP_ROOT/web/apps/web"
node server.js & WEB_PID=$!

shutdown() {
  kill "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
  wait "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
}
trap shutdown TERM INT

echo "[entrypoint] server (pid $SERVER_PID) on :8000, web (pid $WEB_PID) on :3000"

# 任一子进程退出都视为容器失败，收掉另一个后以相同码退出
set +e
wait -n "$SERVER_PID" "$WEB_PID"
CODE=$?
echo "[entrypoint] a child process exited with code $CODE, shutting down"
shutdown
exit "$CODE"
