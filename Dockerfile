# MCSerAuth 单镜像：server(:8000) 与 web(:3000) 同容器运行，由 docker/entrypoint.sh
# 先执行数据库迁移再拉起两个进程。
#
# 构建上下文必须是仓库根目录（web/server 都依赖 workspace 里的 packages/shared）：
#
#   docker build -t mcserauth .
#   docker run --env-file .env -p 127.0.0.1:8000:8000 -p 127.0.0.1:3000:3000 \
#     -v mcserauth-data:/app/server/data mcserauth
#
# 完整说明见 docs/deploy.md 的 Docker 章节。

# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-slim
ARG PNPM_VERSION=9.15.9

# ---------------------------------------------------------------------------
# 构建阶段：安装全部依赖并产出 shared dist / server dist / web standalone
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# 先只拷贝依赖清单，lockfile 未变时该层可命中缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @mcserauth/shared build \
  && pnpm --filter @mcserauth/server build \
  # API_PROXY_TARGET 在 next build 时被序列化进 standalone 产物，运行时改环境变量
  # 不生效；单容器内 web 的 /api rewrite 固定转发给同容器 8000 端口的 server。
  && API_PROXY_TARGET=http://127.0.0.1:8000 pnpm --filter @mcserauth/web build

# 服务端生产依赖：pnpm deploy 产出自包含的 node_modules
# （@mcserauth/shared 按 files 字段以 dist 形式带上，better-sqlite3/argon2/sharp
# 等原生模块使用 builder 阶段的 glibc 预编译产物）。
RUN pnpm --filter @mcserauth/server deploy --prod /out/server

# ---------------------------------------------------------------------------
# 运行阶段：非 root 用户，两个进程由 entrypoint 以 PID 1 兄弟进程方式监管
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    TZ=UTC \
    PORT=8000 \
    # Next standalone server 的监听地址/端口（server.js 读取）
    HOSTNAME=0.0.0.0 \
    WEB_PORT=3000 \
    # SQLite 数据库与上传目录，相对路径基于 /app/server 解析；compose 里挂卷
    DATABASE_URL=./data/mcserauth.db \
    UPLOAD_DIR=./data/uploads
WORKDIR /app

# server：生产依赖 + 编译产物 + 迁移脚本（entrypoint 启动前执行 migrate.mjs）。
# package.json 必须位于 dist 的上一级：src/app.constants.ts 用相对路径读它取版本号。
COPY --from=builder --chown=node:node /out/server/node_modules /app/server/node_modules
COPY --from=builder --chown=node:node /out/server/package.json /app/server/package.json
COPY --from=builder --chown=node:node /app/apps/server/dist /app/server/dist
COPY --from=builder --chown=node:node /app/apps/server/drizzle /app/server/drizzle
COPY --from=builder --chown=node:node /app/apps/server/scripts /app/server/scripts

# web：Next standalone（自带裁剪后的 node_modules）+ 静态资源。
# Monorepo 布局：server.js 位于 standalone/apps/web/ 下，node_modules 在 standalone 根。
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone /app/web
COPY --from=builder --chown=node:node /app/apps/web/.next/static /app/web/apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public /app/web/apps/web/public

COPY --chown=node:node docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh \
  && mkdir -p /app/server/data \
  && chown -R node:node /app/server/data

USER node

# 两个进程都必须存活才算健康（server 用无数据库依赖的 /health/live）
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "Promise.all([fetch('http://127.0.0.1:8000/health/live'),fetch('http://127.0.0.1:3000/')]).then((rs)=>process.exit(rs.every((r)=>r.ok)?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
