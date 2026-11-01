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

| 变量                       | 默认    | 说明                                                        |
| -------------------------- | ------- | ----------------------------------------------------------- |
| `DB_POOL_MIN`              | `0`     | 连接池最小连接数（PostgreSQL；MySQL 无此设置，SQLite 忽略） |
| `DB_POOL_MAX`              | `10`    | 连接池最大连接数（SQLite 忽略）                             |
| `DB_CONNECTION_TIMEOUT_MS` | `10000` | 建立连接超时                                                |
| `DB_IDLE_TIMEOUT_MS`       | `30000` | 空闲连接回收时间                                            |
| `DB_SSL`                   | `false` | MySQL/PostgreSQL 是否强制 TLS                               |

生产环境建议：`DB_POOL_MAX` 按实例数与数据库最大连接数分配；
托管数据库通常要求 `DB_SSL=true`。开启后会校验证书；使用私有 CA 时通过
`NODE_EXTRA_CA_CERTS=/path/to/ca.pem` 提供根证书，不要关闭校验。
`pnpm db:migrate` 与 `pnpm db:copy-data` 读取同一个 `DB_SSL`，迁移或复制到
托管数据库时不需要额外的 TLS 参数。

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
├── sqlite/                  # 0000 基线（与 MySQL/PG 对齐，见 ADR 0007）
├── mysql/                   # 0000 基线
└── postgres/                # 0000 基线
```

三个方言的迁移历史自 2.0 起共同对齐到 29 表基线：改 `model.ts` 后
`pnpm db:generate` 会在三个目录**同时**追加一个同语义版本；任何一侧单独出现
新版本都说明生成流程被跳过。1.x 的 SQLite 12 版历史已移除（git 历史可考），
存量库升级见下文「迁移基线对齐升级」。

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

MySQL 建库时显式指定 `utf8mb4`。MySQL 8 默认就是该字符集，但自建实例或旧配置
可能不是：

```sql
CREATE DATABASE mcserauth CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

迁移只建表，不会修改已存在数据库的字符集；字符集不一致会导致昵称、帖子中的
emoji 写入失败。

### SQLite 0010 / 0011 的历史处理（已移除）

1.x 的 SQLite 迁移历史（含两次重建表的 `0010`/`0011`）已在 2.0 基线对齐中移除，
见 [ADR 0007](adr/0007-migration-baseline-alignment.md)。其中的数据修复逻辑
（`mod` → `reviewer`、pending 纹理转 approved、`active_slot` 回填）保留在
`scripts/migrate.mjs` 的幂等后处理里，对所有方言的全新库同样安全。
历史迁移采用过备份表方案（`__bak_*` → 重建 → 回填），如果需要在 git 历史中
考古，注意 `PRAGMA foreign_keys=OFF` 在 Drizzle 事务内不生效，重建表必须
按「子表先删、父表先建」的顺序操作。

## 引导数据（seed）

```bash
pnpm db:seed
```

向目标库幂等写入最小数据集：1 个占位 superadmin（`seed-admin@localhost`）、
2 个默认版块（`general` / `servers`）、`siteName` 站点设置。用途：

- `db:copy-data` 验证与 CI 证据的非空数据源；
- 本地冒烟 / 开发时先有一点点数据可看。

**seed 出的账号不能登录**（没有凭据行）。首个真实 superadmin 仍按部署文档走
注册 → `pnpm admin:grant <email> superadmin`。

## 数据搬迁（SQLite → SQLite / MySQL / PostgreSQL）

一次性脚本。两个典型场景：

1. **存量 1.x SQLite 库升级到 2.0 基线**（SQLite → SQLite，见
   [ADR 0007](adr/0007-migration-baseline-alignment.md)）：

   ```bash
   # 1. 新基线空库
   DATABASE_URL=./data/new-baseline.db pnpm db:migrate

   # 2. 预检：只校验 schema 与行数，不写入
   SOURCE_DATABASE_URL=./data/mcserauth.db \
   TARGET_DATABASE_URL=./data/new-baseline.db \
   pnpm db:copy-data -- --dry-run

   # 3. 正式复制（目标非空时必须显式 --truncate）
   SOURCE_DATABASE_URL=./data/mcserauth.db \
   TARGET_DATABASE_URL=./data/new-baseline.db \
   pnpm db:copy-data
   ```

   校验输出逐表 `verified <table>: n rows` 后，把 `DATABASE_URL` 换成新文件并
   重启。脚本拒绝源/目标为同一文件。

2. **切换到 MySQL / PostgreSQL**：

   ```bash
   # 1. 先在目标库建好 schema（MySQL 建库请显式 utf8mb4，见上文）
   DATABASE_URL=mysql://user:pass@host/mcserauth pnpm db:migrate

   # 2. 预检
   SOURCE_DATABASE_URL=./data/mcserauth.db \
   TARGET_DATABASE_URL=mysql://user:pass@host/mcserauth \
   pnpm db:copy-data -- --dry-run

   # 3. 正式复制
   SOURCE_DATABASE_URL=./data/mcserauth.db \
   TARGET_DATABASE_URL=mysql://user:pass@host/mcserauth \
   pnpm db:copy-data -- --truncate
   ```

脚本行为（三方言一致）：

- 源库（SQLite）只读打开；目标 schema 必须已存在，列不匹配会提前失败。
- 目标非空时默认拒绝写入；`--truncate` 才会清空目标表。
- 按外键顺序分批插入，默认每批 200 行（`--batch-size` 可调）。
- PostgreSQL 复制后修复自增 sequence；SQLite 清库后重置 `sqlite_sequence`。
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

`pnpm db:backup` 按 `DATABASE_URL` 的协议选引擎，三库共用同一套输出约定
（`apps/server/data/backups/mcserauth-<时间戳>.<db|sql>`）：

```bash
pnpm db:backup                                  # 备份当前配置的库
pnpm db:backup -- ./copy.db                     # 指定目标文件
pnpm db:backup -- --dry-run                     # 只打印执行计划（账号掩为 <user>，不含密码）
DATABASE_URL=mysql://… pnpm db:backup           # mysqldump 包装
DATABASE_URL=postgres://… pnpm db:backup        # pg_dump 包装
```

- **SQLite**：先 `wal_checkpoint(TRUNCATE)`，再用 better-sqlite3 在线备份 API 复制，
  不长时间阻塞服务。
- **MySQL**：`--no-tablespaces --single-transaction --routines --triggers --hex-blob
--default-character-set=utf8mb4`，可在托管实例（无 TABLESPACE 权限）上直接使用。
- **PostgreSQL**：`--format=plain --no-owner --no-acl`。
- 凭据通过 `MYSQL_PWD` / `PGPASSWORD` 传给子进程，**不出现在命令行**（`ps` 可见），
  也不打印到日志；`DB_SSL=true` 时 MySQL 加 `--ssl-mode`、PostgreSQL 走 `PGSSLMODE=verify-full`，
  私有 CA 用 `DB_SSL_CA` 传根证书。
- 缺 `mysqldump` / `pg_dump` 时报出需要安装的客户端包名，并删除写了一半的产物。

恢复顺序：**停服 → 再备份当前现场 → 覆盖 → `pnpm db:migrate` 确认版本 → 起服 → 冒烟**。
第二份现场备份用于「覆盖本身出错」时回退，别省。各引擎的具体命令、PostgreSQL 必须带
`ON_ERROR_STOP=1` 的原因、上传目录的单独归档、定时任务与每周还原演练都在
[`deploy.md`](deploy.md) 的 §4/§5。

服务型数据库同样可以纳入现有备份平台（对象存储快照等）；本项目不自带异地传输。

## 运维注意事项

- **时间**：服务进程启动时固定 `TZ=UTC`。SQLite 的 Drizzle `timestamp` 模式存 epoch
  秒，MySQL `DATETIME` 与 PostgreSQL `timestamp` 存 UTC wall-clock；`db:copy-data`
  会把源库秒值统一转换为毫秒再写入目标库。跨库比较时不要依赖数据库本地时区。
- **布尔值**：SQLite 以 0/1 存储，MySQL 使用 `tinyint(1)`，PostgreSQL 使用 `boolean`；
  应用层类型保持一致。
- **排序**：SQLite/MySQL 把 NULL 视为最小值，PostgreSQL 视为最大值，同一个 `desc()`
  在可空列上的 NULL 位置会不同。对可空列排序时先加 `nullsLast()`
  （`src/common/helpers/order.ts`），不要依赖数据库默认的 NULL 位置。
- **JSON**：`player.nickname_history` 使用方言 JSON 类型（PostgreSQL `jsonb`、MySQL
  `JSON`、SQLite `TEXT` + Drizzle `mode: 'json'`），三种驱动都返回已解析的数组；
  `site_setting.value` 等历史字段仍是文本，由应用显式 `JSON.parse`。
- **MySQL 返回值**：`updateReturning` 采用“查-改-查”，高并发下返回值可能包含
  其他事务的更新；需要强一致返回值的场景优先使用 PostgreSQL。
- **唯一约束**：MySQL 没有部分唯一索引，`skin.active_slot` 是跨库统一方案；
  新增类似需求时沿用判别列模式。
- **论坛列表查询**：`GET /forum/posts` 的排序走既有索引（`post_status_last_activity_idx`
  等）；热门排序按回复数+点赞数的关联子查询聚合。标题搜索使用
  `lower(title) LIKE '%kw%'`（`%`/`_`/`\` 已转义），前置通配符无法命中 B-tree
  索引，属全表扫描——论坛帖子量级（万级）下可接受，规模显著增长后再考虑
  全文索引（如 MySQL FULLTEXT / PostgreSQL tsvector）。
- **迁移顺序**：生产迁移前先备份；MySQL/PostgreSQL 的大表 DDL 建议在维护窗口执行。
- **连接池**：多实例部署时按 `实例数 × DB_POOL_MAX` 估算数据库连接上限。
- **SQLite 并发**：单进程内顶层事务会串行执行（单连接、单写者）；需要高并发写入时
  切换到 MySQL / PostgreSQL。MySQL / PostgreSQL 的事务走连接池，可并行。
