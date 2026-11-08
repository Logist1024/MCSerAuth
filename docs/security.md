# 安全基线

安全基线记录。改动遵循「逐项收紧、不破坏既有页面」原则。

## 内容安全策略（CSP）

服务端（`apps/server`）已开启 CSP（此前因 entry 授权页内联样式/脚本显式关闭）：

- **策略生成**：`src/common/csp.ts`。中间件按请求生成 nonce（16 字节随机），为
  `/api/oauth/entry` 一族 HTML 设置严格策略，为 swagger `/docs*` 设置宽松策略。
- **严格策略**（entry 登录/确认页）：`script-src` / `style-src` 均要求
  `'nonce-…'`，**不含 `unsafe-inline`**；页面模板把同一 nonce 注入内联
  `<style>` 与 `<script>`（`entry-page.ts`）。第三方人机验证（Turnstile /
  hCaptcha）按 origin 放行 `script-src` 与 `frame-src`，其组件渲染在自家
  iframe 内，因此 `style-src` 可以保持严格。
- **宽松策略**（swagger-ui）：`script-src 'self' 'unsafe-inline'`。swagger-ui
  的 bootstrap 内联脚本无法携带 nonce；该页面仅运维/开发使用。
- 后续可评估在 swagger 改造后移除 `unsafe-inline`（例如独立文档站点）。

helmet 继续负责其余安全响应头（CSP 由上述中间件接管）：

| 头                           | 值                                                   |
| ---------------------------- | ---------------------------------------------------- |
| Strict-Transport-Security    | `max-age=31536000; includeSubDomains`（helmet 默认） |
| Referrer-Policy              | `no-referrer`（helmet 默认）                         |
| X-Content-Type-Options       | `nosniff`                                            |
| X-Frame-Options              | `SAMEORIGIN`（另有 CSP `frame-ancestors 'self'`）    |
| Cross-Origin-Opener-Policy   | `same-origin`                                        |
| Cross-Origin-Resource-Policy | `cross-origin`（纹理分发需要）                       |

web 侧（`apps/web/next.config.ts`）继续保留 nosniff / X-Frame-Options 等既有配置；
它**不含** HSTS，所以生产由 [`deploy/Caddyfile`](../deploy/Caddyfile) 在两个 vhost 上补
`Strict-Transport-Security: max-age=31536000; includeSubDomains`（与上表 helmet 实测值一致，
两处不要写成不同的 max-age）。

## 依赖审计（pnpm audit）

2026-10-31 状态：`pnpm audit --prod` 剩 **1 moderate（豁免留痕）**，high 清零。

| 发现                                                         | 严重度   | 处置                                                                                                                                                                                                  |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body-parser < 2.4.0（DoS，GHSA-27r3-jxmh-p828）              | high     | 根 `package.json` `pnpm.overrides` 强制 `^2.4.0`                                                                                                                                                      |
| multer < 2.5.0（DoS，GHSA 异步 fileFilter）                  | high     | 同上，强制 `^2.5.0`                                                                                                                                                                                   |
| esbuild ≤ 0.24.2（dev server 请求伪造，GHSA-67mh-4wv8-2f99） | moderate | **豁免**：仅经 better-auth 的 peer `drizzle-kit` → `@esbuild-kit` 进入依赖树，是 drizzle-kit 自身的开发工具链；生产构建走 `@nestjs/cli`（tsc），运行时不执行 esbuild dev server。上游修复后删除豁免。 |

复核命令：`pnpm audit --prod`（在 `apps/server` 下）。

## 密码哈希

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
- 注册客户端令牌交换加固（2026-11-08）：
  - **公开客户端（未配置 `client_secret`）强制 PKCE**：签发授权码时必须携带
    `code_challenge`，否则 entry 直接拒绝（页面上提示），不留无凭据可换的授权码。
  - **交换授权码必须回传 `redirect_uri`** 且与授权请求逐字一致（RFC 6749 §4.1.3）；
    legacy 启动器流程保持宽松以兼容旧客户端。
  - **refresh 认证**：机密客户端刷新必须携带 `client_secret`，`client_id` 与令牌
    记录不一致 → 401；客户端被停用 → 403。
- 封禁即时生效：管理端封禁（账号级/游戏级）除写入 `banned` 外，同步吊销该用户
  全部启动器/OAuth 令牌；刷新已被封禁检查拦截，访问令牌不再等待 30 天 TTL 自然过期。

## 权限矩阵

四级角色（user/reviewer/admin/superadmin）+ 9 项 `user_permission` 下放能力
（含 `oauth.clients`）的越权用例已双层覆盖：service 层 `admin-access.service.test.ts`
覆盖判定逻辑，
HTTP 层 `apps/server/test/e2e/permissions.e2e.test.ts`
覆盖 user 403、reviewer 无能力 403、superadmin 授 `users.ban` 后可 ban、
封禁账号在论坛与管理端点双双被拒，全部断言 envelope `10003`。
