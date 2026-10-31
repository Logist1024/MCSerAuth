# 安全基线

2.0 F3（安全加固）落地后的基线记录。改动遵循「逐项收紧、不破坏既有页面」原则。

## 内容安全策略（CSP）

服务端（`apps/server`）此前显式关闭 CSP（entry 授权页内联样式/脚本所致，T9），现已开启：

- **策略生成**：`src/common/csp.ts`。中间件按请求生成 nonce（16 字节随机），为
  `/api/oauth/entry` 一族 HTML 设置严格策略，为 swagger `/docs*` 设置宽松策略。
- **严格策略**（entry 登录/确认页）：`script-src` / `style-src` 均要求
  `'nonce-…'`，**不含 `unsafe-inline`**；页面模板把同一 nonce 注入内联
  `<style>` 与 `<script>`（`entry-page.ts`）。第三方人机验证（Turnstile /
  hCaptcha）按 origin 放行 `script-src` 与 `frame-src`，其组件渲染在自家
  iframe 内，因此 `style-src` 可以保持严格。
- **宽松策略**（swagger-ui）：`script-src 'self' 'unsafe-inline'`。swagger-ui
  的 bootstrap 内联脚本无法携带 nonce；该页面仅运维/开发使用。
- 后续（F11）：`entry-page.ts` 抽模板与静态样式后，可进一步评估移除对
  swagger 的 `unsafe-inline`（例如独立文档站点）。

helmet 继续负责其余安全响应头（CSP 由上述中间件接管）：

| 头                           | 值                                                   |
| ---------------------------- | ---------------------------------------------------- |
| Strict-Transport-Security    | `max-age=31536000; includeSubDomains`（helmet 默认） |
| Referrer-Policy              | `no-referrer`（helmet 默认）                         |
| X-Content-Type-Options       | `nosniff`                                            |
| X-Frame-Options              | `SAMEORIGIN`（另有 CSP `frame-ancestors 'self'`）    |
| Cross-Origin-Opener-Policy   | `same-origin`                                        |
| Cross-Origin-Resource-Policy | `cross-origin`（纹理分发需要）                       |

web 侧（`apps/web/next.config.ts`）继续保留 nosniff / X-Frame-Options 等既有配置。

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

## 权限矩阵

四级角色（user/reviewer/admin/superadmin）+ 8 项 `user_permission` 下放能力的
越权用例（能力 × 角色 × 管理端点），按开发指南 F3.4 与 F8 的 HTTP e2e 层合流
补齐；service 层先有 `admin-access.service.test.ts` 覆盖判定逻辑。
