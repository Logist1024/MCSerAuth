# OAuth SSO 接入指南（旗下服务开发者）

本站为 MC 服务器旗下其他服务（官网、语音、皮肤站、统计面板等）提供统一登录：
用户用 MCSerAuth 网站账号授权，你的服务拿到**访问令牌 + 刷新令牌**，并可按需
读取用户的**游戏角色 UUID**——服务器白名单、数据统计等以玩家为粒度的功能都
以这个 UUID 为唯一键。

协议为标准 OAuth 2.0 授权码流程（+ PKCE），错误统一为 `{error, errorMessage}`
（不带 `{code,data}` envelope）。字段定义以 `packages/shared/src/protocol/` 与
`docs/openapi.json` 为准；本文是面向接入方的走通指南。

## 0. 接入前：注册客户端

接入需要管理员在后台注册一个"OAuth 客户端"（能力位 `oauth.clients`）：

```http
POST /api/admin/oauth-clients        # 管理员 Cookie 会话
{
  "clientId": "my-service",           # 可省略，自动生成 mcs_cli_ 前缀
  "name": "我的服务",
  "redirectUris": ["https://my.example.com/auth/callback"],
  "allowedScopes": ["basic", "player"],
  "clientSecret": "……"                # 省略则为公开客户端（见 §2 PKCE）
}
```

- `redirectUris` 是**精确白名单**：授权请求里的 `redirect_uri` 必须与其中一项
  逐字相同，且只允许 HTTPS 或本机 HTTP（`localhost` / `127.0.0.1` / `::1`）。
- `allowedScopes` 之外请求的 scope 会被拒绝。三档 scope：
  - `basic` — 账号 id + 昵称（**恒授予**，无需申请）；
  - `player` — 游戏角色 `{uuid, nickname, banned}`，**绝大多数服务的核心诉求**；
  - `email` — 注册邮箱（谨慎申请，授权页会明确展示给用户）。
- `client_secret` 明文**只在创建/重置响应里出现一次**，服务端只存 SHA-256。
  遗漏即重置：`POST /api/admin/oauth-clients/:clientId/secret/reset`。
- 不带 secret 注册的是**公开客户端**（如桌面/移动应用）：这类客户端**强制 PKCE**，
  且令牌交换不需要 secret。

## 1. 授权码流程（浏览器跳转）

### 第 1 步：构造授权跳转

把用户浏览器引导到（先在本地生成 PKCE 与 state）：

```
GET https://<Auth服务>/api/oauth/entry
  ?client_id=my-service
  &redirect_uri=https://my.example.com/auth/callback
  &response_type=code
  &scope=player
  &state=<随机串>
  &code_challenge=<S256(verifier)>
  &code_challenge_method=S256
```

- 该页面由本站渲染（登录页或授权确认页），与网站共享会话 Cookie。
- 用户此前勾选过"记住此授权"且 scope 未扩大时，会**直接 302 回跳**，无感登录。
- `state` 原样回传，**必须校验**（防 CSRF）。

PKCE 生成（任何语言几行即可）：

```text
code_verifier  = 43~128 个 [A-Za-z0-9-._~] 随机字符
code_challenge = BASE64URL(SHA256(code_verifier))   # 43 字符，无填充
```

### 第 2 步：接收回调

授权确认后浏览器 302 到：

```
https://my.example.com/auth/callback?code=mcs_code_…&state=<原样回传>
```

校验 `state` 与你发起时存的一致（session/cookie 里临时保存），然后立刻用
`code` 换令牌——**授权码单次使用，5 分钟过期**。

### 第 3 步：换取令牌

```http
POST /api/oauth/authenticate
Content-Type: application/json

{
  "code": "mcs_code_…",
  "client_id": "my-service",
  "client_secret": "……",              # 机密客户端必填；公开客户端省略
  "redirect_uri": "https://my.example.com/auth/callback",   # 必填，须逐字一致
  "code_verifier": "<第 1 步的 verifier>"
}
```

成功（200）：

```jsonc
{
  "access_token": "mcs_at_…",
  "token_type": "Bearer",
  "expires_in": 2592000, // 默认 30 天，可配
  "refresh_token": "mcs_rt_…",
  "scope": "basic player", // 实际授予的 scope
  "user": { "id": "…", "email": "…", "name": "…", "role": "user" },
}
```

错误：`400 IllegalArgumentException`（参数缺失/PKCE 缺 verifier）、
`401 UnauthorizedException`（code 无效/已用/过期、redirect_uri 不一致、
secret 错误、PKCE 失败）、`403`（客户端被停用或账号封禁）。

> 机密客户端建议把 `client_secret` 只放在服务端使用，不要下发到浏览器。

## 2. 调用 userinfo 获取用户与玩家信息

```http
GET /api/oauth/userinfo
Authorization: Bearer mcs_at_…
```

按令牌 scope 返回（`POST` 变体等价）：

```jsonc
{
  "user": {
    "id": "…",
    "name": "…", // basic 恒有
    /* , "email": "…" */
  }, // 仅 scope 含 email
  "player": { "uuid": "32位小写hex", "nickname": "…", "banned": false },
} // 仅 scope 含 player
```

`player.uuid` 即该用户在本 MC 服务器体系内的唯一身份，用作用户关联主键。
用户**首次完成授权时**才自动开通游戏角色，此前 `player` 字段缺失——处理就好，
不需要报错，引导用户去玩一次或上传皮肤即可开通。

## 3. 令牌生命周期与刷新

- **access token**：默认 30 天（`OAUTH_ACCESS_TOKEN_TTL_SECONDS`）。
- **refresh token**：默认 60 天绝对有效期（从首次授权起算，刷新不延长）。
- 刷新（**轮换**：旧 access/refresh 立即全部失效）：

  ```http
  POST /api/oauth/refresh
  { "refresh_token": "mcs_rt_…", "client_id": "my-service",
    "client_secret": "……" }          # 机密客户端必填
  ```

- 响应结构与 `authenticate` 相同，拿新令牌对替换旧令牌对。
- **把刷新放在服务端**：轮换意味着并发使用旧 refresh 会 401，浏览器端各自
  持有令牌会互相踢掉。建议服务端每用户存一份令牌对，串行刷新。
- 刷新令牌被重放（旧值再次使用）→ 401，此时应让用户重新走授权。
- 用户在网站"已授权服务"撤销授权 → 该客户端全部令牌立即失效 → 401。
- **用户被封禁 → 全部令牌立即吊销**，下一次 userinfo/refresh 即 401/403。
  请把 401 当作"需要重新授权"统一处理，不要区分细原因后缓存。

## 4. 公开客户端（无 client_secret）

桌面工具、启动器插件等无法安全保管 secret 的场景，注册时省略 `clientSecret`
即为公开客户端：

- **强制 PKCE**：授权请求不带 `code_challenge` 会被直接拒绝；
- 令牌交换与刷新不需要 `client_secret`；
- 每次接入都应生成新的 `code_verifier`（不要复用）。

## 5. 接入清单（checklist）

- [ ] 向管理员申请客户端，登记全部 redirect_uri（含测试环境）
- [ ] 只申请业务需要的 scope（`player` 通常足够，`email` 需说明用途）
- [ ] 发起授权前生成随机 `state` 与一次性 PKCE `verifier`
- [ ] 回调页严格校验 `state`；`error` 参数（用户拒绝/封禁）给出友好提示
- [ ] 令牌交换在服务端完成；secret/令牌不落浏览器 localStorage
- [ ] 每用户串行刷新，旧令牌对被新令牌对原子替换
- [ ] userinfo 返回 401/403 时统一走"重新授权"分支
- [ ] 以 `player.uuid` 为用户关联键，容忍 `player` 暂缺（角色未开通）
- [ ] 对 `error`/`errorMessage` 做展示，不解析具体文案做逻辑判断

## 6. 本地联调

1. `pnpm dev`（server :8000，web :3000）；管理员注册客户端，
   测试环境回调可登记 `http://localhost:3000/...`。
2. 浏览器打开 `GET /api/oauth/entry?...` 走一遍流程，或参考网站自带的
   调试页 `apps/web/app/oauth/callback`（发起 → 回调 → 换令牌 → userinfo →
   刷新的全链路演示）。
3. 完整接口定义见 `docs/openapi.json`（`/docs` 有 Swagger UI）；
   安全基线见 `docs/security.md`。
