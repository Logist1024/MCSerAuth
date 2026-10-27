# ADR 0006：单一逻辑模型与 SQLite / MySQL / PostgreSQL 三库支持

- 状态：已采纳
- 日期：2026-10-27

## 背景

项目最初只支持 SQLite（better-sqlite3 + WAL），部署简单，但生产环境的备份、
并发与运维能力有限。运营方希望在不改变单体架构、不引入 ORM 抽象层的前提下，
按部署规模选择 SQLite、MySQL 8.0+ 或 PostgreSQL 16+。

三套数据库方言在以下能力上不一致，直接复制 schema 或散落 `if (dialect)` 会迅速腐化：

- MySQL 不支持 `RETURNING`，也没有 PostgreSQL 的部分唯一索引；
- SQLite 与 MySQL 的 `ON CONFLICT` / `ON DUPLICATE KEY` 语义不同；
- 时间戳、布尔值、JSON、自增主键的列类型与默认值不同；
- 迁移 SQL 无法跨方言复用。

## 决策

### 单一逻辑模型 + 代码生成

- `apps/server/src/db/schema/model.ts` 是**唯一**的 schema 事实来源：29 张表、
  列、索引、外键、默认值都以方言无关的描述声明。
- `apps/server/scripts/generate-schema.ts` 从该模型生成三份 Drizzle schema：
  `schema/generated/sqlite.ts`、`mysql.ts`、`postgres.ts`，以及运行时 facade
  `schema/index.ts`。生成文件带 `/* eslint-disable */`，**禁止手改**。
- 修改 schema 的流程固定为：改 `model.ts` → `pnpm db:generate`
  （生成三套 schema 与三套迁移）。
- 应用层以 PostgreSQL schema 的类型作为 canonical 类型；运行时由
  `DbService` 按方言激活真实的表对象（`export let` live binding +
  `activateSchema`）。业务代码只 import facade，不直接 import 方言文件。

### 方言识别

- 方言由 `DATABASE_URL` 协议推断：无协议或 `file:` / `sqlite:` 为 SQLite，
  `mysql:` / `mysql2:` 为 MySQL，`postgres:` / `postgresql:` 为 PostgreSQL。
- `DB_DIALECT` 是可选显式覆盖；与 URL 冲突时启动失败，避免连错库。
- 默认开发配置仍是 `./data/mcserauth.db`，零配置即可 `pnpm dev`。

### 运行时兼容层

`DbService` 暴露一组跨方言 helper，业务代码不直接使用方言特有的 API：

| Helper            | SQLite / PostgreSQL         | MySQL                                    |
| ----------------- | --------------------------- | ---------------------------------------- |
| `insertReturning` | 原生 `RETURNING`            | `$returningId()` / 显式主键 + 按主键回查 |
| `updateReturning` | 原生 `RETURNING`            | 先查 → 更新 → 按主键再查（校验影响行数） |
| `insertIgnore`    | `ON CONFLICT DO NOTHING`    | 主键自赋值的 `ON DUPLICATE KEY UPDATE`   |
| `upsert`          | `ON CONFLICT ... DO UPDATE` | `ON DUPLICATE KEY UPDATE`（忽略 target） |
| `affectedRows`    | 驱动返回值归一              | 驱动返回值归一                           |
| `primaryKeyOf`    | 读取表模型主键              | 读取表模型主键                           |
| `transaction`     | 见下方说明                  | 见下方说明                               |

- 事务使用 `AsyncLocalStorage<CanonicalDb>` 传递当前事务连接，而不是全局深度计数；
  并发请求不会串用彼此的事务。
- MySQL 的 `insertReturning` / `updateReturning` 依赖单一主键：支持自增主键或调用方
  显式提供的主键；复合主键会明确报错，避免静默返回错误行。`updateReturning` 在
  MySQL 上会检查实际影响行数，保证 OAuth 授权码/刷新令牌的 compare-and-swap 语义。
- SQLite 只有一个连接和一个写者，顶层事务通过 Promise 队列串行化，避免并发请求在
  同一连接上重复 `BEGIN IMMEDIATE`；MySQL / PostgreSQL 使用连接池事务，可并行执行。
- MySQL 没有部分唯一索引，因此 `skin` 增加 `active_slot` 判别列：
  活跃纹理写 `player_uuid:kind`，非活跃写 `NULL`，配合普通唯一索引实现
  “每个玩家每种纹理最多一条 active”。
- 可空列的排序不依赖数据库默认的 NULL 位置：SQLite/MySQL 把 NULL 当最小值，
  PostgreSQL 当最大值。统一使用 `nullsLast()`（`src/common/helpers/order.ts`）
  作为第一排序键。

### 迁移

- 迁移目录按方言拆分：`drizzle/sqlite/`、`drizzle/mysql/`、`drizzle/postgres/`。
- SQLite 保留历史迁移并新增 `0010`（`active_slot`）与 `0011`（恢复全部外键）；
  MySQL 与 PostgreSQL 各自只有一份初始迁移 `0000`，包含完整外键。
- `pnpm db:migrate` 根据 `DATABASE_URL` 自动选择目录与驱动。
- SQLite 不支持 `ALTER TABLE ... ADD CONSTRAINT`，`0010` / `0011` 都需要全表重建。
  由于 `PRAGMA foreign_keys=OFF` 在 Drizzle 事务内不会生效，迁移采用
  “备份旧表 → 删除旧表 → 建新表 → 重命名 → 从备份回填 → 建索引 → 删备份”的顺序；
  `0011` 按子表先删、父表先建/先回填，确保不触发级联删除。
- `model.ts` 中的每个 `references` 都会生成到三套 schema 与迁移；测试会校验
  外键目标列类型一致、无效外键被拒绝、用户删除级联到玩家。
- `pnpm db:generate` 一次生成三套迁移；`pnpm db:generate:sqlite` 只生成 SQLite。

### 测试与 CI

- 测试默认使用临时 SQLite 文件；设置 `TEST_DATABASE_URL` 后按协议切换到
  MySQL / PostgreSQL。每个测试文件创建并销毁独立数据库，可并行运行。
- CI 分为 SQLite 测试与 MySQL/PostgreSQL service container 矩阵；
  两者都会先对空库执行 `pnpm db:migrate`，再跑同一套测试。
- `test/schema.model.test.ts` 在没有真实 MySQL/PostgreSQL 时也能提前拦住方言
  问题：索引/外键列必须声明长度（MySQL 不能索引无长度 TEXT）、索引键不超过
  3072 字节（utf8mb4）、外键目标必须是主键或唯一列（PostgreSQL 要求）、
  `SET NULL` 外键必须可空，以及所有权外键不得缺失。

### 一次性数据迁移

`pnpm db:copy-data` 将 SQLite 数据复制到 MySQL / PostgreSQL：

1. 目标 schema 必须已迁移；
2. 目标非空时默认拒绝，需显式 `--truncate`；
3. 按外键顺序分批写入，PostgreSQL 复制后修复 sequence；
4. 复制完成后按行数 + 全行 SHA-256 校验，失败回滚；
5. `--dry-run` 只做 schema 校验与计数。

## 影响

- 新增 schema 字段只改 `model.ts`，三套 schema 与迁移由生成器保证一致。
- 业务代码基本不感知方言；新增 SQL 时必须通过 `DbService` helper，
  或在三库测试矩阵下验证。
- SQLite 仍是默认开发库；生产可平滑切换到 MySQL / PostgreSQL。
- 维护成本集中在 `model.ts`、`generate-schema.ts` 与 `DbService` 三个文件，
  而不是散落的方言分支。
- 已知限制：MySQL 的 `updateReturning` 是“查-改-查”，高并发下返回值可能
  包含其他事务的更新；需要强一致返回值的场景应使用 PostgreSQL 或改用显式锁。
