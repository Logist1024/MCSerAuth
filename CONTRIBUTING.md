# 参与开发

本文是协作入口：只列规则与去向，具体操作步骤见链接目标。

## 环境准备

- Node.js 22 LTS（仓库根 `.nvmrc` 已固定）+ corepack 启用的 pnpm。
- 安装与启动步骤（clone → `pnpm install` → `db:migrate` → `pnpm dev`）见
  [README「快速开始」](README.md)；常用命令表与环境变量表也在 README。
- 本仓库是 pnpm monorepo：`apps/server`（NestJS）、`apps/web`（Next.js）、
  `packages/shared`（跨端契约）。目录职责见 README「仓库结构」。

## 分支与提交

- trunk-based：工作项直接在 `main` 上小步提交，不做长周期 feature 分支；每个工作项
  保持为一组原子提交，保证 `main` 任何时候可构建可测试。
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)
  （`feat:` `fix:` `docs:` `refactor:` `test:` `chore:` …），主题行用英文，正文可中文。
- pre-commit 钩子自动对暂存文件跑 lint-staged（ESLint + Prettier）；提交前请确保
  `pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test` 全绿。

## 质量底线（DoD）

完整定义见 [`docs/2.0-开发指南.md`](docs/2.0-开发指南.md) §7，要点：

- 新模块必须带 service 级测试；修缺陷先写复现测试再修；改动 controller / 守卫 /
  过滤器行为必须同步 `apps/server/test/e2e/` 的 HTTP e2e（形态见 ADR 0008）。
- 公共读接口维持既有缓存策略（ADR 0004）；新增列表接口必须有分页与索引说明。
- 重大决策落 [`docs/adr/`](docs/adr/)；协议行为变更同时更新
  [`docs/protocol-checklist.md`](docs/protocol-checklist.md) §5 变更记录。

## 契约与数据层纪律

- **跨端契约只写 `packages/shared`**：DTO、错误码、枚举、zod schema，应用内不得复制类型。
- **建表只改 `apps/server/src/db/model.ts`**，然后 `pnpm db:generate` 生成三方言 schema 与
  迁移；生成物禁止手改，CI 的 `db:check` 会拒绝不一致。三库迁移必须成对生成，
  背景见 ADR 0006 / 0007 与 [`docs/database.md`](docs/database.md)。
- 协议端点（Commons-Designs）不套统一 envelope，返回协议原生形状；改动前先读
  [`docs/protocol-checklist.md`](docs/protocol-checklist.md) 的对应字段表。

## 提交 PR

PR 模板自带检查单（lint / typecheck / test / build、涉库改动的 `db:generate`、
协议端点保持不动、同步 checklist 与 openapi），按单打勾即可。
发布相关：涉及契约时 `pnpm openapi:export` 刷新 [`docs/openapi.json`](docs/openapi.json)。

## 文档同步义务

改动落在以下域时，同步对应文档（随同一 PR 提交）：

| 改动域        | 文档                                                       |
| ------------- | ---------------------------------------------------------- |
| 数据库 / 迁移 | [`docs/database.md`](docs/database.md)                     |
| 部署 / 备份   | [`docs/deploy.md`](docs/deploy.md)                         |
| 安全基线      | [`docs/security.md`](docs/security.md)                     |
| 协议字段      | [`docs/protocol-checklist.md`](docs/protocol-checklist.md) |
| 里程碑 / 规划 | [`docs/2.0-开发指南.md`](docs/2.0-开发指南.md) 状态列      |

## License

提交即表示同意代码以 [MIT License](LICENSE) 发布。
