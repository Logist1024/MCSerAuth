# ADR 0007：三库迁移基线对齐与 SQLite→SQLite 搬迁

- 状态：已采纳
- 日期：2026-10-31
- 关联：[ADR 0006](0006-multi-database.md)、2.0 开发指南 F2、技术债 T2/T3

## 背景

ADR 0006 落地时，三库的迁移历史并不对称：

- SQLite 沿用了 1.x 的 12 版迁移历史（`0000` … `0011`，含两次重建表的
  `0010`/`0011`）；
- MySQL / PostgreSQL 只有按当时 29 表状态生成的 `0000` 基线。

问题：

1. **升级路径分叉**。同一个代码版本，新装 SQLite 库要跑 12 版迁移，MySQL/PG 只跑 1 版。
   任何一次模型变更都要同时维护两条历史，且 SQLite 的中间版本永远无法在 MySQL/PG 上重放。
2. **验证成本翻倍**。三库测试矩阵每跑一次，SQLite 侧就要重建 12 层历史；
   中间版本（如 `0011` 的备份表重建）是纯历史包袱，新部署永远不需要。
3. **存量库搬迁没有工具**。开发指南建议「存量 SQLite 库搬迁到新基线」，
   但 `db:copy-data` 只支持 MySQL/PG 目标，SQLite→SQLite 搬迁只能手写 SQL。

## 决策

### 1. 以当前 29 表状态为三方共同基线

- 删除 SQLite 的 12 版历史迁移，从空目录重新生成 `drizzle/sqlite/0000_*`，
  与 `drizzle/mysql/0000`、`drizzle/postgres/0000` 对齐（三者均由同一份
  `model.ts` 生成，`pnpm db:check` 保证与模型同步）。
- 自此**三库迁移永远成对生成**：改 `model.ts` 后运行 `pnpm db:generate`，
  三个方言目录各自追加一个同语义版本。任何一侧单独出现新版本都视为流程错误。
- 1.x 的历史迁移从仓库移除（git 历史仍可考）。旧历史承载的数据修复
  （`mod`→`reviewer`、pending 纹理转 approved、`active_slot` 回填）保留在
  `scripts/migrate.mjs` 的幂等后处理中，不依赖迁移版本存在。

### 2. 存量库升级路径：`db:copy-data` 支持 SQLite 目标

- `db:copy-data` 增加 SQLite 目标（`SqliteTarget`）：与 MySQL/PG 目标共用
  preflight、外键序插入、行数 + 全行 SHA-256 校验流程；时间戳写回秒、
  清库走 `DELETE` + `sqlite_sequence` 重置。
- 升级存量部署的标准流程（见 database.md「迁移基线对齐升级」）：

  ```bash
  DATABASE_URL=./data/new-baseline.db pnpm db:migrate   # 新基线空库
  SOURCE_DATABASE_URL=./data/mcserauth.db \
  TARGET_DATABASE_URL=./data/new-baseline.db pnpm db:copy-data
  # 校验通过后替换 DATABASE_URL 并重启
  ```

- 脚本拒绝源/目标为同一文件，避免在原库上清库。

### 3. 验证证据进 CI 而不是只留在文档

- `pnpm db:seed`（新增）：向目标库幂等写入最小数据集（1 个占位 superadmin、
  2 个版块、`siteName` 设置），作为复制验证的数据源与本地冒烟引导。
  注意 seed 出的账号**不能登录**（无凭据行）；首个真实 superadmin 仍走
  `pnpm admin:grant`。
- CI 三个 job 各增加「copy-data 端到端」步骤：seed → 新建目标库并迁移 →
  复制（校验输出含逐表 checksum 验证）→ `db:migrate` 重跑证明幂等。
  `test-databases` 矩阵因此获得真实 MySQL/PG 上的迁移、搬迁、幂等三重证据。

## 被否决的备选方案

- **保留 SQLite 12 版历史并文档化「新装走 0000、存量走 12 版」**：两条历史
  的维护与验证成本长期存在，且 1.x 存量部署极少（项目未公开运营），不值得。
  若未来出现无法停机搬迁的部署，再以当时代码重建旧历史作为一次性工具。
- **给旧历史打「已废弃」标记保留在仓库**：只会误导新贡献者，git 历史足够。

## 后果

- 新装 SQLite 与 MySQL/PG 的迁移步数一致（各 1 版基线）。
- 存量 1.x SQLite 库升级需要一次 `db:copy-data` 停机搬迁（秒级，小库）；
  无法搬迁的场景需要先用 1.x 代码导出数据。
- `drizzle/sqlite` 的 journal 版本号与 MySQL/PG 不共享计数（drizzle 按目录
  独立编号），但每次 `db:generate` 三侧同时追加，版本数保持一致。
