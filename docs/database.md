# 数据库指南

MCSerAuth 支持 SQLite、MySQL 8.0+ 与 PostgreSQL 16+。三者共用同一套业务代码、
同一份逻辑 schema 和同一组测试；切换数据库只需要改 `DATABASE_URL`。

- SQLite 是默认开发库，零配置、单文件、适合本地与小规模单机部署。
- MySQL / PostgreSQL 面向生产环境，提供连接池、并发写入与标准备份工具。

设计取舍见 [ADR 0006](adr/0006-multi-database.md)。

## 配置

```bash
# SQLite（默认）
DATABASE_URL=./data/mcserauth.db

# MySQL
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/mcserauth

# PostgreSQL
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/mcserauth
```

方言由 URL 协议自动识别。`DB_DIALECT` 只用于显式覆盖，且必须与 URL 一致，
否则启动直接失败。其余连接参数：

| 变量                       | 默认    | 说明                            |
| -------------------------- | ------- | ------------------------------- |
| `DB_POOL_MIN`              | `0`     | 连接池最小连接数（SQLite 忽略） |
| `DB_POOL_MAX`              | `10`    | 连接池最大连接数（SQLite 忽略） |
| `DB_CONNECTION_TIMEOUT_MS` | `10000` | 建立连接超时                    |
| `DB_IDLE_TIMEOUT_MS`       | `30000` | 空闲连接回收时间                |
| `DB_SSL`                   | `false` | MySQL/PostgreSQL 是否强制 TLS   |

生产环境建议：`DB_POOL_MAX` 按实例数与数据库最大连接数分配；
托管数据库通常要求 `DB_SSL=true`。

## Schema 工作流

唯一事实来源是 `apps/server/src/db/schema/model.ts`。三份 Drizzle schema 与运行时
facade 都由生成器产出，**不要手改生成文件**。

```bash
# 1. 修改 model.ts
# 2. 生成三套 schema + 三套迁移
pnpm db:generate

# 只生成 schema（不生成迁移）
pnpm db:generate:schemas

# 只生成 SQLite 迁移（历史习惯）
pnpm db:generate:sqlite

# 校验生成物与 model.ts 同步（CI 会跑；有差异时以非零码退出）
pnpm db:check
```

生成物：

```
apps/server/src/db/schema/
├── model.ts                 # 手写，唯一入口
├── index.ts                 # 生成，运行时 facade
└── generated/
    ├── sqlite.ts            # 生成
    ├── mysql.ts             # 生成
    └── postgres.ts          # 生成

apps/server/drizzle/
├── sqlite/                  # 历史迁移 + 0010
├── mysql/                   # 0000 初始迁移
└── postgres/                # 0000 初始迁移
```

生成文件带 `/* eslint-disable */`，diff 中应只出现由 `model.ts` 推导出的变化。
提交前至少运行一次 `pnpm --filter @mcserauth/server typecheck` 与三库测试。

## 迁移

```bash
pnpm db:migrate
```

脚本读取 `DATABASE_URL`，选择对应目录和驱动：

- SQLite：自动创建父目录、开启 WAL 与外键，并执行历史数据修复
  （`mod` → `reviewer`、pending 纹理转 approved、`active_slot` 回填）。
- MySQL / PostgreSQL：直接执行 `drizzle/<dialect>` 下的迁移。

### SQLite 0010 的特殊处理

`0010` 为 `skin` 增加 MySQL 兼容的 `active_slot` 判别列，需要重建表。
由于 `PRAGMA foreign_keys=OFF` 在 Drizzle 事务内不会生效，迁移采用备份表方案：

1. 将旧表复制为 `__bak_*`；
2. 建新表；
3. 删除旧表；
4. 新表重命名为正式名；
5. 从 `__bak_*` 回填数据；
6. 建索引；
7. 删除备份表。

**不要调整这个顺序**，否则删除旧表会触发级联删除。迁移完成后库中不应残留
`__bak_*` 表。

## 从 SQLite 迁移到 MySQL / PostgreSQL

一次性脚本，适合把现有开发库或小规模生产库搬到服务型数据库。

```bash
# 1. 先在目标库建好 schema
DATABASE_URL=mysql://user:pass@host/mcserauth pnpm db:migrate

# 2. 预检：只校验 schema 与行数，不写入
SOURCE_DATABASE_URL=./data/mcserauth.db \
TARGET_DATABASE_URL=mysql://user:pass@host/mcserauth \
pnpm db:copy-data -- --dry-run

# 3. 正式复制（目标非空时必须显式 --truncate）
SOURCE_DATABASE_URL=./data/mcserauth.db \
TARGET_DATABASE_URL=mysql://user:pass@host/mcserauth \
pnpm db:copy-data -- --truncate
```

脚本行为：

- 源库只读打开；目标 schema 必须已存在，列不匹配会提前失败。
- 目标非空时默认拒绝写入；`--truncate` 才会清空目标表。
- 按外键顺序分批插入，默认每批 200 行（`--batch-size` 可调）。
- PostgreSQL 复制后修复自增 sequence。
- 复制完成后逐表校验行数与全行 SHA-256；校验失败回滚。
- 校验使用目标端时间戳 epoch 表达式，避免驱动时区差异。

复制完成后，把生产环境的 `DATABASE_URL` 指向目标库并重启服务。建议先在预发布
环境跑完整测试与冒烟，再切换生产。

## 测试

```bash
# 默认：每个测试文件一个临时 SQLite 文件
pnpm --filter @mcserauth/server test

# MySQL
TEST_DATABASE_URL=mysql://root:root@127.0.0.1:3306/mcserauth \
pnpm --filter @mcserauth/server test

# PostgreSQL（连接串中的库必须已存在，脚本会创建/删除子库）
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
pnpm --filter @mcserauth/server test
```

每个测试文件会创建 `mcserauth_test_<pid>_<random>` 数据库，执行全部迁移，
测试结束后删除。账号需要 `CREATE DATABASE` / `DROP DATABASE` 权限。
MySQL 连接串中的库名仅作占位；PostgreSQL 会先连接到该库再创建子库。

CI 使用 SQLite 与 MySQL 8.0 / PostgreSQL 16 service container 矩阵，
见 `.github/workflows/ci.yml`。

## 备份与恢复

### SQLite

```bash
pnpm db:backup                 # 写入 apps/server/data/backups/
pnpm db:backup -- ./copy.db    # 指定目标
```

脚本先 checkpoint WAL，再用 better-sqlite3 在线备份 API 复制，不长时间阻塞服务。
恢复：停止 server → 再备份当前库 → 用备份文件覆盖 `DATABASE_URL` 指向的文件 →
`pnpm db:migrate` 确认版本。

### MySQL / PostgreSQL

使用数据库自带的工具，例如：

```bash
# MySQL
mysqldump --single-transaction --routines --triggers mcserauth > mcserauth.sql

# PostgreSQL
pg_dump --format=custom mcserauth > mcserauth.dump
```

`pnpm db:backup` 只支持 SQLite。服务型数据库请纳入现有备份平台，
并定期演练恢复。

## 运维注意事项

- **时间**：服务进程启动时固定 `TZ=UTC`。SQLite 存 epoch 毫秒，MySQL `DATETIME`
  与 PostgreSQL `timestamp` 存 UTC wall-clock；跨库比较时不要依赖数据库本地时区。
- **布尔值**：SQLite 以 0/1 存储，MySQL 使用 `tinyint(1)`，PostgreSQL 使用 `boolean`；
  应用层类型保持一致。
- **JSON**：站点配置等字段以文本存储并显式 `JSON.parse`，不依赖方言 JSON 类型。
- **MySQL 返回值**：`updateReturning` 采用“查-改-查”，高并发下返回值可能包含
  其他事务的更新；需要强一致返回值的场景优先使用 PostgreSQL。
- **唯一约束**：MySQL 没有部分唯一索引，`skin.active_slot` 是跨库统一方案；
  新增类似需求时沿用判别列模式。
- **迁移顺序**：生产迁移前先备份；MySQL/PostgreSQL 的大表 DDL 建议在维护窗口执行。
- **连接池**：多实例部署时按 `实例数 × DB_POOL_MAX` 估算数据库连接上限。
- **SQLite 并发**：单进程内顶层事务会串行执行（单连接、单写者）；需要高并发写入时
  切换到 MySQL / PostgreSQL。MySQL / PostgreSQL 的事务走连接池，可并行。
