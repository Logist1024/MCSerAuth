<div align="right">

简体中文 | [English](README.en.md)

</div>

# MCSerAuth

面向第三方 Minecraft: Java Edition 服务器的**一体化社区论坛 + 外置登录认证服务**。

认证侧实现 Commons-Designs 服务端协议（启动器 HMCL/PCL2 直接可用），社区侧提供论坛与玩家档案；
两块业务共用同一账号体系与基础设施，单体部署；默认 SQLite，生产可切换
MySQL 8.0+ / PostgreSQL 16+。

> **当前状态**：核心功能已齐备，发布基线 [v1.0.0](https://github.com/Logist1024/MCSerAuth/releases/tag/v1.0.0)；正在推进
> 2.0「从功能齐备到生产可运营」打磨（多库 CI 矩阵、部署与备份、可观测性、HTTP e2e
> 测试层等已完成，其余工作项状态见 [`docs/2.0-开发指南.md`](docs/2.0-开发指南.md)；
> 协议逐字段核对与启动器真机联调记录见 [`docs/protocol-checklist.md`](docs/protocol-checklist.md)）。
>
> **已实现**：better-auth 网站会话、OAuth 授权码 + PKCE、启动器令牌轮换、
> 会话服务（joinServer/hasJoined）、档案查询、皮肤/披风上传与签名分发、authlib-injector 直登；
> 论坛（版块/帖子/回复/点赞/通知/举报/图片上传/游客浏览）、公开个人主页、游戏账号管理
> （资料/改名/纹理切换）、四级角色 + 8 项能力下放 + 密钥超级后台、人机验证、成长体系
> （等级/称号/签到/积分/商店/打赏/首页 Banner）、找回密码、RSS/sitemap、三库支持。

## 技术栈

| 层     | 选型                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------ |
| 运行时 | Node.js 22 LTS · pnpm 9 · TypeScript 6（全仓 ESM）                                                     |
| 后端   | NestJS 12 · better-auth（账号）· Drizzle ORM · SQLite / MySQL 8.0+ / PostgreSQL 16+                    |
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
│   │   ├── src/db/          Drizzle 实例 + 单一逻辑模型 + 三套生成 schema（29 张表）
│   │   ├── src/modules/     auth · session · profiles · forum · user · admin · site
│   │   │                    · growth · captcha · mail · maintenance · health
│   │   └── drizzle/         按方言拆分的迁移 SQL（sqlite/ · mysql/ · postgres/）
│   └── web/                 Next.js App Router（渲染层）
├── packages/
│   └── shared/              跨端类型/DTO/错误码/zod schema（单一事实来源）
├── deploy/                  Caddy / pm2 / cron / logrotate 生产配置实例
├── docs/                    策划案、开发与部署指南、协议 checklist、OpenAPI 产物
└── .github/workflows/ci.yml
```

## 快速开始

要求：Node.js 22（`.nvmrc` 已固定）、corepack 可用的 pnpm。

```bash
git clone https://github.com/Logist1024/MCSerAuth.git && cd MCSerAuth
corepack enable                 # 或使用 corepack pnpm <cmd>
pnpm install
cp .env.example apps/server/.env   # 可选：不复制也能跑（有开发默认值）
pnpm db:migrate                    # 建库 + 全部迁移（按 DATABASE_URL 选择方言）
pnpm dev                           # 同时拉起 server(:8000) 与 web(:3000)
```

启动后：

| 地址                                                   | 说明                                              |
| ------------------------------------------------------ | ------------------------------------------------- |
| <http://localhost:3000>                                | 服务器展示页（论坛 / 游戏账号入口）               |
| <http://localhost:3000/forum>                          | 论坛（版块、帖子、发帖、回帖、点赞）              |
| <http://localhost:3000/textures>                       | 游戏账号管理（角色 / 皮肤 / 披风 / 登录指南）     |
| <http://localhost:3000/admin>                          | 管理后台（审核员 / 管理员 / 超级管理员）          |
| <http://localhost:3000/sitemap.xml> / `/forum/rss.xml` | SEO 与 RSS                                        |
| <http://localhost:8000/health>                         | 服务探活（统一封装 `{code:0,data}`）              |
| <http://localhost:8000/health/live> · `/health/ready`  | liveness（进程）· readiness（数据库不可用返 503） |
| <http://localhost:8000/docs>                           | Swagger UI（全部端点契约）                        |
| <http://localhost:8000/docs/json>                      | OpenAPI JSON                                      |

冒烟（注册 → 登录 → 会话）：

```bash
curl -c jar.txt -X POST http://localhost:8000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"S3cure!Passw0rd","name":"Tester"}'
curl -b jar.txt http://localhost:8000/api/auth/get-session
```

### M1 认证链路（浏览器 / 启动器共用）

1. 网站在 `/api/auth/*` 注册/登录，获得 better-auth Cookie 会话。
2. 启动器打开 `GET /api/oauth/entry?client_id=…&redirect_uri=…&state=…`；
   NestJS 直出页面：未登录先显示登录表单，已登录显示授权确认。
3. 确认后 `POST /api/oauth/entry` 校验同源 Cookie、`redirect_uri` 与 PKCE，签发一次性授权码并
   302 回跳 `redirect_uri?code=…&state=…`。
4. 启动器调用 `POST /api/oauth/authenticate`（`code` + `code_verifier`）换取
   Bearer access/refresh；随后用 `POST /api/oauth/refresh` 轮换、用
   `GET /api/user/profiles/me` 读取账号与 player。
5. 首次授权会自动为账号创建 1:1 的 player（32 位小写 UUID），令牌只以 SHA-256 哈希入库。

浏览器演示：<http://localhost:3000> 的「网站会话」与「发起一次 OAuth 授权」面板会跑完整条链路，
回调页展示 `/me` 与 refresh 轮换结果。逐字段契约与冒烟记录见
[`docs/protocol-checklist.md`](docs/protocol-checklist.md) §2.1 与 §3.1.1。

**找回密码**：登录页「忘记密码？」→ `/forgot-password`（人机验证后提交邮箱）→
`POST /api/auth/request-password-reset` 发出 1 小时有效的一次性链接 →
邮件链接经 `GET /api/auth/reset-password/{token}` 302 回到 `/reset-password?token=…` →
`POST /api/auth/reset-password` 重设密码。未知邮箱同样返回 200（防枚举）；重设成功后
全部网页会话立即失效，启动器令牌与游戏身份不受影响。冒烟记录见
[`docs/protocol-checklist.md`](docs/protocol-checklist.md) §3.1.8。

### M2 会话与形象

**会话服务（游戏服务器接入）**

1. 首个超级管理员：注册账号后执行 `pnpm admin:grant you@example.com superadmin`（在根目录或
   `apps/server` 下运行均可），再用该账号调用管理端 API。
2. 登记游戏服务器（网站 Cookie 会话 + `superadmin` 角色）：
   ```bash
   curl -b jar.txt -X POST http://localhost:8000/api/admin/servers \
     -H 'Content-Type: application/json' \
     -d '{"serverId":"survival-1","name":"生存服一区"}'
   ```
   响应中的 `secret` 只返回一次（库中只存哈希，当前协议不要求携带）。
3. 启动器流程：授权拿到 access token 后调用
   `POST /api/session/joinServer {accessToken, selectedProfile, serverId}`（204）；
   游戏服务器再调用 `GET|POST /api/session/hasJoined?username=…&serverId=…&ip=…`，
   命中返回带 `textures` 属性的 GameProfile，否则 204；封禁返回 403。
4. 档案查询（无需认证）：`GET /api/profiles/minecraft/{name}`、
   `POST /api/profiles/minecraft {"names":[…]}`、`GET /api/profiles/{uuid}`。

**皮肤与披风**

1. 登录网站后进入游戏账号管理 `/textures` 上传 PNG：
   皮肤 64×32 / 64×64（classic|slim），披风 64×32，文件 ≤ 1 MiB；不支持高清纹理。
2. 上传即生效（无需事前审核），页面提供 3D 外观预览、形象库切换与删除；
   形象库仅本人可见，不会列出或允许使用其他玩家的纹理。
3. 当前纹理经 `GameProfile.properties.textures` 以短时签名 URL
   （`/api/minecraft/profile/textures/{id}`）下发；删除当前纹理后回退默认形象。
4. 审核员可在 `/admin?tab=textures` 对违规纹理做下架/恢复（事后审核）。

### 启动器直登（authlib-injector / HMCL）

只认 Yggdrasil 的启动器（HMCL、PCL2、XMCL）可以直接用网站账号登录，无需走浏览器 OAuth：

1. **认证服务器地址填 `http://localhost:8000/api`**（API 根，不是 `/api/oauth/entry`）。
2. 用户名填**网站邮箱**（如 `admin@mcserauth.dev`），密码填网站密码；首次登录自动创建 1:1 player。
3. HMCL：设置 → 账户 → 添加账户 → 「外置登录」；PCL2：设置 → 启动器 → 游戏账户。

已实现：`GET /api` 元数据、`/api/authserver/{authenticate,refresh,validate,invalidate}`、
`/api/sessionserver/session/minecraft/{join,hasJoined,profile/{uuid}}`、`/api/api/profiles/minecraft`。
令牌与 OAuth 流程同源——同一条授权链路签发、同一张 `token` 表存储，轮换与失效语义完全一致。

两点差异要知道：`/api/sessionserver/*` 按 Yggdrasil 语义接受任意握手哈希（不校验白名单），
而原生 `/api/session/*` 仍要求管理员登记过的 `serverId`；元数据不提供 `signaturePublickey`，
所以纹理属性不带签名。逐字段契约见 [`docs/protocol-checklist.md`](docs/protocol-checklist.md) §2.5。

> 进服需要客户端 **和** Paper 侧都注入 authlib-injector（服务端 `online-mode=false` +
> `-javaagent:authlib-injector.jar=http://localhost:8000/api`）。本仓库不含 Paper 插件（见里程碑声明）。

### M3 论坛与 M4 运营能力

- **论坛**：`/forum` 版块树与最新帖子；`/forum/{slug}` 分类分页；
  `/forum/post/{id}` 帖子详情（Markdown、图片、点赞、举报、回复）；
  `/forum/new` 发帖；作者可编辑/删除自己的帖子与回复。
- **默认版块**：服务首次启动且 `category` 为空时自动种子「服务器动态 / 攻略交流 / 建议反馈 / 水区」。
- **游戏账号管理**（`/textures`）：游戏角色资料与改名（30 天冷却，旧名保留 30 天）、
  上传皮肤/披风立即生效、3D 外观预览、形象库切换/删除、
  外置登录连接指南（认证服务器地址与 HMCL/PCL2/Prism Launcher 配置步骤）；
  每个账号只能看到和管理自己的纹理；首页与导航提供入口。
- **个人主页**（`/users/{id}`）：公开资料、成长档案与最近主题；本人可在页内编辑头像与签名。
- **通知**（`/notifications`）：回帖、@提及（优先匹配游戏昵称）、审核与系统公告；支持单条/全部已读。
- **举报**：帖子/回复/用户/纹理均可举报；管理员在 `/admin` 的举报队列中处理。
- **角色与权限**：
  - **审核员**（`reviewer`）：处理举报、审核/隐藏/恢复帖子与回复、禁言普通成员；
  - **管理员**（`admin`）：审核员全部权限 + 封禁/解封账号（默认论坛+游戏）；
  - **超级管理员**（`superadmin`）：管理员全部权限 + 站点展示设置（含站点图标与自定义
    CSS）、版块、公告、
    服务器白名单、调整审核员/管理员角色；
  - **超级后台**（`/console`，需 `CONSOLE_KEY`）：独立密钥登录，可调整全部角色
    （含超级管理员）并配置站点与发件邮箱（SMTP 密码加密存储）。
- **管理后台**（`/admin`）：数据概览、举报、用户禁言/封禁/解封与角色调整、
  帖子置顶/精华/锁定/隐藏/删除、版块增删改、全站公告、纹理下架、服务器白名单、
  站点展示设置（各入口按角色显示）。
- **站点外观**（`/admin?tab=site`）：上传站点图标（PNG/JPEG/WebP/GIF，≤1 MiB，
  SHA-256 内容寻址，存于 `UPLOAD_DIR/site/`），同一张图同时用于页头品牌与
  `<link rel="icon">`／`apple-touch-icon`，即浏览器标签页显示的图标；
  还可填写自定义全站 CSS（≤20 000 字符），由根布局内联在内置主题之后，
  留空即关闭，包含 `</style>` 的内容会被拒绝。
- **首个超级管理员**：注册后执行 `pnpm admin:grant you@example.com superadmin`；
  审核员用 `reviewer`，管理员用 `admin`。
- **SEO**：`/sitemap.xml`、`/robots.txt`、`/forum/rss.xml`。
- **图片上传**：帖子图片存于 `UPLOAD_DIR/forum/`（PNG/JPEG/WebP/GIF，≤5 MiB，
  SHA-256 内容寻址，公开只读 URL）。

### M4.5 人机验证与社区成长（策划案 6 阶段之外的扩展特性）

- **人机验证**（登录与注册）：内置离线 SVG 算术题，或接入 Cloudflare Turnstile / hCaptcha。
  验证通过后签发一次性令牌，请求 `sign-in/email`、`sign-up/email` 时带 `x-captcha-token`。
  网页登录页与**启动器授权页**都已接入；启动器 Yggdrasil 直登不经这两个端点，因此不受影响。
  开关在 `/admin` 的「人机验证」面板，**生产环境默认开启**（`captchaEnabled` 缺省值取 `isProduction`）。
- **等级与称号**：发帖、回帖、每日签到攒经验，`100` 级封顶（每级 100 XP），
  11 档头衔 1-10「初来乍到」… 91-99「大佬」… 100「传说」。等级与头衔徽章出现在
  论坛帖子列表、帖子/回复作者行与公开个人主页。
- **满级专属称号**：达到 `titleApplicationLevel`（默认 100 级）后可申请自定义称号，
  由管理员在后台审批后授予。
- **特别称号**：`赞助商 / 合作伙伴 / 友商`（可自建）由超级管理员授予。
  **持有特别称号即退出普通等级体系**：不再获得经验、不出现在等级榜，
  页面只显示称号而非等级徽章；签到仍照常发放积分，撤销称号后立刻恢复原行为。
- **积分与签到**：每日签到除经验外还获得积分，连续签到有递增加成（可封顶）。
  积分变动一律写入 `point_transaction` 台账（`amount` + `balance_after`），
  在 `/forum/growth` 可查分页流水。
- **积分商店**：经验翻倍卡（限时内发帖/回帖/签到经验翻倍，重复购买顺延）、
  **披风功能解锁**（未解锁者上传或切换披风返回 403，皮肤不受影响）、
  首页 Banner 位（提交后进入审核，通过后按时段展示在首页）。
- **打赏**：用积分打赏其他成员，范围由 `tipMin`/`tipMax` 约束，禁止自打赏。
- **首页内容可运营**：`GET /api/site/home` 提供可编辑的首页区块
  （主副标题、按钮、数据条、加入步骤、入口卡）与审批中的 Banner，
  由超级管理员在 `/admin?tab=home` 维护；链接必须以 `/` 或 `http(s)://` 开头，
  超条数/超长度会被拒绝并保留上一版内容。
- **权限下放**：超级管理员可在 `/admin?tab=permissions` 按成员勾选 8 项能力
  （`site.manage`、`forum.categories`、`forum.announce`、`users.ban`、`servers.manage`、
  `titles.manage`、`banners.manage`、`points.adjust`）。被下放者即使角色只是
  `reviewer` 也能进入对应面板；超级管理员隐式拥有全部能力，无需勾选。
- **成长规则可调**：签到经验/积分与加成上限、发帖回帖经验与每日上限、翻倍卡
  倍率/时长/价格、披风与 Banner 价格、Banner 天数与同屏上限、打赏区间、
  申请称号所需等级，都可在 `/admin?tab=rules` 覆盖（部分提交即可），
  一键「恢复默认」删除覆盖行。

## 常用命令

根目录执行（`package.json` → `scripts`）：

| 命令                                | 作用                                     |
| ----------------------------------- | ---------------------------------------- |
| `pnpm dev`                          | 并行启动 server + web（先构建 shared）   |
| `pnpm build`                        | shared → server → web 全量构建           |
| `pnpm lint` / `pnpm lint:fix`       | 全仓 ESLint                              |
| `pnpm format` / `pnpm format:check` | Prettier                                 |
| `pnpm typecheck`                    | 全仓 `tsc --noEmit`                      |
| `pnpm test` / `pnpm test:coverage`  | Vitest（server + web）                   |
| `pnpm db:generate`                  | 生成三套 schema + SQLite/MySQL/PG 迁移   |
| `pnpm db:generate:sqlite`           | 只生成 SQLite 迁移                       |
| `pnpm db:check`                     | 校验生成物与 `model.ts` 同步（CI）       |
| `pnpm db:migrate`                   | 按 `DATABASE_URL` 应用对应方言迁移       |
| `pnpm db:seed`                      | 幂等写入占位用户/版块/站点设置           |
| `pnpm db:copy-data`                 | 跨方言一次性复制（含 SQLite 目标）       |
| `pnpm db:backup`                    | 备份当前库（三库；`--dry-run` 打印计划） |
| `pnpm db:studio`                    | Drizzle Studio 浏览数据                  |
| `pnpm admin:grant <email> [role]`   | 授予 user/reviewer/admin/superadmin      |
| `pnpm openapi:export`               | 构建并刷新 `docs/openapi.json`           |

## 环境变量

全部变量在 `apps/server/src/config/env.ts` 中 zod 校验，启动即失败、不做运行期兜底。
模板见根目录 [`.env.example`](.env.example)（复制到 `apps/server/.env`）。

| 变量                              | 默认（开发）                      | 说明                                             |
| --------------------------------- | --------------------------------- | ------------------------------------------------ |
| `NODE_ENV`                        | `development`                     | `production` 时强制校验 secret 与 Cookie         |
| `PORT`                            | `8000`                            | server 端口                                      |
| `LOG_LEVEL`                       | `debug`（模板）                   | pino 级别；敏感字段自动脱敏                      |
| `APP_URL` / `AUTH_URL`            | `http://localhost:3000` / `:8000` | 站点域 / 认证域；CORS 与 OriginGuard 白名单来源  |
| `COOKIE_SECURE`                   | `false`                           | 生产必须 `true`（Secure/HttpOnly/SameSite=Lax）  |
| `BETTER_AUTH_SECRET`              | 开发默认值                        | 生产必填（≥32 字符），`openssl rand -base64 48`  |
| `OAUTH_ACCESS_TOKEN_TTL_SECONDS`  | `2592000`                         | 启动器 access token 有效期（秒，默认 30 天）     |
| `OAUTH_REFRESH_TOKEN_TTL_SECONDS` | `5184000`                         | refresh token 绝对有效期（秒，默认 60 天）       |
| `OAUTH_AUTH_CODE_TTL_SECONDS`     | `300`                             | 授权码有效期（秒，单次使用）                     |
| `SESSION_JOIN_TTL_SECONDS`        | `300`                             | joinServer 会话可被 hasJoined 兑换的窗口（秒）   |
| `TEXTURE_URL_TTL_SECONDS`         | `300`                             | 签名纹理 URL 有效期（秒）                        |
| `DATABASE_URL`                    | `./data/mcserauth.db`             | SQLite 路径或 `mysql://` / `postgres://` 连接串  |
| `DB_DIALECT`                      | 自动识别                          | 可选覆盖，必须与 `DATABASE_URL` 协议一致         |
| `DB_POOL_MIN` / `DB_POOL_MAX`     | `0` / `10`                        | MySQL/PostgreSQL 连接池（SQLite 忽略）           |
| `DB_CONNECTION_TIMEOUT_MS`        | `10000`                           | 建立连接超时（毫秒）                             |
| `DB_IDLE_TIMEOUT_MS`              | `30000`                           | 空闲连接回收时间（毫秒）                         |
| `DB_SSL`                          | `false`                           | MySQL/PostgreSQL 是否强制 TLS                    |
| `UPLOAD_DIR`                      | `./data/uploads`                  | 皮肤/披风 PNG 存储目录                           |
| `MAIL_*` / `SMTP_*`               | 占位                              | 默认发件配置；超级后台可覆盖（密码加密存储）     |
| `CONSOLE_KEY`                     | 空（禁用）                        | 超级后台密钥（≥16 字符），空则 `/console` 不可用 |
| `CONSOLE_SESSION_TTL_SECONDS`     | `28800`                           | 超级后台会话有效期（秒）                         |

测试用 `TEST_DATABASE_URL` 切换到 MySQL/PostgreSQL；数据复制用
`SOURCE_DATABASE_URL` / `TARGET_DATABASE_URL`（脚本变量，不由 server 读取），
见 [`docs/database.md`](docs/database.md)。

web 侧变量：`NEXT_PUBLIC_API_BASE_URL`（默认 `http://localhost:8000`）、
`NEXT_PUBLIC_SITE_URL`（默认 `http://localhost:3000`，用于 sitemap/robots）与
`CONSOLE_PATH`（可选，把特殊路径重写到 `/console`，构建/启动时读取），
模板见 [`apps/web/.env.example`](apps/web/.env.example)，复制为 `apps/web/.env.local` 生效。

## 数据层

- **三库支持**：SQLite（默认，WAL + 外键 + `busy_timeout`）、MySQL 8.0+、PostgreSQL 16+。
  方言由 `DATABASE_URL` 自动识别；完整配置、迁移与运维说明见
  [`docs/database.md`](docs/database.md)，设计取舍见
  [ADR 0006](docs/adr/0006-multi-database.md)；三方言各一份 29 表 `0000` 基线（旧 SQLite 12 版
  历史已移除），见 [ADR 0007](docs/adr/0007-migration-baseline-alignment.md)。
- **单一逻辑模型**：29 张表在 `apps/server/src/db/schema/model.ts` 声明一次，
  `scripts/generate-schema.ts` 生成 SQLite/MySQL/PostgreSQL 三套 Drizzle schema 与运行时
  facade。改表只改 `model.ts`，然后 `pnpm db:generate`；生成文件禁止手改。
- **跨方言 helper**：业务代码通过 `DbService` 的 `insertReturning` / `updateReturning` /
  `insertIgnore` / `upsert` / `transaction` 访问数据库，避免散落方言分支；MySQL 无
  `RETURNING`、无部分唯一索引，`skin.active_slot` 判别列负责“每人每类仅一条 active”。
- 29 张表覆盖用户与账号、玩家与令牌、OAuth 授权码、
  游戏会话、服务器白名单、皮肤披风、论坛版块/帖子/回复/投票/举报/通知/审计日志、
  站点配置，以及成长体系的 `user_progress`/`daily_checkin`/`point_transaction`/
  `title`/`user_title`/`title_application`/`banner`、`captcha_challenge`、
  权限下放的 `user_permission`）；better-auth 的 `session/account/verification`
  纳入 Drizzle 声明并由其维护。
- 论坛支持嵌套版块、置顶/精华/锁定/软删除、实时回复数与点赞数；通知含系统/审核正文列。
- 纹理文件存于 `UPLOAD_DIR`，按 `textures/{kind}/{sha256}.png` 内容寻址；
  帖子图片存于 `UPLOAD_DIR/forum/{sha256}.{ext}`。
  `skin` 表按 `(player_uuid, kind, sha256)` 去重，同一类型仅一条 `is_active`。
- **所有建表改动必须走 `pnpm db:generate` 生成三套迁移**，禁止手改库文件或运行时同步。
- 迁移前先跑 `pnpm db:backup`：按 `DATABASE_URL` 选引擎，三库统一写入
  `apps/server/data/backups/`（MySQL/PostgreSQL 包装 `mysqldump` / `pg_dump`，
  凭据只经环境变量传递、不进命令行），详见数据库指南与
  [`docs/deploy.md`](docs/deploy.md)。
- 恢复步骤：停止 server → 再备份当前库 → 用备份文件覆盖目标库 → `pnpm db:migrate` 确认版本。
- 从 SQLite 切换到 MySQL/PostgreSQL：先对目标执行 `pnpm db:migrate`，再用
  `pnpm db:copy-data -- --truncate` 复制并校验数据。
- 昵称 30 天保留记录在 `nickname_reservation`；改名事务内写入，启动时幂等回填。
- 上传配额按 `upload_usage(user_id, kind, day, count)` 按自然日计数；维护任务每小时清理过期授权码、游戏会话、过期会话与 90 天前的配额行。
- 启动器令牌记录 `device_name` / `ip` / `expires_at` / `last_used_at` / `revoked_at`（令牌本体只存哈希）。
  玩家侧「已授权设备」页与 `/api/user/tokens` **已于 2026-10-25 移除**，当前吊销入口只有启动器侧
  `POST /api/authserver/invalidate`；网页自助面板排期为 2.0 F14（见
  [`docs/2.0-开发指南.md`](docs/2.0-开发指南.md)）。
- 已定稿决策（S1 玩家 1:1、S2 皮肤披风同表、S4 别名 JSON、S5 软删除、S6 实时计数、S3 角色枚举）
  均已在 schema 中落地。

## API 契约

- 非协议端点统一封装：成功 `{ code: 0, data }`，失败 `{ code, message }`（错误码见 `packages/shared/src/errors.ts`）。
- 非协议写接口校验 `Origin`/`Referer`（`APP_URL`/`AUTH_URL` 白名单），跨站请求返回 403；认证与写接口有进程内限流（429）。
- 帖子详情回复分页：`replyPage` / `replyPageSize`（默认 1/20，上限 50），响应含 `replyTotal`。
- 通知列表分页（默认 20），另有 `GET /api/forum/notifications/unread-count` 供角标使用。
- 公共版块/帖子列表带 15 秒 HTTP 缓存；论坛列表页 Next 侧 `revalidate = 30`。
- **Commons-Designs 协议端点不套封装**，返回协议原生形状（错误为 `{ error, errorMessage }`）。
  已实现全部登记端点：`oauth/*`、`user/profiles/me`、`session/*`、`profiles/*`、`minecraft/profile/*`。
- 论坛、账号资料与管理端使用统一封装 + better-auth Cookie 会话：
  `/api/forum/*`、`/api/user/*`、`/api/users/{id}`、`/api/admin/*`。
- 启动器令牌只存哈希、授权码单次使用；`/user/profiles/me` 与纹理接口同时接受 Bearer 令牌与网站 Cookie。
- 纹理上传经 sharp 校验后立即生效（仅原版尺寸，不支持高清）；审核员可事后下架，
  当前纹理以短时签名 URL 下发；删除当前纹理回退默认形象。
- 端点与逐字段核对底稿：[`docs/protocol-checklist.md`](docs/protocol-checklist.md)。
- 契约产物：[`docs/openapi.json`](docs/openapi.json)（`pnpm openapi:export` 刷新）。

## 开发约定

- 提交遵循 [Conventional Commits](https://www.conventionalcommits.org/)（`feat:` `fix:` `docs:` `chore:` …）。
- pre-commit 自动跑 lint-staged（ESLint + Prettier，见 `.husky/pre-commit`）。
- 跨端 DTO/枚举/错误码只写在 `packages/shared`，应用内不得复制类型。
- CI（`.github/workflows/ci.yml`）：`quality`（lint → format:check → typecheck → `db:check`
  → build）+ `test-sqlite` + `test-databases`（MySQL 8.0 / PostgreSQL 16 service container 矩阵）。
  两个测试 job 都先对空库执行迁移冒烟，再跑同一套 server 测试，最后走 `db:seed` →
  `db:copy-data --truncate`（行数 + 全行 SHA-256 校验）→ 目标库幂等重跑。
  首次于真实 MySQL/PG 全绿：2026-10-31（`dc503db`，run 41162131163）。

## 里程碑与文档

| 文档                                                                                             | 内容                                                                       |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                               | 参与开发入口：环境、提交与 PR 约定、DoD、契约纪律                          |
| [SECURITY.md](SECURITY.md)                                                                       | 安全政策：漏洞私密报告渠道与响应预期                                       |
| [`docs/项目策划案.md`](docs/项目策划案.md)                                                       | 产品范围、架构与全部已定稿决策（S1–S6 等）                                 |
| [`docs/2.0-开发指南.md`](docs/2.0-开发指南.md)                                                   | 2.0 版本规划：工作项、验收标准与发布清单                                   |
| [`docs/protocol-checklist.md`](docs/protocol-checklist.md)                                       | 协议字段对照、启动器联调记录                                               |
| [`docs/database.md`](docs/database.md)                                                           | 三库配置、schema 工作流、迁移/复制/备份                                    |
| [`docs/deploy.md`](docs/deploy.md)                                                               | 生产部署 runbook：VPS 上线 checklist、生产 `.env` 逐项清单、备份与恢复演练 |
| [`docs/security.md`](docs/security.md)                                                           | 安全基线：CSP、安全响应头、审计豁免与哈希                                  |
| [`docs/adr/0006-multi-database.md`](docs/adr/0006-multi-database.md)                             | 三库支持的设计取舍                                                         |
| [`docs/adr/0007-migration-baseline-alignment.md`](docs/adr/0007-migration-baseline-alignment.md) | 三方言迁移基线对齐与存量搬迁                                               |
| [`docs/openapi.json`](docs/openapi.json)                                                         | OpenAPI 契约产物（`pnpm openapi:export`）                                  |

里程碑：1.x 已收官 —— M0 底座 → M1 认证核心 → M2 会话与形象 → M3 论坛 MVP → M4 运营与加固
→ M4.5 人机验证与成长体系（策划案之外的扩展），发布基线 `v1.0.0`。
2.0 进行中（状态以 [`docs/2.0-开发指南.md`](docs/2.0-开发指南.md) §3.2 为准）——
**M5 生产就绪与协议可信化**（F2/F6 完成，F3/F4/F5 代码侧完成、待真实 VPS 演练，F1 真机联调暂缓）
→ **M6 架构还债与质量**（F7/F8 完成，F9/F10 未开始，F11 过半）→ M7 生态与运营扩展（未开始）。
Paper 插件与启动器修改**永不**实施。

## License

[MIT](LICENSE)
