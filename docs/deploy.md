# 生产部署与备份（2.0 F4）

> 目标形态：**单台 VPS + Caddy 反代 + pm2 两个进程**，数据库按规模选 SQLite / MySQL 8.0+ /
> PostgreSQL 16+。不引入 Docker、Redis、对象存储（策划案 D5 与 2.0 非目标维持）。
>
> **决策记录（F4.4）**：部署采用**手动 runbook + 仓库内的配置实例**（`deploy/`），
> 不做 GitHub Actions 部署 workflow。理由：单人维护、单实例、无多环境发布需求，
> workflow 只会增加凭据面与调试成本；等出现第二套环境（预发布/多机房）再评审。

配置实例都在 [`deploy/`](../deploy)：
[`ecosystem.config.cjs`](../deploy/ecosystem.config.cjs)（pm2）、
[`Caddyfile`](../deploy/Caddyfile)、
[`logrotate.mcserauth`](../deploy/logrotate.mcserauth)、
[`backup.cron`](../deploy/backup.cron)。

---

## 1. 先确认域名与 Cookie 边界（最容易踩的一条）

`APP_URL`（网站）与 `AUTH_URL`（认证服务）可以同域也可以分域，但有一条硬约束：

> **两个 URL 必须属于同一个注册域（registrable domain）。**

原因：better-auth 会话 Cookie 固定 `SameSite=Lax`
（[auth.instance.ts:156](../apps/server/src/modules/auth/auth.instance.ts#L156)），
Lax 只按「站点」而非「源」判定。`example.com` 与 `auth.example.com` 属同站，
网页跨子域 `fetch` 仍会带上 Cookie；`example.com` 与 `mcserauth.cn` 则**不会**，
症状是网页登录成功但一切需要会话的接口 401。

两种可用布局：

| 布局             | `APP_URL` / `AUTH_URL`                             | 启动器填的认证地址                  | 说明                                    |
| ---------------- | -------------------------------------------------- | ----------------------------------- | --------------------------------------- |
| 子域分域（推荐） | `https://example.com` / `https://auth.example.com` | `https://auth.example.com/api`      | 与 Caddyfile 默认段一致                 |
| 单域路径分派     | 两者都是 `https://mcserauth.example.com`           | `https://mcserauth.example.com/api` | 用 Caddyfile 末尾的 `handle /api*` 变体 |

---

## 2. 空 VPS → 上线 checklist

按顺序执行；Ubuntu 22.04/24.04 为例，装完后应能在 30 分钟内做到「可登录、可发帖」。
「可进服」还需要一台 Paper 测试服（见第 3 步末尾与 §7）。

### 2.1 系统与应用

- [ ] **1. 装运行时**（Node 大版本必须匹配 `.nvmrc` = 22）

  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs caddy git
  corepack enable                      # 提供 pnpm（版本由 package.json 的 packageManager 锁定）
  ```

  备份 cron 用的是独立账号（下文 `deployer`），它也得能跑 pnpm。`corepack enable` 默认往
  Node 安装目录写符号链接，普通账号没权限，所以给它一个自己的 bin 目录：

  ```bash
  sudo mkdir -p /var/log/mcserauth && sudo chown deployer /var/log/mcserauth
  sudo -u deployer mkdir -p ~/.local/bin
  sudo -u deployer env HOME=/home/deployer sh -c 'corepack enable --install-directory /home/deployer/.local/bin'
  ```

  `deploy/backup.cron` 的 `PATH` 需要相应包含 `/home/deployer/.local/bin`。

- [ ] **2. 防火墙：只暴露 22/80/443**

  Node 进程监听的是全网卡（`app.listen(port)` 未绑 `127.0.0.1`，
  [main.ts:110](../apps/server/src/main.ts#L110)），所以 **8000 与 3000 必须在边界关闭**，
  否则绕过 Caddy 的 TLS 与安全头直接暴露：

  ```bash
  sudo ufw allow 22,80,443/tcp && sudo ufw deny 3000,8000/tcp && sudo ufw enable
  sudo ufw status verbose              # 确认 3000/8000 是 DENY
  ```

- [ ] **3. 取代码并构建**

  ```bash
  sudo mkdir -p /opt/mcserauth && sudo chown $USER /opt/mcserauth
  git clone <repo> /opt/mcserauth && cd /opt/mcserauth
  pnpm install --frozen-lockfile
  ```

- [ ] **4. 写生产环境变量（先写再构建）**

  见 §3 的逐项清单。`apps/web/.env.local` 里的 `NEXT_PUBLIC_*` 是**构建期内联**进浏览器包的，
  构建后再改无效——必须先写、后 `pnpm build`：

  ```bash
  cp .env.example apps/server/.env          # 然后按 §3 编辑
  cp apps/web/.env.example apps/web/.env.local
  nano apps/server/.env apps/web/.env.local
  pnpm build                                # shared → server → web
  ```

- [ ] **5. 日志目录与 pm2 启动**

  ```bash
  sudo mkdir -p /var/log/mcserauth && sudo chown $USER /var/log/mcserauth
  pm2 start deploy/ecosystem.config.cjs
  pm2 save && pm2 startup                    # 开机自启
  pm2 status                                 # 两个进程都应是 online
  ```

- [ ] **6. Caddy 反代与 TLS**

  编辑 [`deploy/Caddyfile`](../deploy/Caddyfile) 的两个域名，安装并校验：

  ```bash
  sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
  sudo caddy validate --config /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  ```

  DNS 已指向本机时 Caddy 自动签发/续期 Let's Encrypt 证书。

### 2.2 数据与账号

- [ ] **7. 建库**

  **SQLite（默认，零建库动作）**：跳过，`pnpm db:migrate` 会创建
  `apps/server/data/mcserauth.db`（并启用 WAL 与外键）。

  **MySQL 8.0+**：必须显式 `utf8mb4`（见 [`database.md`](database.md) 的已知问题）：

  ```sql
  CREATE DATABASE mcserauth CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  CREATE USER 'mcserauth'@'%' IDENTIFIED BY '<强密码>';
  GRANT ALL ON mcserauth.* TO 'mcserauth'@'%';
  ```

  并把 `DATABASE_URL=mysql://mcserauth:<密码>@127.0.0.1:3306/mcserauth` 写进 `apps/server/.env`。
  同机 MySQL 可不设 `DB_SSL`；跨机/托管库设 `DB_SSL=true`，私有 CA 用 `NODE_EXTRA_CA_CERTS`。

  **PostgreSQL 16+**：

  ```sql
  CREATE DATABASE mcserauth;
  CREATE USER mcserauth WITH PASSWORD '<强密码>';
  GRANT ALL PRIVILEGES ON DATABASE mcserauth TO mcserauth;
  ALTER SCHEMA public OWNER TO mcserauth;   -- 迁移需要建表权限
  ```

  `DATABASE_URL=postgres://mcserauth:<密码>@127.0.0.1:5432/mcserauth`。

- [ ] **8. 迁移**（幂等，可重复执行；三方言各应用 `drizzle/<dialect>/0000_*`）

  ```bash
  cd /opt/mcserauth && pnpm db:migrate
  ```

  迁移前先跑一次 `pnpm db:backup`（SQLite 是硬要求，见 §4）。

- [ ] **9. 首个超级管理员**

  浏览器注册普通账号（若 `captchaEnabled` 为真需通过人机验证），然后：

  ```bash
  cd /opt/mcserauth && pnpm admin:grant you@example.com superadmin
  ```

  只有 `superadmin` 能登记服务器白名单与调整角色；`/console` 超级后台需另设
  `CONSOLE_KEY`（≥16 字符，留空即禁用）。

- [ ] **10. 登记游戏服务器白名单**（进服验证的前提，仅原生 `/api/session/*` 需要）

  用 superadmin 的网站会话调用：

  ```bash
  curl -b jar.txt -X POST https://auth.example.com/api/admin/servers \
    -H 'Content-Type: application/json' -d '{"serverId":"survival-1","name":"生存服一区"}'
  ```

  响应里的 `secret` 只返回一次（库中只存哈希，当前协议不要求携带）。
  走 §2.5 的 authlib-injector 兼容层 `/api/sessionserver/*` 时不需要登记。

### 2.3 冒烟（每项都应有明确预期）

- [ ] **11. 探针与安全头**

  ```bash
  curl -s https://auth.example.com/health/live          # code:0，checks 为空
  curl -s https://auth.example.com/health/ready         # checks.database = "up"
  curl -sI https://auth.example.com/api/site            # 看 CSP / Strict-Transport-Security / Referrer-Policy
  curl -sI https://example.com                          # Next 侧 nosniff / X-Frame-Options
  ```

  临时把 `DATABASE_URL` 指到一个不存在的库再 `pm2 restart mcserauth-server`，
  `/health/ready` 应返 **503** 且 Caddy 快速 502 —— 这既验证探针也验证 Caddy 的
  `health_uri` 生效（验完记得改回来）。

- [ ] **12. 网站链路**：注册 → 邮箱验证 → 登录 → 发帖（带图）→ 回帖 → 点赞 →
      `/textures` 上传皮肤（64×32/64×64）→ 披风需先用积分解锁，否则 **403**（预期行为）。

- [ ] **13. 启动器直登**：HMCL「外置登录」填 `https://auth.example.com/api` + 网站邮箱密码
      → 应显示昵称与 UUID。进服还需要**客户端与 Paper 两侧都注入** authlib-injector
      （`online-mode=false` + `-javaagent:authlib-injector.jar=https://auth.example.com/api`）。
      这一步与协议字段核对（2.0 **F1**）是同一件事，真机记录写进
      [`protocol-checklist.md`](protocol-checklist.md) §3.2。

---

## 3. 生产 `.env` 逐项清单

全部变量由 [env.ts](../apps/server/src/config/env.ts) 在启动时用 zod 校验，**配错直接启动失败**，
不做运行期兜底。下表是必须相对开发默认值改动的项。

| 变量                                     | 生产值                                             | 为什么                                                                                         |
| ---------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                               | `production`                                       | 触发下面的强校验；pino 输出 JSON                                                               |
| `COOKIE_SECURE`                          | `true`                                             | **生产必填**，否则启动失败；Cookie 走 Secure/HttpOnly/SameSite=Lax                             |
| `BETTER_AUTH_SECRET`                     | `openssl rand -base64 48` 的输出                   | ≥32 字符，**不能用开发默认值**（启动即报错）；也是 SMTP 密码的加密密钥，换值会让已存密码解不开 |
| `APP_URL` / `AUTH_URL`                   | 两个真实 https 源                                  | CORS 与 OriginGuard 白名单来源；必须同注册域（§1）                                             |
| `CONSOLE_KEY`                            | `openssl rand -base64 32`（或留空禁用 `/console`） | ≥16 字符                                                                                       |
| `DATABASE_URL`                           | 目标库连接串                                       | 方言由协议自动识别；`DB_DIALECT` 只在需要显式覆盖时设置，冲突即失败                            |
| `DB_SSL`                                 | 跨机/托管库设 `true`                               | 运行时与迁移/备份脚本共用同一语义                                                              |
| `LOG_LEVEL`                              | `info`                                             | 见 §6；`debug` 会打印请求级细节                                                                |
| `MAIL_PROVIDER` / `MAIL_FROM` / `SMTP_*` | 真实发件配置                                       | `console` 只把邮件打进日志；发件配置也可在 `/console` 覆盖，SMTP 密码加密存储                  |
| `UPLOAD_DIR`                             | 默认 `./data/uploads` 或显式目录                   | 皮肤/披风/帖子图片/站点图标的落盘位置，属**需备份的第二个数据体**                              |

`apps/web/.env.local`：`NEXT_PUBLIC_API_BASE_URL=https://auth.example.com`、
`NEXT_PUBLIC_SITE_URL=https://example.com`（sitemap/robots 用，无结尾斜杠）、
可选 `CONSOLE_PATH=/console`。

TTL 类变量（`OAUTH_*`、`SESSION_JOIN_TTL_SECONDS`、`TEXTURE_URL_TTL_SECONDS`）保持默认即可，
它们同时也是 F1 协议核对的暂定值来源。

---

## 4. 备份

`pnpm db:backup` 按 `DATABASE_URL` 选引擎，产物统一落在 `apps/server/data/backups/`：

| 引擎       | 命令内部动作                                                                                                       | 产物                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| SQLite     | `wal_checkpoint(TRUNCATE)` 后走 better-sqlite3 在线备份 API                                                        | `mcserauth-<时间戳>.db` |
| MySQL      | `mysqldump --no-tablespaces --single-transaction --routines --triggers --hex-blob --default-character-set=utf8mb4` | `.sql`                  |
| PostgreSQL | `pg_dump --format=plain --no-owner --no-acl`                                                                       | `.sql`                  |

要点：

- **密码不进命令行**。凭据通过 `MYSQL_PWD` / `PGPASSWORD` 传给子进程；命令行任何本地用户
  都能用 `ps` 读到，所以这里刻意绕开。`--dry-run` 打印的命令里连账号名也被掩成 `<user>`。

  ```bash
  pnpm db:backup -- --dry-run      # 只打印计划，不写任何文件
  ```

- 缺 `mysqldump`/`pg_dump` 时会明确报「未找到，安装 `mysql-client`/`postgresql-client-16`」，
  并且**删除写了一半的产物**，不会留下看起来成功的空文件。
- 上传目录不在数据库里，需要单独备份（内容寻址，删了会让历史皮肤/帖子图 404）：

  ```bash
  tar czf backups/uploads-$(date +%F).tar.gz -C apps/server data/uploads
  ```

- 定时任务与保留策略见 [`deploy/backup.cron`](../deploy/backup.cron)（每日 03:17、保留 14 天，
  附每周「还原到临时库并数 29 张表」的演练示例）。

---

## 5. 恢复

顺序固定为 **停服 → 先备份当前现场 → 覆盖 → `db:migrate` 校验版本 → 起服 → 冒烟**。
第 2 步不是多余：覆盖出问题时你还能退回「出事时」而不是退回上周。

```bash
pm2 stop mcserauth-server mcserauth-web
cd /opt/mcserauth && pnpm db:backup                    # 现场留档
```

- **SQLite**：`cp data/backups/mcserauth-<时间戳>.db data/mcserauth.db`，
  并删掉残留的 `-wal` / `-shm` 文件。
- **MySQL**：`CREATE DATABASE mcserauth_restored CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
  → `mysql mcserauth_restored < <dump.sql>` → 改 `DATABASE_URL` 指过去（或 drop 原库后改名）。
- **PostgreSQL**：`createdb mcserauth_restored` →
  `psql -v ON_ERROR_STOP=1 -d mcserauth_restored -f <dump.sql>`。
  必须带 `ON_ERROR_STOP=1`，否则 `psql` 出错仍返回 0，你会拿到一个「恢复成功」的半套库。

校验版本并起服：

```bash
cd /opt/mcserauth && pnpm db:migrate        # 应输出 no changes / 幂等，说明迁移历史随 dump 一起回来了
pm2 start mcserauth-server mcserauth-web
curl -s https://auth.example.com/health/ready   # checks.database = "up"
```

`db:migrate` 这里的作用是**确认版本一致而不是执行变更**：迁移记录表 `__drizzle_migrations`
本身在 dump 里，所以恢复后应报「无待应用迁移」。若它反而开始应用迁移，说明恢复的库来自
更早的基线（ADR 0007 之前的 12 版 SQLite 历史就属于这种），改用 `pnpm db:copy-data` 搬迁。

恢复后冒烟：登录（Cookie 会话应仍有效，因为 `better-auth` 的 session 表在库里）、
`/textures` 皮肤仍能显示（同时验证 `UPLOAD_DIR` 未丢）、发一帖。

---

## 6. 日志、慢查询与轮转

- `LOG_LEVEL=info`；pino 生产输出 JSON 到 stdout，敏感字段（`authorization`、`cookie`、
  `set-cookie`、`password`、`token`、`code` 等）已在
  [pino.config.ts](../apps/server/src/common/logger/pino.config.ts) 里脱敏，客户端 IP 掩码。
- pm2 把 stdout/stderr 收进 `/var/log/mcserauth/*.log`，轮转用
  [`deploy/logrotate.mcserauth`](../deploy/logrotate.mcserauth)（daily / rotate 14 / copytruncate，
  因为 pm2 持有文件描述符）。装到 `/etc/logrotate.d/mcserauth`，用
  `sudo logrotate --debug /etc/logrotate.d/mcserauth` 先干跑一遍。
- 慢查询：`DbService` 在三方言统一入口统计耗时，超过 **200ms** 打 `warn`
  （`slow query on <dialect>: …ms — <语句前 500 字符>`）。检索：

  ```bash
  grep 'slow query' /var/log/mcserauth/server-out.log | tail -20
  ```

- 维护任务（`maintenance` 模块：清理过期授权码/游戏会话/过期会话/90 天前配额行）每小时执行，
  结果留日志；排查异常同样从 `server-out.log` 入手。
- 不引入 metrics 系统与错误上报 SaaS（D5 红线）；规模化时作为 3.0 议题。

---

## 7. 已知约束（部署时要知道，不用改代码）

| 约束                                        | 影响                                                                                                      | 出处                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 限流、验证码、进程内缓存都是内存态          | **只能跑单进程**；pm2 cluster 或 `instances>1` 会把每个限流阈值除以进程数、并让一次性验证码令牌跨进程失效 | T10 / [ecosystem 注释](../deploy/ecosystem.config.cjs) |
| SQLite 单连接单写者、写事务全局串行         | 高并发写吞吐有限；需要时切 MySQL/PG（`DATABASE_URL` 一行 + `db:migrate` + `db:copy-data`）                | T14 / [ADR 0006](adr/0006-multi-database.md)           |
| 无 `HOST` 环境变量，进程绑全网卡            | 必须靠防火墙关闭 3000/8000（§2.1 第 2 步）                                                                | main.ts                                                |
| `BETTER_AUTH_SECRET` 兼作 SMTP 密码加密密钥 | 轮换它会让后台已存的发件密码解不开；换密钥前先重置发件配置                                                | mail 模块                                              |
| 进服验证需要服主侧 authlib-injector         | 「可进服」不属于纯本站部署能自证的一环，与 F1 真机联调同一批                                              | protocol-checklist §2.5                                |

---

## 8. F4 验收对照

| 验收项                                               | 状态                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `docs/deploy.md` + Caddy/pm2/cron/logrotate 配置实例 | 本文与 `deploy/` 已交付                                                                                                  |
| `db:backup` 支持 MySQL/PG（含 cron 与恢复文档）      | 已实现（T13 关闭）；参数拼装与调用链由 `test/backup.test.ts` 的 stub 二进制覆盖，SQLite 分支已真实跑通                   |
| 干净 VPS 从 clone 到可登录可进服 ≤ 30 分钟           | **需在真实 VPS 演练**——本文第 2 节即演练脚本，逐项打勾后回填结论                                                         |
| SQLite 与 MySQL（或 PG）各成功备份一次并演练一次恢复 | SQLite 已实跑；MySQL/PG 需真实实例（本机无 docker 与客户端二进制，已用 stub 验证调用链与失败清理，未验证真实 dump 输出） |
