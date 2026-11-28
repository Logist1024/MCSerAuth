# Changelog

格式参考 [Keep a Changelog](https://keepachangelog.com/)；提交遵循 Conventional
Commits，括号内为提交短哈希，可直接在 GitHub 上跳转。

- [v1.0.0](https://github.com/Logist1024/MCSerAuth/releases/tag/v1.0.0)（2026-11-28）：
  首个公开发布版本——1.x 功能齐备基线（M0–M4.5）与发布整备的全部内容。
- `Unreleased` 收录 v1.0.0 之后的变更。
- 说明：开发阶段曾内部使用过 v1.0.0（2026-10-31，`b07c854`）与 v1.1.0（2026-11-14，
  `e5fed72`）两个里程碑编号，但均未公开发布过 tag 或 Release；自正式发布起统一
  从 v1.0.0 起版，下方小节包含两者及此前 Unreleased 的全部内容。部分早期提交的
  信息不规范（直接是暂存区文件列表），内容已按实际 diff 归类，并单独标注。

## Unreleased

暂无。

## v1.0.0 — 首个公开发布（2026-11-28）

> 项目首个公开版本即「功能齐备 + 生产整备」版本：注册协议、论坛、成长体系、
> 三库支持、OAuth SSO、可选 Docker 部署全部就绪。

### Added（新增）

- 注册 OAuth 客户端与作用域 SSO：管理端 `/api/admin/oauth-clients` + 作用域
  userinfo（basic/player/email），接入指南同步入库（`d5f2888`）。
- 帖子列表排序（最新回复/最新发布/热门）与标题搜索（`51fdf37`）。
- 外观系统：浅色/深色/跟随系统、五色点缀主题、SVG/Emoji 图标风格（`71aebb6`）。
- 注册表单确认密码、密码强度提示与实时反馈；登录表单密码可见切换（`4aa8a8c`、
  `f9fffb8`）。
- 验证邮件重发 60 秒冷却（`61b5a39`）。
- 个人主页用户菜单新增「账户安全」快捷入口（`ebe8540`）。
- 游戏账号页改为官方档案页式布局：档案头（3D 预览、名称、UUID）（`df76a4c`）。
- 档案 UUID 点击复制（`262d0db`）。
- 生产环境探活：`/health/live` 与 `/health/ready`（数据库不可用返 503），
  并输出 200ms 慢查询日志（`10a12fb`）。
- `db:backup` 支持三库引擎备份（SQLite/MySQL/PostgreSQL，凭据不进命令行）
  （`33b37b0`）。
- `db:copy-data` 支持 SQLite 目标库，并新增幂等 `db:seed`（`53dc8d5`）。
- 基于 nonce 的 CSP，清除安全审计高危项（`712c76d`）。
- HTML 认证流程失败信息翻译为友好的中文提示（`e36d1ea`）。
- 可选的单镜像 Docker 部署：多阶段 `Dockerfile`（server 经 `pnpm deploy --prod`
  裁剪、web 走 `output: 'standalone'`）、`docker/entrypoint.sh`（迁移 + 双进程监管）、
  `docker-compose.yml` 与 `deploy/env.docker.example`，用法见 `docs/deploy.md`
  第 9 节。
- 页头聚合端点 `GET /api/user/header`：一次返回身份、头像与未读数，页头由三次
  串行请求降为一次。
- 通知列表支持 `status=unread` 与 `type=` 服务端筛选；纹理审核列表支持
  `page` / `pageSize` 分页。

### Changed（变更）

- Web 端整体切换到 Material 3 风格 UI 并改进可访问性（`c77cac5`）；默认主题色
  改为蓝色并重做 Logo（`fc49012`）。
- 服务端重构：拆分 growth 巨型服务为八个子服务（`759beed`）；HTTP 装配抽出为
  `createServerApp()` 以支撑 HTTP e2e（`5b9bddd`）；三方言迁移基线对齐到
  29 表 schema（ADR 0007，`1b97a06`；后续扩展至 31 表）。
- `APP_VERSION` 改为从 package.json 派生（`0b555cf`）。
- 清理无引用的三个模块与死 IDE 配置（`fc64c47`、`877887a`）。
- `dotenv` 从 apps/server 的 devDependencies 移入 dependencies：`scripts/migrate.mjs`
  与 `scripts/backup.mjs` 是生产路径脚本，生产依赖裁剪后必须可用。
- 成长经济写入（签到 / 打赏 / 商店 / XP）改为事务内行锁 + 原子更新：并发签到返回
  409，打赏、购买与经验奖励不再丢更新或重复扣款。
- 所有 Nest 路由默认注册进程内限流（120 次/分钟），健康探针豁免；验证码令牌与
  尝试次数改为条件更新。
- 上传与静态文件读取改用异步 IO；写库/写盘失败时返还当日上传配额。
- 前端区分 404 与 5xx：接口故障不再显示「帖子不存在 / 未登录」；`/textures`
  首屏改由服务端取数；管理后台切换标签不再触发整页 RSC 请求。
- 公共帖子详情/版块页移除流式 `loading` 边界（论坛列表骨架收敛到
  `/forum/(feed)`），无效帖子/分类返回真正的 HTTP 404；Next SSR 透传
  `X-Forwarded-For`，限流按真实客户端 IP 计数。
- 新增索引：`session.expires_at`、`verification.expires_at`、
  `notification(user_id, created_at)`、举报去重复合索引；维护任务清理过期
  verification / token / 昵称保留记录。

### Fixed（修复）

- `db:copy-data` 容忍字面量 `--` 参数且不再误触 mysql2 的 `.then`；慢查询包装器
  保留驱动返回值；组合主键经 table extras 声明时正确解析（`7a41eb3`、`58bc7eb`、
  `c5e2ccd`）。
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
- 修复并发签到 500、并发打赏 / 购买 / XP 奖励丢更新，以及 Banner 并发审核重复
  退款。
- 修复验证码令牌并发重复消费与尝试次数越界。
- 修复新主题正文 `@提及` 不生成通知、通知筛选态「全部」计数误用筛选后 total、
  管理员表单 `pattern` 在 Chrome 正则 `v` 模式下无效，以及外观初始化脚本位置
  触发的 React 警告。

### Tests / CI（测试与 CI）

- HTTP e2e 基础设施与论坛主干链路（`098394b`）；权限矩阵与响应方言链路
  （`6121c45`）；组合键 `insertIgnore` 测试修正（`57a119d`）。

### Docs（文档）

- 对外发布整备：README 首屏重写（徽章/截图/适合谁/接入拓扑，`23c0081`）、
  功能清单迁至 `docs/features.md`（`088b078`）、部署前必读（`8691464`）、
  已知限制（`edf346c`）、英文 README 同步（`c63c5db`）、Windows/宝塔部署指南
  （`679f85c`）、玩家三端指南（`9386e7a`）、Docker 评估（`ef8a136`）、导航更新
  （`77c667f`）。
- 历史文档：生产部署 runbook 与 pm2/Caddy/cron 配置实例（`02725fb`）、
  CONTRIBUTING（`7d6178c`）、行为准则与仓库元数据（`d08fc88`）、清理内部规划文档
  （`9955a36`、`b6c614d`）、英文 README 摘要与安全政策（`2cef36c`）、启动器真机
  联调记录（`492a01d`）、生产演练与债务台账（`5a7dc12`、`31e5d97`、`42e551e`、
  `5d38aae`、`906ca48`、`8ff1755`、`13f8d1b`、`1c53f57`、`29e036d`）、玩家体验
  改进计划（`a9dfe34`）、内部会话计划文件（`9321628`）与 `next-env.d.ts`
  （`dc503db`）。
