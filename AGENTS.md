# AGENTS.md — MCSerAuth 代理指南

第三方 Minecraft 服务器的一体化论坛 + 外部登录认证系统。pnpm monorepo（Node 22，见 `.nvmrc`；corepack 启用 pnpm 9）。文档以中文为主。

## 结构

- `apps/server` — NestJS 12 单体后端（Express 5），端口 8000。`src/config/`（zod 校验的唯一 env 入口）、`src/common/`（过滤器/守卫/拦截器/日志脱敏）、`src/db/`（Drizzle）、`src/modules/`（auth·session·profiles·forum·user·admin·site·growth·captcha·mail·maintenance·health）。
- `apps/web` — Next.js 16 App Router（React 19），端口 3000，**纯渲染层，业务逻辑都在 NestJS**。
- `packages/shared` — 跨端契约唯一事实来源：DTO、错误码、枚举、zod schema、协议暂定字段（`src/protocol/`）。
- `deploy/` 生产配置实例；`docs/` 策划案、开发/部署指南、ADR；`.github/workflows/ci.yml` CI。

## 常用命令

```bash
pnpm dev                # shared 先构建，再同时拉起 server(:8000) + web(:3000)
pnpm lint / format:check / typecheck / test   # 提交前四项全绿
pnpm --filter @mcserauth/server exec vitest run forum.service   # 聚焦单个测试
pnpm db:generate        # 生成三方言 schema + 迁移（改表后必跑）
pnpm db:check           # CI 校验：生成物与源模型必须一致
pnpm db:migrate / db:seed
pnpm openapi:export     # 改契约后刷新 docs/openapi.json
```

`pnpm typecheck` 会先构建 shared（web/server 都从 shared 的 `dist` 导入，改 shared 后必须重新构建）。

## 硬性边界

- **跨端类型只写在 `packages/shared`**，应用内不得复制 DTO/枚举/错误码。
- **建表只改 `apps/server/src/db/schema/model.ts`**，然后 `pnpm db:generate` 生成三方言 schema 与迁移。生成物（`src/db/schema/generated/`、`index.ts`、`drizzle/`）禁止手改；三库迁移必须成对生成（ADR 0006/0007，背景见 `docs/database.md`）。
- **协议端点（Commons-Designs/yggdrasil）不套统一 `{code,data}` envelope**，返回协议原生形状：错误为 `{error, errorMessage}`。实现集中在 `modules/auth/yggdrasil.controller.ts`、`modules/auth/oauth.*`、`modules/profiles/`。改协议字段前必读 `docs/protocol-checklist.md` 的字段表，字段暂定值集中在 `packages/shared/src/protocol/`。
- 公共读接口维持既有缓存策略（ADR 0004）；新增列表接口必须有分页与索引说明。

## 约定与陷阱

- TS 严格模式：`no-explicit-any` 为 error、`noUncheckedIndexedAccess`（索引访问返回 `T | undefined`）、`verbatimModuleSyntax`。
- `apps/server/src/**` 内 `consistent-type-imports` 规则被关闭：NestJS DI 依赖装饰器元数据，构造参数中的“类型导入”实为运行时值，**不要当 lint 误报去“修”**。
- 测试统一 vitest：新模块必须带 service 级测试；改 controller/守卫/过滤器行为必须同步 `apps/server/test/e2e/` 的 HTTP e2e（ADR 0008）。server 测试强制 `TZ=UTC`、`pool: 'forks'`（better-sqlite3 原生模块）、缓存目录按包隔离（并行跑避免 ENOTCLOSED）。
- 提交：trunk-based 直接提交 `main`，Conventional Commits，主题行英文。
- **`apps/web/AGENTS.md`（next dev 自动生成）**：此 Next 版本可能超出训练数据，写 web 代码前先读 `apps/web/node_modules/next/dist/docs/`；不要删除该文件中的规则块。

## 改动域 → 文档同步（随同一 PR）

| 改动域        | 文档                            |
| ------------- | ------------------------------- |
| 数据库 / 迁移 | `docs/database.md`              |
| 部署 / 备份   | `docs/deploy.md`                |
| 安全基线      | `docs/security.md`              |
| 协议字段      | `docs/protocol-checklist.md` §5 |
| 重大决策      | `docs/adr/`（新增 ADR）         |
| 里程碑进度    | `docs/2.0-开发指南.md` 状态列   |

协作入口与完整规则见 `CONTRIBUTING.md`；当前 2.0 进度（未关闭项：F1 真机联调、T5 前端测试）见 `docs/2.0-开发指南.md`。
