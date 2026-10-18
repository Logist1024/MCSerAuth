# MCSerAuth

面向第三方 Minecraft: Java Edition 服务器的**一体化社区论坛 + 外置登录认证服务**。

认证侧实现 Commons-Designs 服务端协议（启动器 HMCL/PCL2 直接可用），社区侧提供论坛与玩家档案；
两块业务共用同一账号体系与基础设施，单体部署、单库 SQLite。

> **当前阶段：M0 底座（脚手架/基建/数据层/契约 stub）**
> 业务链路（OAuth 授权、会话签发、皮肤上传、论坛）尚未实现，协议端点以 stub 形式登记，
> 详见 [`docs/底座初步开发完成情况.md`](docs/底座初步开发完成情况.md) 与 [`docs/protocol-checklist.md`](docs/protocol-checklist.md)。

## 技术栈

| 层     | 选型                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------ |
| 运行时 | Node.js 22 LTS · pnpm 9 · TypeScript 6（全仓 ESM）                                                     |
| 后端   | NestJS 12 · better-auth（账号）· Drizzle ORM · better-sqlite3（SQLite + WAL）                          |
| 前端   | Next.js 16 App Router · React 19（只做渲染，业务全在后端）                                             |
| 契约   | NestJS Swagger → `docs/openapi.json`；Commons-Designs 协议对照 [checklist](docs/protocol-checklist.md) |
| 质量   | ESLint · Prettier · husky + lint-staged · GitHub Actions                                               |

## 仓库结构

```
MCSerAuth/
├── apps/
│   ├── server/              NestJS 单体后端
│   │   ├── src/config/      env 加载与 zod 校验（单一入口）
│   │   ├── src/common/      过滤器/拦截器/管道/日志脱敏/Swagger 封装
│   │   ├── src/db/          Drizzle 实例 + 全部 schema（15 张表）
│   │   ├── src/modules/     auth · session · profiles · forum · admin · health
│   │   └── drizzle/         迁移 SQL（drizzle-kit 生成，禁止手改）
│   └── web/                 Next.js App Router（渲染层）
├── packages/
│   └── shared/              跨端类型/DTO/错误码/zod schema（单一事实来源）
├── docs/                    策划案、开发指南、协议 checklist、OpenAPI 产物
└── .github/workflows/ci.yml
```

## 快速开始

要求：Node.js 22（`.nvmrc` 已固定）、corepack 可用的 pnpm。

```bash
git clone <repo> && cd MCSerAuth
corepack enable                 # 或使用 corepack pnpm <cmd>
pnpm install
cp .env.example apps/server/.env   # 可选：不复制也能跑（有开发默认值）
pnpm db:migrate                    # 建库 + 全部迁移（SQLite WAL）
pnpm dev                           # 同时拉起 server(:8000) 与 web(:3000)
```

启动后：

| 地址                              | 说明                                  |
| --------------------------------- | ------------------------------------- |
| <http://localhost:3000>           | web 首页（调用 `/health` 展示连通性） |
| <http://localhost:8000/health>    | 服务探活（统一封装 `{code:0,data}`）  |
| <http://localhost:8000/docs>      | Swagger UI（全部端点契约）            |
| <http://localhost:8000/docs/json> | OpenAPI JSON                          |

冒烟（注册 → 登录 → 会话）：

```bash
curl -c jar.txt -X POST http://localhost:8000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"S3cure!Passw0rd","name":"Tester"}'
curl -b jar.txt http://localhost:8000/api/auth/get-session
```

## 常用命令

根目录执行（`package.json` → `scripts`）：

| 命令                                | 作用                                   |
| ----------------------------------- | -------------------------------------- |
| `pnpm dev`                          | 并行启动 server + web（先构建 shared） |
| `pnpm build`                        | shared → server → web 全量构建         |
| `pnpm lint` / `pnpm lint:fix`       | 全仓 ESLint                            |
| `pnpm format` / `pnpm format:check` | Prettier                               |
| `pnpm typecheck`                    | 全仓 `tsc --noEmit`                    |
| `pnpm db:generate`                  | 依 schema 变更生成迁移 SQL             |
| `pnpm db:migrate`                   | 应用迁移（自动建目录、开 WAL）         |
| `pnpm db:studio`                    | Drizzle Studio 浏览数据                |
| `pnpm openapi:export`               | 构建并刷新 `docs/openapi.json`         |

## 环境变量

全部变量在 `apps/server/src/config/env.ts` 中 zod 校验，启动即失败、不做运行期兜底。
模板见根目录 [`.env.example`](.env.example)（复制到 `apps/server/.env`）。

| 变量                   | 默认（开发）                      | 说明                                            |
| ---------------------- | --------------------------------- | ----------------------------------------------- |
| `NODE_ENV`             | `development`                     | `production` 时强制校验 secret 与 Cookie        |
| `PORT`                 | `8000`                            | server 端口                                     |
| `LOG_LEVEL`            | `debug`（模板）                   | pino 级别；敏感字段自动脱敏                     |
| `APP_URL` / `AUTH_URL` | `http://localhost:3000` / `:8000` | 站点域 / 认证域分离占位（T2）                   |
| `COOKIE_SECURE`        | `false`                           | 生产必须 `true`（Secure/HttpOnly/SameSite=Lax） |
| `BETTER_AUTH_SECRET`   | 开发默认值                        | 生产必填（≥32 字符），`openssl rand -base64 48` |
| `DATABASE_URL`         | `./data/mcserauth.db`             | 相对路径按 `apps/server` 解析                   |
| `UPLOAD_DIR`           | `./data/uploads`                  | 纹理/附件目录（M2 使用）                        |
| `MAIL_*` / `SMTP_*`    | 占位                              | M0 不发邮件（T4）                               |

web 侧仅一个变量：`NEXT_PUBLIC_API_BASE_URL`（默认 `http://localhost:8000`），
模板见 [`apps/web/.env.example`](apps/web/.env.example)，复制为 `apps/web/.env.local` 生效。

## 数据层

- SQLite 开启 **WAL**、外键与 `busy_timeout`（`db.service.ts` 连接参数）。
- 15 张表 schema 在 `apps/server/src/db/schema/`（用户与账号、玩家与令牌、服务器白名单、
  皮肤披风、论坛帖子/回复/投票/举报/通知/审计日志），better-auth 的
  `session/account/verification` 由其自动维护、仅做 Drizzle 类型声明。
- **所有建表改动必须走 `pnpm db:generate` 生成迁移**，禁止手改库文件或运行时同步。
- 已定稿决策（S1 玩家 1:1、S2 皮肤披风同表、S4 别名 JSON、S5 软删除、S6 实时计数、S3 角色枚举）
  均已在 schema 中落地。

## API 契约

- 非协议端点统一封装：成功 `{ code: 0, data }`，失败 `{ code, message }`（错误码见 `packages/shared/src/errors.ts`）。
- **Commons-Designs 协议端点不套封装**，返回协议原生形状（错误为 `{ error, errorMessage }`），
  M0 未实现端点统一 `501 NotImplementedException`。
- 端点与逐字段核对底稿：[`docs/protocol-checklist.md`](docs/protocol-checklist.md)。
- 契约产物：[`docs/openapi.json`](docs/openapi.json)（`pnpm openapi:export` 刷新）。

## 开发约定

- 提交遵循 [Conventional Commits](https://www.conventionalcommits.org/)（`feat:` `fix:` `docs:` `chore:` …）。
- pre-commit 自动跑 lint-staged（ESLint + Prettier，见 `.husky/pre-commit`）。
- 跨端 DTO/枚举/错误码只写在 `packages/shared`，应用内不得复制类型。
- CI（`.github/workflows/ci.yml`）：install → lint → typecheck → build → 迁移冒烟。

## 里程碑与文档

| 文档                                                           | 内容                                       |
| -------------------------------------------------------------- | ------------------------------------------ |
| [`docs/项目策划案.md`](docs/项目策划案.md)                     | 产品范围、架构与全部已定稿决策（S1–S6 等） |
| [`docs/底座初步开发完成情况.md`](docs/底座初步开发完成情况.md) | M0 交付物、验收结论与遗留事项              |
| [`docs/protocol-checklist.md`](docs/protocol-checklist.md)     | 协议字段对照、启动器联调记录               |
| [`docs/openapi.json`](docs/openapi.json)                       | OpenAPI 契约产物（`pnpm openapi:export`）  |

M0（当前）之后：M1 认证核心（OAuth 链路 + session 签发）→ M2 皮肤披风 → M3 论坛 →
M5 生产部署；Paper 插件与启动器修改**永不**实施。

## License

[MIT](LICENSE)
