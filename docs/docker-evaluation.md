# Docker / Compose 评估：可选单镜像部署的定位与再评审条件

> 结论先行：**默认部署路径仍是裸机 runbook**（[`deploy.md`](deploy.md) §1–§8）。
> 同时提供**可选的单镜像 Docker 部署**：根目录 `Dockerfile`、`docker/entrypoint.sh`、
> `docker-compose.yml`，用法见 [`deploy.md`](deploy.md) §9。两种方式共享同一套环境变量
> 与单进程约束；Docker 是并存的第二条路径，不是默认路径的替代品。

## 为什么默认仍是裸机 runbook

1. **对目标读者，Docker 仍是额外门槛。** 主要画像是国内中小服主：装 Docker 引擎、
   理解 image / volume / 端口映射，并不比照着 runbook 复制粘贴 `pnpm` 命令更容易。
   裸机路径保持为“照着文档能跑通”的基线。
2. **首次构建成本更高。** 镜像内需要安装 workspace 依赖，`better-sqlite3`、`sharp`
   等原生模块依赖 glibc 预编译产物；Alpine/musl 场景还要额外工具链，构建慢、失败点更多。
3. **单进程硬约束让容器编排收益有限。** 限流、验证码、进程内缓存都是内存态，
   **只能单实例运行**（[`deploy.md`](deploy.md) §7、[`../deploy/ecosystem.config.cjs`](../deploy/ecosystem.config.cjs)
   注释）。横向扩展、多副本编排在本项目用不上；单机单容器只是把 pm2/systemd
   换了个名字，同时多出镜像维护、卷挂载与升级兼容的成本。
4. **两套路径的维护成本真实存在。** 镜像需要与 `.nvmrc`、pnpm workspace 布局、
   迁移产物保持同步；CI 目前覆盖三库矩阵与完整测试，但不构建镜像。

## Docker 路径的边界（使用前先确认）

- **单镜像双进程**：server(:8000) 与 web(:3000) 同容器运行；entrypoint 先执行数据库迁移，
  再以兄弟进程拉起两者，任一子进程退出即容器退出（交给 Docker restart 策略）。
- **只支持单实例**：不要用 `docker compose up --scale` 或 Kubernetes 多副本，
  否则限流阈值按进程数稀释，一次性验证码令牌也会跨进程失效。
- **数据必须挂载**：`apps/server/data`（SQLite 数据库与上传文件）要挂到持久卷；
  切到 MySQL/PostgreSQL 后该卷仍用于上传文件。
- **TLS 仍由宿主机终止**：compose 默认只绑定 `127.0.0.1:8000` / `127.0.0.1:3000`，
  由 Caddy/Nginx 反代并签发证书。
- **生产 env 强校验不变**：`COOKIE_SECURE=true`、非回环 `APP_URL`/`AUTH_URL`、
  显式 `MAIL_PROVIDER=smtp`（只填 `SMTP_*` 不会切换发件方式）。

## 再评审触发条件（满足任一即可调整定位）

- 出现 NAS / 面板一键部署需求，或第二套部署环境（预发布 / 多机房）；
- 有维护者愿意长期认领镜像构建、推送与版本发布；
- 限流 / 验证码 / 缓存外置（如 Redis），解除单进程约束，横向扩展收益成立；
- 基础镜像或原生模块（better-sqlite3 / sharp / argon2）升级导致构建链路明显变化。
