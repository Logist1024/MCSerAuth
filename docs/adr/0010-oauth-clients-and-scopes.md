# ADR 0010：OAuth 注册客户端体系与 scope 模型（旗下服务 SSO）

- 状态：已采纳
- 日期：2026-11-08

## 背景

站点已有面向启动器的 OAuth 授权服务端（PKCE + opaque token，见 `docs/protocol-checklist.md`
§2.1），但它是"单租户"形态：`client_id` 是可选自由字段、`redirect_uri` 任意 HTTPS/localhost
放行、scope 只存不校验。MC 服务器旗下其他服务（语音站、Wiki、活动站等）需要用统一账号
便捷登录，并拿到该账号在 MC 服务器中的玩家身份（**UUID**），现有机制无法安全支撑。

## 决策

- **客户端注册进数据库，管理端管理**：新增 `oauth_client` 表（`client_id` 公开标识、
  `client_secret` 仅存 SHA-256 哈希、`redirect_uris` 精确白名单、`allowed_scopes`、`enabled`），
  通过 `/api/admin/oauth-clients`（新能力位 `oauth.clients`）做增删改查与 secret 轮换；
  secret 明文只在创建/重置时返回一次。不采用 env 静态白名单——每接入一个服务都要改配置重启，
  长期成本高于一套管理 CRUD。
- **双通道并存，legacy 不破坏**：请求带已注册 `client_id` → 严格校验（redirect 精确匹配、
  scope ⊆ allow-list、机密客户端 authenticate 必须带 `client_secret`）；不带 `client_id` →
  保持既有启动器行为（任意 HTTPS/localhost 回调、全量 scope）；带了但未注册/停用 → 400。
  已真机联调的启动器（F1）不受影响。
- **三档 scope，userinfo 回源而非 JWT**：`basic`（账号 id/昵称，恒授予）、`player`
  （玩家 UUID/昵称/封禁状态）、`email`；缺失 `scope` 默认 `basic player`。新增
  `GET|POST /api/oauth/userinfo` 按 token 上记录的 scope 过滤返回。**不签发 OIDC id_token**：
  旗下服务数量有限且同源可信，回源 userinfo 换取即时吊销能力（撤销授权令牌立刻失效），
  避免引入 RSA 密钥管理与 JWKS 的复杂度；这与现有 opaque token 体系（只存哈希、可即时吊销）一致。
- **记住授权（consent）实现一键登录**：`oauth_consent` 表按 `(user, client)` 记录已授权
  scope 并集；entry 发现覆盖本次请求时直接 302 带 code 回跳，不再渲染确认页。scope 扩大时
  重新确认。用户可在个人主页"已授权服务"面板查看/撤销（撤销同时吊销该客户端全部令牌）；
  删除客户端同样吊销其全部令牌并清除 consent。
- **令牌可追溯**：`token` 表新增可空 `client_id`/`scope` 列（可空保证存量启动器/Yggdrasil
  令牌兼容），token 响应自此携带 `scope`。

## 影响

- 旗下服务接入流程：管理端注册客户端 → 标准授权码 + PKCE 流程 → `userinfo` 取玩家 UUID；
  最小接入示例见 `apps/web/app/oauth/callback`。
- `oauth_consent` 的唯一约束是普通复合唯一索引（ADR 0006 禁部分唯一索引）；scope 合并逻辑
  在应用层（`OAuthClientService.saveConsent`），三方言行为一致。
- 机密客户端的 secret 校验是时序安全的（`verifySha256`，`oauth.util.ts`）；redirect_uri
  匹配在 HTTPS/loopback 基础规则之上叠加精确匹配，双重防开放重定向。
- 新增能力位 `oauth.clients`（`ADMIN_PERMISSIONS`）默认仅 superadmin；授予后可自助管理客户端。
