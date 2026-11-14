# 功能清单

> 本文件是 README「功能一览」的完整展开，从原 README 迁入，按主题分区。
> 功能陈述对应的实现位置随文标注（文件 + 路由/函数），契约细节以
> [`docs/openapi.json`](openapi.json) 为准。

## 已实现总览

better-auth 网站会话、OAuth 授权码 + PKCE、注册 OAuth 客户端与作用域 SSO
（basic/player/email，含 userinfo 端点）、启动器令牌轮换、
会话服务（joinServer/hasJoined）、档案查询、皮肤/披风上传与签名分发、authlib-injector 直登；
论坛（版块/帖子/回复/点赞/通知/举报/图片上传/游客浏览/排序与标题搜索）、公开个人主页、
游戏账号管理（资料/改名/纹理切换）、外观设置（浅色/深色/跟随系统、五色点缀主题、
Emoji 图标替换）、四级角色 + 9 项能力下放 + 密钥超级后台、人机验证、成长体系
（等级/称号/签到/积分/商店/打赏/首页 Banner）、找回密码、RSS/sitemap、三库支持。

## 1. 账号与认证链路（浏览器 / 启动器共用）

1. 网站在 `/api/auth/*` 注册/登录，获得 better-auth Cookie 会话。
2. 启动器打开 `GET /api/oauth/entry?client_id=…&redirect_uri=…&state=…`；
   NestJS 直出页面：未登录先显示登录表单，已登录显示授权确认。
3. 确认后 `POST /api/oauth/entry` 校验同源 Cookie、`redirect_uri` 与 PKCE，签发一次性授权码并
   302 回跳 `redirect_uri?code=…&state=…`。
4. 启动器调用 `POST /api/oauth/authenticate`（`code` + `code_verifier`）换取
   Bearer access/refresh；随后用 `POST /api/oauth/refresh` 轮换、用
   `GET /api/user/profiles/me` 读取账号与 player。
5. 首次授权会自动为账号创建 1:1 的 player（32 位小写 UUID），令牌只以 SHA-256 哈希入库。

实现位置：`apps/server/src/modules/auth/oauth.controller.ts`（entry/authenticate/refresh）、
`apps/server/src/modules/auth/user-profiles.controller.ts`。

**注册客户端与作用域**：经管理员在 `/api/admin/oauth-clients` 注册的姊妹服务
（需 `oauth.clients` 能力）使用严格的 `redirect_uri` 精确白名单与作用域授权
（`basic` 默认 + `player` / `email`，对应 `GET|POST /api/oauth/userinfo`），
用户可"记住授权"实现一键重授权，并随时在个人主页「已授权服务」撤销（撤销即
吊销该客户端全部令牌）。未带 `client_id` 的启动器保持原有宽松行为（任意
HTTPS/localhost 回跳、全部作用域）。接入步骤见
[`docs/oauth-integration.md`](oauth-integration.md)。

浏览器演示：<http://localhost:3000> 的「网站会话」与「发起一次 OAuth 授权」面板会跑完整条链路，
回调页展示 `/me` 与 refresh 轮换结果。

**找回密码**：登录页「忘记密码？」→ `/forgot-password`（人机验证后提交邮箱）→
`POST /api/auth/request-password-reset` 发出 1 小时有效的一次性链接 →
邮件链接经 `GET /api/auth/reset-password/{token}` 302 回到 `/reset-password?token=…` →
`POST /api/auth/reset-password` 重设密码。未知邮箱同样返回 200（防枚举）；重设成功后
全部网页会话立即失效，启动器令牌与游戏身份不受影响。

## 2. 会话服务（游戏服务器接入）

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

实现位置：`apps/server/src/modules/session/session.controller.ts`（原生 `/api/session/*`，
要求登记过的 `serverId`）、`apps/server/src/modules/profiles/profiles.controller.ts`。

## 3. 皮肤与披风

1. 登录网站后进入游戏账号管理 `/textures` 上传 PNG：
   皮肤 64×32 / 64×64（classic|slim），披风 64×32，文件 ≤ 1 MiB；不支持高清纹理。
2. 上传即生效（无需事前审核），页面提供 3D 外观预览、形象库切换与删除；
   形象库仅本人可见，不会列出或允许使用其他玩家的纹理。
3. 当前纹理经 `GameProfile.properties.textures` 以短时签名 URL
   （`/api/minecraft/profile/textures/{id}`）下发；删除当前纹理后回退默认形象。
4. 审核员可在 `/admin?tab=textures` 对违规纹理做下架/恢复（事后审核）。

实现位置：`apps/server/src/modules/profiles/texture.service.ts`
（尺寸/体积上限与 sharp 校验）、
`apps/server/src/modules/profiles/minecraft-profile.controller.ts`（签名纹理 URL）。

## 4. 启动器直登（authlib-injector / HMCL）

只认 Yggdrasil 的启动器（HMCL、PCL2、XMCL）可以直接用网站账号登录，无需走浏览器 OAuth：

1. **认证服务器地址填 `http://localhost:8000/api`**（API 根，不是 `/api/oauth/entry`）。
2. 用户名填**网站邮箱**（如 `admin@mcserauth.dev`），密码填网站密码；首次登录自动创建 1:1 player。
3. HMCL：设置 → 账户 → 添加账户 → 「外置登录」；PCL2：设置 → 启动器 → 游戏账户。

已实现：`GET /api` 元数据、`/api/authserver/{authenticate,refresh,validate,invalidate}`、
`/api/sessionserver/session/minecraft/{join,hasJoined,profile/{uuid}}`、`/api/api/profiles/minecraft`。
令牌与 OAuth 流程同源——同一条授权链路签发、同一张 `token` 表存储，轮换与失效语义完全一致。

两点差异要知道：`/api/sessionserver/*` 按 Yggdrasil 语义接受任意握手哈希（不校验白名单），
而原生 `/api/session/*` 仍要求管理员登记过的 `serverId`；元数据不提供 `signaturePublickey`，
所以纹理属性不带签名。字段定义见 `packages/shared/src/protocol/`。

实现位置：`apps/server/src/modules/auth/yggdrasil.controller.ts`（元数据与 authserver）、
`apps/server/src/modules/session/yggdrasil-session.controller.ts`（sessionserver 兼容层）。

> 进服需要客户端 **和** Paper 侧都注入 authlib-injector（服务端 `online-mode=false` +
> `-javaagent:authlib-injector.jar=http://localhost:8000/api`）。本仓库不含 Paper 插件。

玩家侧三端（HMCL / PCL2 / Prism Launcher）图文步骤见
[`docs/player-guide.md`](player-guide.md)。

## 5. 论坛与运营能力

- **论坛**：`/forum` 版块卡与主题列表（最新回复/最新发布/热门排序、标题搜索）；
  `/forum/{slug}` 分类分页；
  `/forum/post/{id}` 帖子详情（Markdown、图片、点赞、举报、回复）；
  `/forum/new` 发帖；作者可编辑/删除自己的帖子与回复。
- **外观设置**：页头弹层切换浅色/深色/跟随系统、五套点缀色与 SVG/Emoji 图标风格，
  偏好存浏览器本地。
- **默认版块**：服务首次启动且 `category` 为空时自动种子「服务器动态 / 攻略交流 / 建议反馈 / 水区」。
- **游戏账号管理**（`/textures`）：官方档案页式布局——档案头（3D 形象预览、名称、UUID）、
  改名（30 天冷却，旧名保留 30 天）、上传皮肤/披风立即生效、形象库切换/删除、
  外置登录连接指南（认证服务器地址与 HMCL/PCL2/Prism Launcher 配置步骤）；
  每个账号只能看到和管理自己的纹理；首页与导航提供入口。
- **个人主页**（`/users/{id}`）：公开资料、成长档案与最近主题；本人可在页内编辑头像与签名，
  并查看/撤销「已授权服务」（注册 OAuth 客户端的授权记录）。
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

## 6. 社区成长与人机验证

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
- **权限下放**：超级管理员可在 `/admin?tab=permissions` 按成员勾选 9 项能力
  （`site.manage`、`forum.categories`、`forum.announce`、`users.ban`、`servers.manage`、
  `titles.manage`、`banners.manage`、`points.adjust`、`oauth.clients`）。被下放者即使角色只是
  `reviewer` 也能进入对应面板；超级管理员隐式拥有全部能力，无需勾选。
- **成长规则可调**：签到经验/积分与加成上限、发帖回帖经验与每日上限、翻倍卡
  倍率/时长/价格、披风与 Banner 价格、Banner 天数与同屏上限、打赏区间、
  申请称号所需等级，都可在 `/admin?tab=rules` 覆盖（部分提交即可），
  一键「恢复默认」删除覆盖行。

实现位置：论坛与运营能力分布在 `apps/server/src/modules/forum/`、`modules/user/`、
`modules/admin/`、`modules/site/`；成长体系在 `apps/server/src/modules/growth/`
（`growth.controller.ts` 提供 overview/transactions/checkin/purchase/tips/titles/
leaderboard/banners 端点）；人机验证在 `apps/server/src/modules/captcha/captcha.service.ts`。
