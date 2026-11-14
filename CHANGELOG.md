# Changelog

格式参考 [Keep a Changelog](https://keepachangelog.com/)；提交遵循 Conventional
Commits，括号内为提交短哈希，可直接在 GitHub 上跳转。

- [v1.0.0](https://github.com/Logist1024/MCSerAuth/releases/tag/v1.0.0)（2026-10-31，
  `b07c854`）：1.x 功能齐备基线（M0–M4.5），注册协议、论坛、成长体系、三库支持均已就绪。
- 下列条目覆盖 **v1.0.0 之后** 的全部变更（65 个提交）。部分早期提交的信息不规范
  （直接是暂存区文件列表），内容已按实际 diff 归类，并单独标注。

<!-- 发布日期与 GitHub Release 链接：打 v1.1.0 tag 后补到本行下方 -->

## Unreleased

### Added（新增）

- 可选的单镜像 Docker 部署：多阶段 `Dockerfile`（server 经 `pnpm deploy --prod`
  裁剪、web 走 `output: 'standalone'`）、`docker/entrypoint.sh`（迁移 + 双进程监管）、
  `docker-compose.yml` 与 `deploy/env.docker.example`，用法见 `docs/deploy.md` 第 9 节。

### Changed（变更）

- `dotenv` 从 apps/server 的 devDependencies 移入 dependencies：`scripts/migrate.mjs`
  与 `scripts/backup.mjs` 是生产路径脚本，生产依赖裁剪后必须可用。

## v1.1.0

### Added（新增）

- 注册 OAuth 客户端与作用域 SSO：管理端 `/api/admin/oauth-clients` + 作用域
  userinfo（basic/player/email），接入指南同步入库（`d5f2888`）。
- 帖子列表排序（最新回复/最新发布/热门）与标题搜索（`51fdf37`）。
- 外观系统：浅色/深色/跟随系统、五色点缀主题、SVG/Emoji 图标风格（`71aebb6`）。
- 注册表单确认密码、密码强度提示与实时反馈；登录表单密码可见切换（`4aa8a8c`、`f9fffb8`）。
- 验证邮件重发 60 秒冷却（`61b5a39`）。
- 个人主页用户菜单新增「账户安全」快捷入口（`ebe8540`）。
- 游戏账号页改为官方档案页式布局：档案头（3D 预览、名称、UUID）（`df76a4c`）。
- 档案 UUID 点击复制（`262d0db`）。
- 生产环境探活：`/health/live` 与 `/health/ready`（数据库不可用返 503），
  并输出 200ms 慢查询日志（`10a12fb`）。
- `db:backup` 支持三库引擎备份（SQLite/MySQL/PostgreSQL，凭据不进命令行）（`33b37b0`）。
- `db:copy-data` 支持 SQLite 目标库，并新增幂等 `db:seed`（`53dc8d5`）。
- 基于 nonce 的 CSP，清除安全审计高危项（`712c76d`）。
- HTML 认证流程失败信息翻译为友好的中文提示（`e36d1ea`）。

### Changed（变更）

- Web 端整体切换到 Material 3 风格 UI 并改进可访问性（`c77cac5`）；默认主题色
  改为蓝色并重做 Logo（`fc49012`）。
- 服务端重构：拆分 growth 巨型服务为八个子服务（`759beed`）；HTTP 装配抽出为
  `createServerApp()` 以支撑 HTTP e2e（`5b9bddd`）；三方言迁移基线对齐到
  29 表 schema（ADR 0007，`1b97a06`；后续扩展至 31 表）。
- `APP_VERSION` 改为从 package.json 派生（`0b555cf`）。
- 清理无引用的三个模块与死 IDE 配置（`fc64c47`、`877887a`）。

### Fixed（修复）

- `db:copy-data` 容忍字面量 `--` 参数且不再误触 mysql2 的 `.then`；慢查询包装器
  保留驱动返回值；组合主键经 table extras 声明时正确解析（`7a41eb3`、`58bc7eb`、`c5e2ccd`）。
- 启动种子与回填在数据库不可用时不再让进程崩溃（`7df0f7a`）。
- 签名纹理读取未 await 就发送的竞态（`1bf47e7`）。
- Yggdrasil `validate` 改为真实 await，无效令牌正确返回 403（`bb43208`）。
- 论坛标题搜索的 `ESCAPE` 字符改为绑定参数，避免 MySQL 反斜杠转义导致语法报错
  （`a5b9a42`，提交信息不规范）。
- 生产环境拒绝回环地址的 `APP_URL` / `AUTH_URL`（否则验证邮件生成 localhost 链接），
  补 env/backup 测试（`bdc2579`，提交信息不规范）。
- 通知页区分「未登录」与「加载失败」两种状态（`cdfee9b`）；邮箱验证跳转保留
  回跳目的地（`65bafed`）；注册卖点在移动端紧凑表单下保持可见（`260b92b`）；
  复制按钮、路径校验与密码表单一致性加固（`7b91dec`）。

### Tests / CI（测试与 CI）

- HTTP e2e 基础设施与论坛主干链路（`098394b`）；权限矩阵与响应方言链路
  （`6121c45`）；组合键 `insertIgnore` 测试修正（`57a119d`）。

### Docs（文档）

- 对外发布整备（本轮）：README 首屏重写（徽章/截图/适合谁/接入拓扑，`23c0081`）、
  功能清单迁至 `docs/features.md`（`088b078`）、部署前必读（`8691464`）、
  已知限制（`edf346c`）、英文 README 同步（`c63c5db`）、Windows/宝塔部署指南
  （`679f85c`）、玩家三端指南（`9386e7a`）、Docker 评估（`ef8a136`）、导航更新
  （`77c667f`）。
- 历史文档：生产部署 runbook 与 pm2/Caddy/cron 配置实例（`02725fb`）、
  CONTRIBUTING（`7d6178c`）、
  行为准则与仓库元数据（`d08fc88`）、清理内部规划文档（`9955a36`、`b6c614d`）、
  英文 README 摘要与安全政策（`2cef36c`）、
  启动器真机联调记录（`492a01d`）、生产演练与债务台账（`5a7dc12`、`31e5d97`、
  `42e551e`、`5d38aae`、`906ca48`、`8ff1755`、`13f8d1b`、`1c53f57`、`29e036d`）、
  玩家体验改进计划（`a9dfe34`）、内部会话计划文件（`9321628`）与
  `next-env.d.ts`（`dc503db`）。

> 说明：`docs/` 内还有一条不改变任何代码的整备期记录
> [`docs/docker-evaluation.md`](docs/docker-evaluation.md)，记录了暂不提供
> Dockerfile / Compose 的理由与再评审触发条件。
