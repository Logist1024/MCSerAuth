# 三库重构交付报告

- 分支：`refactor-multi-db`
- 日期：2026-10-27　｜　更新：2026-11-01（2.0 F2 关闭，真实多库 CI 证据回填）
- 范围：在保持 monorepo / NestJS / Next.js / Drizzle / better-auth 架构不变的前提下，
  为 MCSerAuth 增加 MySQL 8.0+ 与 PostgreSQL 16+ 支持，并降低数据层缺陷率。

设计决策见 [ADR 0006](adr/0006-multi-database.md)，使用方式见
[数据库指南](database.md)。

## 交付内容

| 领域     | 交付物                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- |
| 逻辑模型 | `apps/server/src/db/schema/model.ts`：29 张表、36 个外键、索引与默认值                   |
| 代码生成 | `scripts/generate-schema.ts` 生成 SQLite / MySQL / PostgreSQL 三套 schema                |
| 运行时   | `DbService` 方言识别、连接池、事务、跨库 helper、`AsyncLocalStorage`                     |
| 迁移     | 三方言各一份 `0000` 基线（29 表，[ADR 0007](adr/0007-migration-baseline-alignment.md)）  |
| 数据搬迁 | `pnpm db:copy-data`：只读源库、分批复制、行数与全行 SHA-256 校验，源/目标均支持三库      |
| 工具链   | `pnpm db:generate` / `db:check` / `db:migrate` / `db:seed` / `db:backup` / `admin:grant` |
| 测试     | 方言切换测试、helper 测试、schema 不变量、迁移与复制回归测试                             |
| CI       | `quality`、`test-sqlite`、`test-databases`（MySQL 8.0 / PostgreSQL 16）                  |

## 度量

### 测试

| 套件          | 文件 | 用例 |
| ------------- | ---- | ---- |
| `apps/server` | 17   | 187  |
| `apps/web`    | 1    | 6    |

> 用例数为 2026-11-01 复核（F2 关闭时点）；10-27 重构收官时为 server 15 文件 / 162 例。

本轮新增/重写的重点测试：

- `test/dialect.test.ts`：URL 协议识别、`DB_DIALECT` 冲突、空值与 `postgresql` 别名。
- `test/db.service.test.ts`：`insertReturning`、`updateReturning`（含 CAS）、
  `insertIgnore`、`upsert`、嵌套事务复用、外键拒绝、用户删除级联到玩家。
- `test/schema.model.test.ts`：主键/索引/外键完整性、外键两端类型一致、
  索引列长度、MySQL 3072 字节索引上限、外键目标唯一性、`SET NULL` 可空性、
  所有权外键不得缺失。
- `test/copy-data.test.ts`：时间戳单位、自引用排序、校验和归一化。
- `test/search.test.ts`：跨库大小写不敏感搜索。

### SQLite 迁移验证（真实开发库副本）

| 检查项                           | 结果                         |
| -------------------------------- | ---------------------------- |
| 30 张业务表行数                  | 迁移前后完全一致             |
| `PRAGMA foreign_key_check`       | 0                            |
| 与旧库 `PRAGMA foreign_key_list` | 30 张表零差异                |
| `__bak_*` / `__new_*` 残留       | 无                           |
| 全新空库执行全部迁移             | 30 张表、36 个外键、检查为 0 |

## 已修复的缺陷类别

| 类别         | 问题                                                             | 修复                                                 |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------------------- |
| 外键丢失     | 生成的模型只保留 5/36 个外键，级联与所有权约束被静默移除         | 恢复全部外键，新增 SQLite `0011`，测试校验 36 个外键 |
| 迁移级联删除 | SQLite 重建表时 `PRAGMA foreign_keys=OFF` 在事务内失效           | 备份表 → 子表先删 → 父表先建/回填 → 删备份           |
| MySQL 语义   | `INSERT IGNORE` 会吞掉外键/数据错误                              | 改为主键自赋值的 `ON DUPLICATE KEY UPDATE`           |
| MySQL 返回值 | `updateReturning` 未检查影响行数，CAS 可能返回旧行               | 校验 `affectedRows`，条件不再匹配时返回 `[]`         |
| 时间戳       | SQLite 存秒、目标库存毫秒，复制与校验单位不一致                  | 源端统一 ×1000，PostgreSQL 会话固定 UTC              |
| 时区         | `EXTRACT(EPOCH FROM timestamp)` 依赖会话时区                     | 复制脚本 `SET TIME ZONE 'UTC'`                       |
| 搜索         | PostgreSQL `LIKE` 大小写敏感，SQLite/MySQL 不敏感                | 统一 `lower(column) LIKE lower(term)`                |
| 排序         | PostgreSQL 的 `DESC` 把 NULL 排在最前，另外两库在最后            | 新增 `nullsLast()` 显式排序键                        |
| TLS          | 迁移/复制脚本不读 `DB_SSL`，托管数据库无法连接                   | 两个脚本与运行时使用同一 `DB_SSL` 并校验证书         |
| 字符集       | MySQL 测试库依赖服务端默认字符集                                 | 测试库显式 `utf8mb4`，文档要求生产建库同样指定       |
| 类型/约束    | 索引 TEXT 无长度、外键指向非唯一列等问题只能在真实 MySQL/PG 暴露 | 用静态不变量测试在 SQLite 阶段提前拦截               |

## 验证状态

### 已验证（本机）

- `pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm build`。
- `pnpm test`：server 与 web 全部用例通过（用例数见上表）。
- `pnpm db:check`：生成物与 `model.ts` 同步，工作区无差异。
- SQLite 全新库与真实开发库副本的迁移、外键、行数与幂等性检查。
- `admin:grant` 在 SQLite 上的实际授权流程。

### 待验证（需要真实服务或 CI）

> **本节已于 2026-11-01 全部关闭**，见下方「2.0 验证进展」与「CI 真实多库首跑证据」。
> 保留原始清单以说明当初的缺口：

本环境没有 Docker、MySQL、PostgreSQL 与 GitHub 凭据，以下项目当时尚未执行：

1. 在真实 MySQL / PostgreSQL 上运行 `pnpm db:migrate`。
2. `TEST_DATABASE_URL=... pnpm --filter @mcserauth/server test`。
3. `pnpm db:copy-data -- --dry-run` 与 `--truncate` 的端到端复制和校验。
4. 推送分支并观察 GitHub Actions 的三个 job。

### 2.0 验证进展（F2 基线对齐，2026-10-31）

[ADR 0007](adr/0007-migration-baseline-alignment.md) 对齐三库迁移基线后：

**本机已验证（SQLite）**：

- 三方 0000 基线各含 29 张 `CREATE TABLE`（`drizzle/{sqlite,mysql,postgres}/0000_*.sql`）。
- 存量库搬迁演练：以旧 12 版基线构建的开发库（seed 数据）→ 新基线空库
  `db:copy-data`，29 表逐表 `verified`、全行 SHA-256 校验通过；`db:migrate`
  重跑幂等；迁移后数据可读。
- `pnpm --filter @mcserauth/server test`：187 用例全绿（每个测试文件在全新库上
  跑新 0000 基线）。
- `db:seed` 幂等写入占位用户/版块/站点设置，重复执行不报错。

**CI 真实多库首跑证据（关闭 T2 / T3，F2 验收）**：

| 项         | 证据                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 运行       | [Actions run 41162131163](https://github.com/Logist1024/MCSerAuth/actions/runs/41162131163) · commit `dc503db` · 2026-10-31T02:55:47Z → 02:58:18Z · **4 job 全 success**                                                        |
| 空库迁移   | `test · mysql`（`mysql:8.0` service container）与 `test · postgres`（`postgres:16`）的 _Database migration smoke test_ 步骤从空库应用新 `0000` 基线，均通过                                                                     |
| 全量测试   | 两库的 _Test_ 步骤以 `TEST_DATABASE_URL` 跑同一套 server 用例，均通过（真实库上的行为与本机 SQLite 一致）                                                                                                                       |
| 端到端搬迁 | _Copy-data end-to-end (SQLite → mysql / postgres)_：`db:migrate` → `db:seed` → `db:copy-data --truncate`（含行数 + 全行 SHA-256 校验）→ 目标库 `db:migrate` 幂等重跑，均通过；SQLite→SQLite 同路径亦在 `test · sqlite` job 通过 |
| 质量闸门   | `lint · typecheck · build`（含 `db:check` 生成物同步校验）通过                                                                                                                                                                  |

首跑并不是一次就绿：`0b555cf` → `c5e2ccd` 连续四次推送在 MySQL/PG 上失败，暴露并修复了
**只有真实服务才能发现的三个缺陷**——这正是 T2「仅断言级自洽」风险的实证：

| 缺陷                              | 表现                                                                                                                    | 修复                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 慢查询包装器吞掉驱动返回值        | 为统计耗时包装 `mysql2` 连接方法后，`update()` 返回的 `OkPacket` 变成 Promise，`affectedRows` 判定与 `.then` 链行为异常 | `fix(db): preserve driver return values in the slow-query wrapper`（`58bc7eb`）                           |
| `db:copy-data` 参数解析吃掉分隔符 | `pnpm db:copy-data -- --truncate` 传入的字面量 `--` 被当成选项终止符丢弃，`--truncate` 失效                             | `fix(db): tolerate literal -- in db:copy-data args and never touch mysql2's .then`（`7a41eb3`）           |
| 复合主键解析遗漏 table extras     | `primaryKey([...])` 声明的复合主键未被 `primaryKeyOf` 识别，MySQL `insertReturning` 走错分支                            | `fix(db): resolve composite primary keys declared via table extras`（`c5e2ccd`）+ 补真实用例（`57a119d`） |

此后 `test-databases` 矩阵进入常绿要求（GA 清单：三 job 连续两周全绿，起算 2026-10-31）。

复现命令（本机有真实库时）：

```bash
# 1. 空库迁移
DATABASE_URL=mysql://root:root@127.0.0.1:3306/mcserauth pnpm db:migrate
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/mcserauth pnpm db:migrate

# 2. 三库测试
TEST_DATABASE_URL=mysql://root:root@127.0.0.1:3306/mcserauth \
  pnpm --filter @mcserauth/server test
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
  pnpm --filter @mcserauth/server test

# 3. 真实数据搬迁
SOURCE_DATABASE_URL=./apps/server/data/mcserauth.db \
TARGET_DATABASE_URL=mysql://root:root@127.0.0.1:3306/mcserauth \
  pnpm db:copy-data -- --dry-run
```

## 生产度量建议

切换数据库后持续观察以下指标，用数据验证“缺陷率下降”而不是只靠测试数量：

| 指标                    | 目的                           |
| ----------------------- | ------------------------------ |
| 迁移耗时与失败次数      | 评估 DDL 窗口与回滚预案        |
| 5xx / 业务异常率        | 对比切换前后，定位方言相关回归 |
| 数据库 P95/P99 延迟     | 判断连接池与索引是否匹配       |
| 慢查询数量              | 发现缺少索引或全表扫描         |
| 连接池等待/耗尽次数     | 校准 `DB_POOL_MAX` 与实例数    |
| 备份恢复演练结果        | 验证 MySQL/PostgreSQL 备份链路 |
| `db:copy-data` 校验结果 | 确认一次性搬迁的行数与内容一致 |

## 经验沉淀

1. **单一模型 + 生成器**比维护三份手写 schema 更可靠。外键丢失这类问题在生成器
   与不变量测试补齐后很难再次发生。
2. **没有真实数据库时，静态不变量测试仍然有价值**：索引长度、外键目标唯一性、
   `SET NULL` 可空性都是可以在 SQLite 阶段发现的服务端约束。
3. **迁移脚本的顺序本身就是正确性**。SQLite 重建表必须先备份、按子表到父表删除、
   按父表到子表回填；调整顺序会静默丢数据。
4. **跨库差异集中在少数几类**：`RETURNING`、upsert 语义、时间戳单位/时区、
   NULL 排序、大小写、TLS、字符集。把这些收敛到 `DbService` 与公共 helper，
   业务代码就不需要 `if (dialect)`。
5. **验证要分层**：本机 SQLite → CI 三库矩阵 → 预发布真实数据搬迁 → 生产灰度。
   每一层都要有可重复的命令和明确的通过标准。
