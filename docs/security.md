# 安全基线

> 本文回答「**要把这套系统安全地跑起来，需要配置与注意什么**」，面向运营者。
> 漏洞报告走 [`SECURITY.md`](../SECURITY.md)（私密渠道）；改动遵循
> 「逐项收紧、不破坏既有页面」原则，历史决策见 git 提交记录。

## 1. 上线前必配（缺一即启动失败）

全部由 `apps/server/src/config/env.ts` 在启动时（`NODE_ENV=production`）zod 强校验：

- `COOKIE_SECURE=true`（Cookie 走 Secure/HttpOnly/SameSite=Lax）；
- `BETTER_AUTH_SECRET` 不能用开发默认值（≥32 字符）——它同时是后台已存
  SMTP 密码的加密密钥，轮换前先重置发件配置；
- `APP_URL` / `AUTH_URL` 拒绝回环地址（localhost / 127.0.0.1 / ::1 / 0.0.0.0）：
  否则验证邮件会生成 `http://localhost:8000/...` 这种打不开的链接；
- `MAIL_PROVIDER=console` 只把邮件写进日志、不投递（生产启动时输出 `warn`），
  保留可运行以不阻断首次部署，正式运营必须切 `smtp`。

逐项清单见 [`deploy.md`](deploy.md) §3。

## 2. 传输与端口暴露

- 生产**必须 HTTPS**：域名 + 反代 TLS（`deploy/Caddyfile` 自动签发 Let's Encrypt）；
- Node 进程监听全网卡且无 `HOST` 变量，**8000/3000 必须在防火墙边界关闭**，
  否则绕过 Caddy 的 TLS 与安全头直接暴露；
- Express 配置 `trust proxy = 1`，只信任一跳代理；Next SSR 在
  `apps/web/lib/server-api.ts` 中把入站 `X-Forwarded-For` 透传给 Nest，因此
  经 `Caddy → Next/Nest` 的请求按真实客户端 IP 计数。8000 若直接暴露公网，
  客户端可伪造 `X-Forwarded-For` 绕过按 IP 的限流。

## 3. 会话与 CSRF

- 会话 Cookie：`HttpOnly / SameSite=Lax`，`Secure` 由 `COOKIE_SECURE` 开启；
  `APP_URL` 与 `AUTH_URL` 必须同注册域，否则 Lax Cookie 跨站不带
  （症状与修复见 [`faq.md`](faq.md)）；
- 非协议写接口校验 `Origin`/`Referer`（`APP_URL`/`AUTH_URL` 白名单）：
  浏览器正常使用不受影响；生产环境带 Cookie 的 curl/脚本自动化必须显式带
  受信任的 `Origin` 头，无来源的 Cookie 写操作直接 403；
- 限流：全部 Nest 路由默认 120 次/分钟（健康探针豁免），`/api/auth/*` 另有
  express 限流（登录/注册等凭据端点 10 次/分钟）。限流计数在**内存态**——
  这是服务只能单进程运行的原因之一（[`deploy.md`](deploy.md) §7）。

## 4. 内容安全策略（CSP）

服务端（`apps/server`）由中间件按请求生成 nonce（`src/common/csp.ts`）：

- **严格策略**（entry 登录/确认页）：`script-src` / `style-src` 均要求
  `'nonce-…'`，**不含 `unsafe-inline`**；页面模板把同一 nonce 注入内联
  `<style>` 与 `<script>`（`entry-page.ts`）。第三方人机验证（Turnstile /
  hCaptcha）按 origin 放行 `script-src` 与 `frame-src`，其组件渲染在自家
  iframe 内，因此 `style-src` 可以保持严格。
- **宽松策略**（swagger-ui）：`script-src 'self' 'unsafe-inline'`。swagger-ui
  的 bootstrap 内联脚本无法携带 nonce；该页面仅运维/开发使用。
- 后续可评估在 swagger 改造后移除 `unsafe-inline`（例如独立文档站点）。

helmet 负责其余安全响应头（CSP 由上述中间件接管）：

| 头                           | 值                                                   |
| ---------------------------- | ---------------------------------------------------- |
| Strict-Transport-Security    | `max-age=31536000; includeSubDomains`（helmet 默认） |
| Referrer-Policy              | `no-referrer`（helmet 默认）                         |
| X-Content-Type-Options       | `nosniff`                                            |
| X-Frame-Options              | `SAMEORIGIN`（另有 CSP `frame-ancestors 'self'`）    |
| Cross-Origin-Opener-Policy   | `same-origin`                                        |
| Cross-Origin-Resource-Policy | `cross-origin`（纹理分发需要）                       |

web 侧（`apps/web`）通过 `proxy.ts`（Next 16 的 proxy 文件约定）为全部 HTML 页面
注入**按请求 nonce 的 CSP**，与 API 层策略对齐（纵深防御，所有用户可见 HTML 的出口
都受保护）：

- `script-src 'self' 'nonce-…'` + 第三方人机验证 origin（Turnstile / hCaptcha 脚本
  由页面 bundle 在运行时动态注入，按 host 放行），dev 另加 `'unsafe-eval'`（React
  调试需要）。
- `style-src 'self' 'unsafe-inline'`：React 的内联 `style` 属性无法携带 nonce。
- `img-src 'self' data: blob: http: https:`：论坛 Markdown 允许作者任意外链图片，
  签名纹理 / 头像 URL 也指向 API 源。
- `connect-src 'self'` + `NEXT_PUBLIC_API_BASE_URL` 的 origin（dev 直连 :8000 时需要）；
  `frame-src` 放行人机验证 origin；其余 `default-src` / `base-uri` / `form-action` /
  `frame-ancestors` 与服务端严格策略一致。
- matcher 排除 `/api`（rewrites 到 Nest，响应自带 CSP）、`_next/static`、
  `_next/image` 与预取请求。

已知代价：nonce 要求每个页面动态渲染——首页失去 30s 静态缓存窗口，改为每请求
SSR（API 侧自身仍有 ~15s 缓存兜底）。

`next.config.ts` 继续保留 nosniff / X-Frame-Options 等既有配置；
web 不含 HSTS，所以生产由 [`deploy/Caddyfile`](../deploy/Caddyfile) 在两个 vhost 上补
`Strict-Transport-Security: max-age=31536000; includeSubDomains`（与上表 helmet 实测值一致，
两处不要写成不同的 max-age）。

## 5. 密码与令牌存储

- 网站账号密码：better-auth 自定义 hasher，**argon2id**
  （`src/modules/auth/auth.instance.ts`）。当前库默认参数
  `m=65536 KiB, p=4, t=3`，高于 OWASP 最低建议（m=19456, t=2, p=1）；
  如未来显式调参，同步更新此处。
- 启动器令牌（Yggdrasil/OAuth）：SHA-256 摘要落库，不存明文（`token` 表）。
- OAuth 客户端 secret（旗下服务接入）：SHA-256 摘要落库（`oauth_client` 表），
  明文仅创建/重置时返回一次，校验用时序安全的 `verifySha256`（`oauth.util.ts`）。
- OAuth 授权码/记住授权：授权码只存哈希、单次使用；注册客户端的 `redirect_uri`
  精确白名单匹配（叠加 HTTPS/loopback 基础规则防开放重定向）；用户在个人主页
  「已授权服务」撤销后，该客户端全部令牌立即吊销。
- 公开客户端（未配置 `client_secret`）**强制 PKCE**：签发授权码时必须携带
  `code_challenge`，否则 entry 直接拒绝，不留无凭据可换的授权码。
- 交换授权码必须回传 `redirect_uri` 且与授权请求逐字一致（RFC 6749 §4.1.3）；
  legacy 启动器流程保持宽松以兼容旧客户端。
- 机密客户端刷新必须携带 `client_secret`，`client_id` 与令牌记录不一致 → 401；
  客户端被停用 → 403。
- 封禁即时生效：管理端封禁（账号级/游戏级）除写入 `banned` 外，同步吊销该用户
  全部启动器/OAuth 令牌；刷新已被封禁检查拦截，访问令牌不再等待 30 天 TTL 自然过期。

## 6. 依赖审计（pnpm audit）

在 `apps/server` 下运行 `pnpm audit --prod` 复核；当前生产依赖 high 清零，
剩 **1 moderate（豁免留痕）**：

| 发现                                                         | 严重度   | 处置                                                                                                                                                                                                  |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body-parser < 2.4.0（DoS，GHSA-27r3-jxmh-p828）              | high     | 根 `package.json` `pnpm.overrides` 强制 `^2.4.0`                                                                                                                                                      |
| multer < 2.5.0（DoS，GHSA 异步 fileFilter）                  | high     | 同上，强制 `^2.5.0`                                                                                                                                                                                   |
| esbuild ≤ 0.24.2（dev server 请求伪造，GHSA-67mh-4wv8-2f99） | moderate | **豁免**：仅经 better-auth 的 peer `drizzle-kit` → `@esbuild-kit` 进入依赖树，是 drizzle-kit 自身的开发工具链；生产构建走 `@nestjs/cli`（tsc），运行时不执行 esbuild dev server。上游修复后删除豁免。 |

## 7. 权限模型的回归覆盖

四级角色（user/reviewer/admin/superadmin）+ 9 项 `user_permission` 下放能力的
越权用例已双层覆盖：service 层 `admin-access.service.test.ts` 覆盖判定逻辑，
HTTP 层 `apps/server/test/e2e/permissions.e2e.test.ts` 覆盖 user 403、
reviewer 无能力 403、superadmin 授 `users.ban` 后可 ban、封禁账号在论坛与
管理端点双双被拒，全部断言 envelope `10003`。
