# Commons-Designs 协议对照 Checklist（M2 会话与形象）

> 依据：《docs/项目策划案.md》2.2
> 状态：**M1 认证核心 + M2 会话/档案/皮肤披风 + M3/M4 论坛与账号/管理端 + M4.5 人机验证与成长体系
> 均已实现**（非协议端点见 OpenAPI 与 README）。2.0 M5 已完成 F2 多库真实验证与 F6 文档同步。
> **F1 真机联调已开始（2026-11-01，生产 VPS）**：HMCL 真机登录与皮肤下发通过（§3.1.9），
> §4 的 1–7 项经真机 + 生产 curl 断言收敛，8–10 项归产品决策；**进服握手（Paper 侧
> join/hasJoined 真机）仍待补录**，是 F1 关闭前仅剩的一项。
> 本文是"服务端实现 ↔ 官方协议文档"的
> 逐字段核对底稿；所有标有 ⚠️ 的字段均为**待官方协议文档核对**的暂定值，取得协议原文后逐项打勾。
> 维护规则：任何协议端点的字段/状态码改动，必须同步更新本文与 `docs/openapi.json`。

## 0. 文档基线说明

M0 开发环境的网络访问受限，官方协议文档（Commons-Designs Server API）原文未能取得，
本仓库也尚未 vendor 协议文档。因此：

- stub 的字段命名按《项目策划案》端点清单 + authlib-injector/Minecraft 生态惯例推定；
- **核对方式**：取得协议文档后逐端点对照本表右列"核对项"，或使用 HMCL/PCL2 抓取其真实请求（见 §3），
  以"启动器实际发出/期望收到"为准修订实现；
- 实现侧所有暂定字段都集中在 `packages/shared/src/protocol/*.ts`，修订时只改一处。

## 1. 通用约定（所有协议端点）

| 项           | 约定                                                                                                                                                               | 核对              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| 响应封装     | **不使用**统一信封 `{code,data}`；协议端点返回协议原生形状                                                                                                         | ⚠️ 以协议文档为准 |
| 错误形状     | `{ "error": "<错误名>", "errorMessage": "<可读信息>" }`，`cause` 可选且不得含敏感信息                                                                              | ⚠️                |
| 错误名取值   | `IllegalArgumentException` / `ForbiddenOperationException` / `UnauthorizedException` / `NotFoundException` / `NotImplementedException` / `InternalServerException` | ⚠️                |
| 状态码映射   | 400/413/415/422→IllegalArgument；401→Unauthorized；403→ForbiddenOperation；404→NotFound；501→NotImplemented；其余→Internal                                         | ⚠️                |
| Content-Type | 请求 `application/json`（上传为 `multipart/form-data`）；响应 `application/json`，授权页为 `text/html`，纹理为 `image/png`                                         | —                 |
| 认证         | 双轨已落地：better-auth Cookie（网站）与 OAuth Access/Refresh Bearer（启动器）；`/user/profiles/me`、皮肤/披风查询与上传同时接受两者（策划案 2.2.3）               | —                 |
| UUID 形态    | 32 位小写十六进制、无连字符（`PROTOCOL_UUID_PATTERN`）；查询/joinServer 同时兼容带连字符输入                                                                       | ⚠️                |
| 基地址       | 本地 `http://localhost:8000`；上线后为认证域（env `AUTH_URL`，T2）                                                                                                 | —                 |

### 1.1 实现状态（M2）

全部登记端点均已实现：

- `GET /api/oauth/availability`
- `GET /api/oauth/entry` 与 `POST /api/oauth/entry`（NestJS 直出登录/授权确认页）
- `POST /api/oauth/authenticate`（授权码 + PKCE → 令牌）
- `POST /api/oauth/refresh`（刷新令牌轮换）
- `GET /api/user/profiles/me`（Bearer 或 better-auth Cookie）
- `POST /api/session/joinServer`、`POST|GET /api/session/hasJoined`
- `GET /api/profiles/minecraft/{name}`、`POST /api/profiles/minecraft`、`GET /api/profiles/{uuid}`
- `GET|POST /api/minecraft/profile/skins`、`GET|POST /api/minecraft/profile/capes`
- `GET /api/minecraft/profile/textures/{id}`（签名 URL 分发）

配套管理端点（**非协议端点**，统一 `{code,data}` 封装，better-auth Cookie + 角色）：

- `GET|POST /api/admin/servers`、`PATCH /api/admin/servers/{id}`（仅 `superadmin`；服务器白名单）
- `GET /api/admin/textures`、`POST /api/admin/textures/{id}/approve|reject`（`reviewer` 起；上传即生效，端点用于事后下架/恢复）

协议请求校验失败返回 **HTTP 400**；认证失败 **401**；白名单/封禁/越权 **403**；无档案/无会话 **204**。

> M3/M4 的论坛（`/api/forum/*`）、账号资料与纹理（`/api/user/*`：`settings`、`email`、
> `player/rename`、`textures/:id/activate`、`textures/:id`）、公开主页（`/api/users/{id}`）
> 与管理端（`/api/admin/forum/*`）属于**非协议端点**，使用统一 `{code,data}` 封装，
> 不在本 checklist 的 Commons-Designs 字段核对范围内；契约以 `docs/openapi.json` 为准。
> 原「设备令牌（网页自助）」端点 `/api/user/tokens` 已于 2026-10-25 移除（见 §5 变更记录），
> 恢复排期为 2.0 F14。

## 2. 端点对照表

图例：✅ curl/浏览器已冒烟（2026-10-20）｜🧪 待启动器联调｜⚠️ 字段待核对

### 2.1 账户与授权（OAuth 风格）

#### `GET /api/oauth/availability`

- M1 行为：✅ 恒返回 `available: true`（连通性检查点）。
- 响应字段：

| 字段        | 类型    | M0 固定值 | 核对                           |
| ----------- | ------- | --------- | ------------------------------ |
| `available` | boolean | `true`    | ⚠️ 字段名/是否含更多信息待核对 |

- 状态码：200；配置错误才会出现 5xx（统一错误形状）。
- 请求参数：无。

#### `GET /api/oauth/entry`

- M1 行为：✅ 由 NestJS 直出 `text/html`（A3：与网站登录态同源）。
  - 无 better-auth Cookie：渲染登录页，登录成功后自动回到当前授权请求；
  - 有 Cookie：渲染授权确认页，展示账号、player 与收到的授权参数。
- 请求参数（浏览器跳转 query，暂定 OAuth 风格）：

| 参数                                       | 类型                    | 必填 | 说明           | 核对                    |
| ------------------------------------------ | ----------------------- | ---- | -------------- | ----------------------- |
| `client_id`                                | string                  | 否   | 启动器标识     | ⚠️                      |
| `redirect_uri`                             | string                  | 否   | 回跳地址       | ⚠️                      |
| `response_type`                            | string                  | 否   | 授权类型       | ⚠️                      |
| `scope`                                    | string                  | 否   | 授权范围       | ⚠️                      |
| `state`                                    | string                  | 否   | 防 CSRF 透传值 | ⚠️                      |
| `code_challenge` / `code_challenge_method` | string (`S256`/`plain`) | 否   | PKCE           | ⚠️ 是否使用 PKCE 待核对 |

- 响应：`200` HTML（登录页或授权确认页）。
- 需核对：启动器是否要求该页以特定 query 跳回（`redirect_uri` + `code`/`state` 格式）。

#### `POST /api/oauth/entry`（M1 新增：授权确认提交）

- 行为：✅ 校验网站 Cookie、Origin、`redirect_uri` 与 PKCE 后签发一次性授权码，`302` 回跳
  `redirect_uri?code=…&state=…`。
- 表单字段：与 GET query 相同；`redirect_uri` 必填（缺失/非法 → 400）。
- 安全约束：
  - Origin 必须属于 `APP_URL` / `AUTH_URL`（跨站 POST → 403），配合 better-auth Cookie 的
    `SameSite=Lax`；
  - `response_type` 仅接受 `code`；
  - `redirect_uri` 仅允许 HTTPS，或本机 `http://localhost|127.0.0.1|::1`（防开放重定向）；
  - 授权码只存 SHA-256 哈希，单次使用（`used_at`），TTL 由
    `OAUTH_AUTH_CODE_TTL_SECONDS` 配置（默认 300 秒）。
- 状态码：302 成功；400 参数/回调地址非法；401 未登录；403 Origin 不受信任。

#### `POST /api/oauth/authenticate`

- M1 行为：✅ 已实现，授权码换取 `OAuthTokenResponse`。
- 请求体（`code` 与 `token` 为同义字段，至少提供一个；均缺失 → 400）：

| 字段            | 类型   | 必填              | 核对                |
| --------------- | ------ | ----------------- | ------------------- |
| `code`          | string | 与 `token` 二选一 | ⚠️ 主流程究竟用哪种 |
| `token`         | string | 同上              | ⚠️                  |
| `client_id`     | string | 否                | ⚠️                  |
| `redirect_uri`  | string | 否                | ⚠️                  |
| `code_verifier` | string | 否（PKCE）        | ⚠️                  |

- 校验规则（M1）：
  - `code` / `token` 二选一，均缺失 → `400 IllegalArgumentException`；
  - 授权码不存在、已使用、已过期 → `401 UnauthorizedException`；
  - 授权码带 PKCE 时缺 `code_verifier` → 400；verifier 不匹配 → 401；
  - 请求携带 `client_id` / `redirect_uri` 且与授权码记录不一致 → 401；
  - `player.banned = true` → `403 ForbiddenOperationException`。
- M1 响应（`OAuthTokenResponse`）：

| 字段            | 类型                                   | 核对                              |
| --------------- | -------------------------------------- | --------------------------------- |
| `access_token`  | string                                 | ⚠️ 命名风格（snake_case）待核对   |
| `token_type`    | string（暂定 `Bearer`）                | ⚠️                                |
| `expires_in`    | number（秒，默认 2592000=30 天，可配） | ⚠️ 有效期定值待策划确认           |
| `refresh_token` | string                                 | ⚠️ 是否在 authenticate 阶段即返回 |
| `scope`         | string                                 | ⚠️ 可选；当前不返回（未持久化）   |
| `user`          | object `{id,email,name,role}`          | ⚠️ 可选；当前返回                 |

- 状态码：200 成功；400 参数非法；401 授权码/令牌无效；403 账号封禁。
- 实现要点：
  - access/refresh 均为随机 opaque 字符串（前缀 `mcs_at_` / `mcs_rt_`），数据库只存
    SHA-256 哈希，绑定 `token.player_uuid`；
  - `expires_in` 取 `OAUTH_ACCESS_TOKEN_TTL_SECONDS`（默认 30 天）；
  - 账号首次完成授权时，若尚未绑定 player，则按账号昵称自动创建 1:1 的 player
    （UUID 32 位小写十六进制，昵称冲突时追加随机后缀）——该自动开通策略待产品最终确认。

#### `POST /api/oauth/refresh`

- M1 行为：✅ 已实现，刷新令牌轮换。
- 请求体：`refresh_token`（string，必填）+ `client_id`（可选）→ 缺失时
  `400 IllegalArgumentException`；`client_id` 目前不参与令牌绑定。
- 响应：同 `OAuthTokenResponse`；状态码 200 / 400 / 401 / 403。
- 轮换语义：
  - 成功后旧 access/refresh 立即失效（同一行原子更新哈希），并发使用旧 refresh → 401；
  - refresh 绝对有效期 = 首次授权 `createdAt` + `OAUTH_REFRESH_TOKEN_TTL_SECONDS`
    （默认 60 天），轮换不延长该窗口；
  - `player.banned = true` → 403，且不消耗 refresh token。

#### `GET /api/user/profiles/me`

- M1 行为：✅ 已实现，双认证方式：
  - `Authorization: Bearer <access_token>`：启动器令牌（哈希查找 + 有效期 + 吊销校验）；
  - 无 Authorization 时回退到 better-auth Cookie 会话（供网站页面读取）。
  - 若携带了 Bearer 但无效，直接 401，不会静默回退到 Cookie。
- 响应（暂定）：

```jsonc
{
  "user":   { "id": "...", "email": "...", "name": "...", "role": "user|reviewer|admin|superadmin" },
  "player": { "uuid": "…32hex…", "nickname": "...", "banned": false } | null
}
```

- 状态码：200；401 无有效令牌/会话。`player` 在首次启动器授权前为 `null`
  （网站 Cookie 登录后即可看到）。⚠️ 整体结构与 `player` 可空性待官方文档核对。

### 2.2 Minecraft 会话服务（服务器调用）

已实现（M2）。会话登记短期有效（`SESSION_JOIN_TTL_SECONDS`，默认 300 秒）；同一玩家在同一服务器
重复 `joinServer` 会覆盖上一行。`serverId` 必须由管理员通过 `/api/admin/servers` 登记且
`enabled=true`（服务端白名单），否则一律 403。

> `server_entry.secret` 目前只存 SHA-256 哈希、创建时明文返回一次，预留给后续服务器鉴权；
> 当前协议请求**不要求**携带密钥，保持 authlib-injector 兼容，待官方协议核对后收紧。

#### `POST /api/session/joinServer`

- 行为：✅ 校验启动器令牌、`selectedProfile`、服务器白名单与封禁状态，写入短期会话；成功 **204** 无响应体。
- 请求体（Yggdrasil 命名，暂定）：

| 字段              | 类型   | 说明                                            | 核对               |
| ----------------- | ------ | ----------------------------------------------- | ------------------ |
| `accessToken`     | string | 启动器访问令牌（与 Bearer 接口同一令牌体系）    | ⚠️ 大小写/携带方式 |
| `selectedProfile` | string | 玩家 UUID（32 位；兼容带连字符）                | ✅ 兼容两种形态    |
| `serverId`        | string | 服务器白名单 ID（须在 `server_entry` 内且启用） | ⚠️ 官方语义待核对  |

- 校验规则：
  - `serverId` 未登记/停用 → `403 ForbiddenOperationException`；
  - `accessToken` 未知、过期或已吊销 → `401 UnauthorizedException`；
  - `selectedProfile` 非 32 位十六进制 → `400 IllegalArgumentException`；
  - `selectedProfile` 与令牌所属 player 不一致 → `403`；
  - `player.banned = true` → `403`；
  - 成功写入 `game_session`（player、server、请求 IP、TTL）。
- 状态码：204 / 400 / 401 / 403。

#### `POST /api/session/hasJoined` 与 `GET /api/session/hasJoined`

- 本仓库**同时实现两种变体**：`POST` 使用 JSON body，`GET` 使用 query（authlib-injector 惯用）；
  两者共用同一实现。⚠️ 官方协议采用哪种（或两者都要）仍需核对。
- 参数（query 或 body）：

| 字段       | 类型   | 必填 | 说明                                                  | 核对             |
| ---------- | ------ | ---- | ----------------------------------------------------- | ---------------- |
| `username` | string | 是   | 待校验昵称（大小写敏感）                              | ⚠️ 是否应传 UUID |
| `serverId` | string | 是   | 服务器白名单 ID                                       | ⚠️               |
| `ip`       | string | 否   | 服务器观测到的客户端 IP；提供时与 joinServer 记录比对 | ⚠️ 是否要求      |

- 行为：✅
  - `serverId` 未登记/停用 → `403`；
  - 昵称不存在 → **204**（与"无会话"同为 204，避免账号枚举）；
  - `player.banned = true` → `403 ForbiddenOperationException`（封禁生效点）；
  - 无未过期会话，或 `ip` 与 joinServer 记录不一致 → **204**；
  - 命中 → **200** + `GameProfile`（含 `properties.textures`）。
- `GameProfile` 形状：

| 字段             | 类型                            | 说明                                            | 核对              |
| ---------------- | ------------------------------- | ----------------------------------------------- | ----------------- |
| `id`             | string                          | 32hex UUID                                      | ✅                |
| `name`           | string                          | 昵称                                            | ✅                |
| `properties`     | array `{name,value,signature?}` | `textures` 为 base64 JSON；`signature` 暂不返回 | ⚠️ 签名是否必需   |
| `profileActions` | string[]                        | 当前不返回                                      | ⚠️ 生态扩展待核对 |

### 2.3 玩家档案查询

已实现（M2）。三个端点都无需认证，返回与 hasJoined 相同的 `GameProfile`（含纹理属性）：

| 端点                                 | 行为                                                        | 状态码            |
| ------------------------------------ | ----------------------------------------------------------- | ----------------- |
| `GET /api/profiles/minecraft/{name}` | 按昵称精确查询                                              | 200；不存在 204   |
| `POST /api/profiles/minecraft`       | body `{"names":[...]}`，1–10 个；未知昵称跳过、保持请求顺序 | 200（可为空数组） |
| `GET /api/profiles/{uuid}`           | 按 UUID 查询；接受 32hex 或带连字符形式，非法 UUID → 400    | 200；不存在 204   |

- `properties.textures` 内容（标准 Minecraft 纹理属性）：
  ```jsonc
  {
    "timestamp": 1760000000000,
    "profileId": "…32hex…",
    "profileName": "Nick",
    "textures": {
      "SKIN": { "url": "…签名 URL…", "metadata": { "model": "slim" } }, // classic 不含 metadata
      "CAPE": { "url": "…签名 URL…" },
    },
  }
  ```
- 只有 **approved + is_active** 的纹理进入该属性；无纹理时省略 `properties`。
- ⚠️ `signature` 字段暂不返回（需要密钥对与签名体系），待官方协议核对。

### 2.4 皮肤/披风上传、审核与分发（M2）

#### `GET /api/minecraft/profile/skins` 与 `GET /api/minecraft/profile/capes`

- 行为：✅ 返回当前玩家的 `MinecraftProfileResponse`（两个路径返回相同结构）。
- 认证：`Authorization: Bearer <access_token>`（启动器）或 better-auth Cookie；Bearer 无效时
  不回退 Cookie。未登录 → 401；封禁 → 403。
- 内容：仅 **approved** 纹理；同种纹理可多条，`state=ACTIVE` 标记当前使用。
  无纹理时数组为空（不省略字段）。
- 所有 `url` 都是**短时签名 URL**（`TEXTURE_URL_TTL_SECONDS`，默认 300 秒）。
- 网站账号首次访问时会自动创建 1:1 player（与首次启动器授权同一策略）⚠️ 产品待确认。

```jsonc
{
  "id": "…32hex…",
  "name": "Nick",
  "skins": [
    {
      "id": "12",
      "state": "ACTIVE",
      "url": "http://localhost:8000/api/minecraft/profile/textures/12?expires=…&sig=…",
      "variant": "CLASSIC",
    },
  ],
  "capes": [{ "id": "13", "state": "INACTIVE", "url": "…" }],
}
```

#### `POST /api/minecraft/profile/skins` 与 `POST /api/minecraft/profile/capes`

- 行为：✅ `multipart/form-data` 上传，校验通过后**立即生效**（`approved + active`），返回 200
  `TextureUploadResponse`（含签名预览 URL）。旧 active 纹理自动置为 INACTIVE。
- 认证：同上（Bearer 或 Cookie）。
- 字段：`file`（必填 PNG）；皮肤另需 `variant=classic|slim`（缺省按 `classic`）。
- 校验（sharp）：
  - 必须是可解析的 PNG（拒绝动画 PNG、非 PNG）；
  - 仅原版尺寸：皮肤 64×32 或 64×64；披风 64×32；高清纹理返回 400；
  - 文件 ≤ 1 MiB；
  - 按 `(player, kind, sha256)` 去重；重复上传同一文件会复用记录并重新激活。
- 状态码：200；400（缺失/格式/尺寸非法）；401；403；413（文件过大，映射为
  `IllegalArgumentException`）。
- 响应字段：

| 字段         | 类型                   | 说明              |
| ------------ | ---------------------- | ----------------- |
| `id`         | number                 | 纹理记录 ID       |
| `kind`       | `skin`/`cape`          | 类型              |
| `variant`    | `classic`/`slim`/null  | 披风为 null       |
| `status`     | `pending`/`approved`/… | 上传后为 approved |
| `uploadedAt` | ISO string             | 上传/重新提交时间 |
| `url`        | string                 | 签名预览 URL      |

#### `GET /api/minecraft/profile/textures/{id}`

- 行为：✅ 直接读取 PNG，`Content-Type: image/png`。
- 鉴权：URL 签名（HMAC-SHA256，`id + expires`，密钥复用 `BETTER_AUTH_SECRET`），
  校验 `expires` 与 `sig`；无需登录。
- 状态码：200；403（签名缺失/过期/不匹配）；404（记录或文件不存在）。

#### 管理与审核端点（非协议，统一 `{code,data}` 封装，Cookie 会话）

| 端点                                    | 角色        | 行为                                                              |
| --------------------------------------- | ----------- | ----------------------------------------------------------------- |
| `GET /api/admin/servers`                | superadmin  | 列出白名单（不含密钥哈希）                                        |
| `POST /api/admin/servers`               | superadmin  | 登记 `serverId`/`name`/可选 `secret`；明文密钥只在响应中返回一次  |
| `PATCH /api/admin/servers/{id}`         | superadmin  | 更新名称或启用状态（停用后 joinServer/hasJoined 立即 403）        |
| `GET /api/admin/textures?status=&kind=` | reviewer 起 | 列出纹理；`url` 为签名预览                                        |
| `POST /api/admin/textures/{id}/approve` | reviewer 起 | 恢复为 approved + 该类型唯一 active；写 `moderation_log`          |
| `POST /api/admin/textures/{id}/reject`  | reviewer 起 | 下架为 rejected + 取消 active；写 `moderation_log`（可附 reason） |

上传即生效；恢复同类型纹理时旧的 active 自动置为 INACTIVE，不同 kind 互不影响。

### 2.5 authlib-injector 兼容层（HMCL/PCL2 外置登录）

主流程仍是 §2.1 的 OAuth 授权码 + PKCE；本节是一层**同一令牌体系**的兼容面，
让只认 Yggdrasil 的启动器（HMCL、PCL2、XMCL）用「网站邮箱 + 密码」直接登录。
**API 根地址 = `http://<host>:8000/api`**（与全局前缀重合，因此批量档案在 `/api/api/profiles/minecraft`）。

| 端点（相对根）                                    | 方法 | 成功码          | 行为                                                                                                                                                                        |
| ------------------------------------------------- | ---- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                               | GET  | 200             | 元数据：`meta.serverName`/`implementationName`/`implementationVersion`/`links` + `skinDomains`；**不提供 `signaturePublickey`**                                             |
| `/authserver/authenticate`                        | POST | 200             | `{agent?, username, password, clientToken?, requestUser?}` → `{accessToken, clientToken, availableProfiles, selectedProfile, user?}`；`username` 是网站邮箱（大小写不敏感） |
| `/authserver/refresh`                             | POST | 200             | 用 `accessToken` 换新 `accessToken`，旧值立即失效；保留原 `refresh_token` 哈希                                                                                              |
| `/authserver/validate`                            | POST | 204             | 有效 204；未知/过期/吊销/封禁 **403** `ForbiddenOperationException`                                                                                                         |
| `/authserver/invalidate`                          | POST | 204             | 幂等吊销（未知令牌也 204）                                                                                                                                                  |
| `/sessionserver/session/minecraft/join`           | POST | 204             | 不校验服务器白名单；`serverId` 是握手哈希                                                                                                                                   |
| `/sessionserver/session/minecraft/hasJoined`      | GET  | 200 / 204       | 命中 200 带 textures；无会话/未知昵称/IP 不一致 204；封禁 403                                                                                                               |
| `/sessionserver/session/minecraft/profile/{uuid}` | GET  | 200 / 204 / 400 | 与 `/api/profiles/{uuid}` 同源                                                                                                                                              |
| `/api/profiles/minecraft`                         | POST | 200             | 批量（1–10）按昵称查询，authlib-injector 的旧命名空间                                                                                                                       |
| `/api/profiles/minecraft/{name}`                  | GET  | 200 / 204       | 同上，单个                                                                                                                                                                  |
| `/minecraft/profile/skins`、`/capes`              | POST | 200             | 复用 §2.4 上传（`file` + `variant`）                                                                                                                                        |

关键约定（已实现并有冒烟记录）：

1. **令牌同源**：`authenticate` 写入的 `token` 行与 OAuth 流程完全相同，因此启动器令牌在
   `/api/user/profiles/me`（Bearer）与纹理上传中同等有效；
   `refresh`/`invalidate` 会立即影响 Bearer 认证。
2. **`serverId` 语义双轨**：原生 `/api/session/*` 仍要求管理员登记的白名单 ID（未登记 403）；
   `/api/sessionserver/*` 按 Yggdrasil 语义接受任意握手哈希。为此 `game_session.server_id`
   **已移除外键**（迁移 `0004_heavy_firebrand.sql`），停用/删除白名单不再级联清理会话，
   过期会话由 TTL（默认 300 秒）自然淘汰。
3. **纹理不签名**：元数据省略 `signaturePublickey`，authlib-injector 仅在提供公钥时校验
   `textures` 属性签名；`properties` 只带 `name`/`value`。
4. **封禁**：账号级或玩家级封禁在 `authenticate`/`refresh`/`validate` 一律 403，与原生接口一致。
5. **进服仍需客户端与服务端都注入 authlib-injector**：服务端把 `online-mode=false` 并加
   `-javaagent:authlib-injector.jar=<根地址>`；本仓库不含 Paper 插件（见 README 里程碑说明）。

### 2.6 人机验证与社区成长体系（M4.5，非协议端点）

本节全部是**统一 `{code,data}` 封装 + Cookie 会话**的站内端点，不使用协议错误形状；
门禁列写明实际校验方式（`role`=按角色下限，`cap:`=按 `user_permission` 下放能力，
superadmin 对所有 `cap:` 隐式通过）。

#### 2.6.1 人机验证（`modules/captcha`）

| 端点                      | 方法  | 成功码          | 门禁              | 行为                                                                               |
| ------------------------- | ----- | --------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `/api/captcha/config`     | GET   | 200             | 公开              | `{enabled, provider, siteKey}`；登录表单据此决定是否渲染验证组件                   |
| `/api/captcha/challenge`  | GET   | 200 / 400       | 公开（30/min）    | 仅 `builtin`：返回 `{id, svg, expiresAt}` 算术题；未启用或非 builtin **400**       |
| `/api/captcha/verify`     | POST  | 200 / 400       | 公开（20/min）    | builtin 收 `{id, answer}`、外部收 `{token}` → 签发一次性 `x-captcha-token`         |
| `/api/admin/site/captcha` | GET   | 200 / 403       | `cap:site.manage` | 返回 `CaptchaSettings`；Secret 只回 `secretSet` 布尔，**永不回显明文**             |
| `/api/admin/site/captcha` | PATCH | 200 / 400 / 403 | `cap:site.manage` | 改开关/提供商/密钥；外部提供商启用时缺 Site Key 或 Secret **400**；空串清除 Secret |

关键不变量：

1. **开关默认值随环境翻转**：`captchaEnabled` 缺行时取 `isProduction`——生产默认**开**、
   开发/测试默认**关**。因此前端必须能在"未启用"时完全隐藏组件。
2. **令牌在凭据校验之前消耗**：`auth.instance.ts` 的 better-auth `before` 钩子调用
   `consumeToken`，所以**密码错误同样会烧掉令牌**，登录页失败后必须重新出题。
3. **单次使用 + HMAC + TTL**：令牌形如 `id.expires.签名`，签名不符/过期/重放分别给出可区分的
   中文原因；`captcha_challenge.token_used_at` 一旦写入即失效。
4. **启动器（Yggdrasil）路径豁免**：`/api/authserver/*` 不经 `sign-in/email`，不受验证码影响。
5. **与防暴力破解叠加**：`main.ts` 的 `credentialLimiter` 对 `sign-in/email` 与
   `sign-up/email` 共享 10 次/60 秒/IP，超限 **429**（冒烟中实测触发过）。

#### 2.6.2 成长体系（`modules/growth`）

| 端点                                                         | 方法        | 成功码          | 门禁                 | 行为                                                                                                                            |
| ------------------------------------------------------------ | ----------- | --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/api/growth/overview`                                       | GET         | 200 / 403       | 登录                 | `{progress, shop, rules, titles, leaderboard, banners, latestTransactions, pendingTitleApplication}`                            |
| `/api/growth/transactions`                                   | GET         | 200             | 登录                 | 积分流水分页（`page`/`pageSize`≤50）                                                                                            |
| `/api/growth/checkin`                                        | POST        | 200 / 409       | 登录（10/min）       | 每日签到发经验与积分；同日重复 **409**                                                                                          |
| `/api/growth/purchase`                                       | POST        | 200 / 400 / 409 | 登录（10/min）       | `xp_boost` 顺延叠加、`cape_unlock` 一次性（重复 **409**）、`banner` 建 pending 申请                                             |
| `/api/growth/tips`                                           | POST        | 200 / 400       | 登录（20/min）       | 打赏；自打赏与超出 `tipMin/tipMax` **400**                                                                                      |
| `/api/growth/title-applications`                             | POST        | 200 / 403       | 登录（5/min）        | 低于 `titleApplicationLevel` **403**                                                                                            |
| `/api/growth/leaderboard`                                    | GET         | 200             | 公开                 | 等级榜（1–50），**特别称号持有者不参与**                                                                                        |
| `/api/growth/titles`、`/api/growth/banners`                  | GET         | 200             | 公开                 | 称号目录 / 首页展示期内的已批准 Banner                                                                                          |
| `/api/admin/growth/titles`                                   | GET / POST  | 200 / 409       | `cap:titles.manage`  | 称号与申请总览 / 新建特别称号                                                                                                   |
| `/api/admin/growth/titles/{id}/grant`                        | POST        | 200 / 404 / 409 | `cap:titles.manage`  | 授予；重复授予 **409**，写通知与审计                                                                                            |
| `/api/admin/growth/titles/{id}/revoke`                       | POST        | 200             | `cap:titles.manage`  | 撤销，被撤销者立即回到等级体系                                                                                                  |
| `/api/admin/growth/title-applications/{id}/{approve,reject}` | POST        | 200             | `cap:titles.manage`  | 满级专属称号审批                                                                                                                |
| `/api/admin/growth/banners`                                  | GET         | 200             | `cap:banners.manage` | 按 `status` 过滤的 Banner 队列                                                                                                  |
| `/api/admin/growth/banners/{id}/{approve,reject}`            | POST        | 200             | `cap:banners.manage` | 驳回**自动退还积分**并通知提交者                                                                                                |
| `/api/admin/growth/users/{id}/points`                        | POST        | 200 / 400       | `cap:points.adjust`  | 正负调账，写 `point_transaction` 台账                                                                                           |
| `/api/admin/growth/rules`                                    | GET / PATCH | 200 / 400 / 403 | `cap:site.manage`    | 成长规则读写；PATCH 为**部分覆盖**，越界值 **400** 且不落库                                                                     |
| `/api/admin/growth/rules/reset`                              | POST        | 200             | `cap:site.manage`    | 删除覆盖行，恢复随代码发布的默认值                                                                                              |
| `/api/admin/site/permissions/{id}`                           | GET / PUT   | 200 / 403       | role:superadmin      | 读 / 整体替换某位员工的下放能力集合                                                                                             |
| `/api/site/home`                                             | GET         | 200             | 公开                 | `{content, banners}`，无覆盖行时回落内置默认首页                                                                                |
| `/api/admin/site`                                            | PATCH       | 200 / 400       | `cap:site.manage`    | `homeContent` 经 `homeContentSchema` 校验，非法 href / 超长 / 超条数 **400**；`customCss` 超 20 000 字符或含 `</style>` **400** |
| `/api/admin/site/icon`                                       | POST        | 200 / 400 / 403 | `cap:site.manage`    | multipart `file`（PNG/JPEG/WebP/GIF，≤1 MiB）；SHA-256 内容寻址存 `UPLOAD_DIR/site/`，非图片 **400**                            |
| `/api/admin/site/icon`                                       | DELETE      | 200 / 403       | `cap:site.manage`    | 清除图标，页头与标签页回落内置标志                                                                                              |
| `/api/site/icon/{filename}`                                  | GET         | 200 / 404       | 公开                 | 图标字节 + `Cache-Control: immutable`；文件名不符合 `<sha256>.<ext>` 或文件缺失 **404**                                         |

关键不变量：

1. **等级曲线固定线性**：`XP_PER_LEVEL=100`、`LEVEL_MAX=100`（10 000 XP 封顶），`LEVEL_TIERS`
   11 档（1-10 初来乍到 … 91-99 大佬 … 100 传说）在 `packages/shared` 内前后端共用，
   进度条无需二次请求。
2. **特别称号退出等级体系**：`kind='special'` 时 `awardXp` 返回 0、签到 `xpAwarded=0`
   （**积分照发**）、排行榜剔除、`progress.levelExempt=true`；`kind='custom'`（满级申请获得）
   仍在体系内。撤销称号后行为立即恢复，不需要迁移数据。
3. **规则是"默认值 + 单行覆盖"**：`site_setting.growthRules` 存合并后的完整 JSON，读取时缓存、
   写入时失效；坏 JSON 或校验失败一律回落默认，不会把站点打挂。
4. **积分只通过台账变动**：余额每次变化都追加 `point_transaction`（`amount`+`balance_after`），
   商店、打赏、调账、Banner 驳回退款走同一路径。
5. **披风门禁**：未用积分解锁时披风上传与切换被拒（403），皮肤不受影响。

## 3. HMCL/PCL2 契约联调记录

### 3.1 本轮（M0）实际执行情况

本开发环境为无图形界面的容器，且外网仅放通 npm registry 与部分 API，**无法运行 HMCL/PCL2 本体**。
因此 M0 阶段用 curl 对"启动器将实际请求"的端点做了契约级冒烟（下表），
真实启动器联调按 §3.3 步骤由人工在桌面环境补录。

curl 冒烟记录（2026-10-18，`node dist/main.js`，端口 8000）：

| 请求                                                                                                     | 结果                                               | 判定                  |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------- |
| `GET /health`                                                                                            | 200 `{"code":0,"data":{…"database":"up"}}`         | ✅ 统一封装/探活正确  |
| `GET /api/oauth/availability`                                                                            | 200 `{"available":true}`                           | ✅                    |
| `GET /api/oauth/entry?client_id=hmcl&redirect_uri=…&state=…`                                             | 200 HTML（query 回显）                             | ✅                    |
| `POST /api/oauth/authenticate {"code":"abc"}`                                                            | 501 `{"error":"NotImplementedException",…}`        | ✅ 原生错误形状       |
| `POST /api/oauth/refresh {"refresh_token":"abc"}`                                                        | 501 同上                                           | ✅                    |
| `POST /api/oauth/refresh {}`                                                                             | 400 `IllegalArgumentException`                     | ✅ 校验分流           |
| `GET /api/user/profiles/me`                                                                              | 501                                                | ✅                    |
| `POST /api/session/joinServer {}`                                                                        | 400（三字段缺失清单）                              | ✅                    |
| `POST /api/session/joinServer {accessToken,selectedProfile,serverId}`                                    | 501                                                | ✅                    |
| `GET/POST /api/session/hasJoined?username=…&serverId=…`                                                  | 501 / 400（缺参）                                  | ✅                    |
| `GET /api/profiles/minecraft/Steve`                                                                      | 501                                                | ✅                    |
| `POST /api/profiles/minecraft {"names":["Steve","Alex"]}`                                                | 501                                                | ✅                    |
| `GET /api/profiles/{32hex}`                                                                              | 501                                                | ✅                    |
| `GET/POST /api/minecraft/profile/skins`、`capes`                                                         | 501                                                | ✅                    |
| better-auth：`POST /api/auth/sign-up/email`、`sign-in/email`、`GET /api/auth/get-session`                | 200 + Cookie 会话（argon2id 入库）                 | ✅ M0 退出标准第 3 条 |
| better-auth：`POST /api/auth/request-password-reset`、`GET reset-password/:token`、`POST reset-password` | 200 → 302 `?token=` → 200（旧密码失效，见 §3.1.8） | ✅ M4 找回密码        |

### 3.1.1 M1 认证核心冒烟（2026-10-20）

环境：`node dist/main.js`，`DATABASE_URL=./data/m1-smoke.db`，端口 8000；curl 使用同一 Cookie jar，
浏览器端用 Next.js 16 dev（:3000）完整走通 UI 流程。

| 请求 / 场景                                                      | 结果                                              | 判定 |
| ---------------------------------------------------------------- | ------------------------------------------------- | ---- |
| `POST /api/auth/sign-up/email`                                   | 200 + Cookie 会话；`user.role=user`               | ✅   |
| `GET /api/user/profiles/me`（Cookie）                            | 200 `{user, player:null}`                         | ✅   |
| `GET /api/user/profiles/me`（无认证）                            | 401 `UnauthorizedException`                       | ✅   |
| `GET /api/oauth/entry`（无 Cookie）                              | 200 登录页 HTML（含“登录并继续”）                 | ✅   |
| `GET /api/oauth/entry`（Cookie + PKCE 参数）                     | 200 授权确认页 HTML（账号/参数/PKCE 隐藏字段）    | ✅   |
| `POST /api/oauth/entry`（Cookie + `Origin` + S256）              | 302 `redirect_uri?code=…&state=…`                 | ✅   |
| `POST /api/oauth/entry`（跨站 Origin）                           | 403 `ForbiddenOperationException`                 | ✅   |
| `POST /api/oauth/entry`（`ftp://` redirect_uri）                 | 400 `IllegalArgumentException`                    | ✅   |
| `POST /api/oauth/authenticate`（code + verifier）                | 200 `OAuthTokenResponse`；自动创建 player         | ✅   |
| 同一 code 二次使用                                               | 401 `UnauthorizedException`                       | ✅   |
| PKCE verifier 不匹配                                             | 401 `UnauthorizedException`（code 未被消耗）      | ✅   |
| `GET /api/user/profiles/me`（Bearer）                            | 200 `{user, player:{uuid,nickname,banned}}`       | ✅   |
| `POST /api/oauth/refresh`                                        | 200 新令牌对；旧 access/refresh 立即 401          | ✅   |
| `POST /api/oauth/refresh {}`                                     | 400 `IllegalArgumentException`                    | ✅   |
| `player.banned=1` 后 refresh                                     | 403 `ForbiddenOperationException`（令牌未被消耗） | ✅   |
| 浏览器：注册 → 生成 PKCE → 授权页 → 回调换令牌 → `/me` → refresh | 全部 UI 展示成功，player 自动创建                 | ✅   |

### 3.1.2 M2 会话/档案/纹理冒烟（2026-10-20）

环境：`node dist/main.js`，`DATABASE_URL=./data/m2-smoke.db`，`UPLOAD_DIR=./data/uploads-smoke`，
端口 8000；curl 使用同一 Cookie jar；浏览器使用 Next.js 16 生产构建（:3000）。

| 场景 / 请求                                                   | 结果                                                            | 判定                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| 管理员授权脚本 `admin:grant` + `get-session`                  | `role=admin`                                                    | ✅                                                    |
| 普通用户调用 `GET /api/admin/textures`                        | 403 `{code:10003}`（统一封装）                                  | ✅                                                    |
| `POST /api/admin/servers` / `GET` / `PATCH enabled=false`     | 200；secret 只返回一次；停用后 joinServer 403，恢复后可用       | ✅                                                    |
| `POST /api/session/joinServer`                                | 204；bad token 401；profile 不匹配 403；非法 UUID 400           | ✅                                                    |
| `GET                                                          | POST /api/session/hasJoined`（正确 IP）                         | 200 `GameProfile`；错误 IP/无会话 204；未知服务器 403 | ✅  |
| `GET /api/profiles/minecraft/{name}`、`/{uuid}`（含带连字符） | 200；不存在 204；非法 UUID 400                                  | ✅                                                    |
| `POST /api/profiles/minecraft`                                | 200 `GameProfile[]`，未知昵称跳过                               | ✅                                                    |
| 皮肤/披风 multipart 上传（Cookie / Bearer）                   | 200 `pending`；未登录 401                                       | ✅                                                    |
| 32×32 皮肤、伪 PNG、缺 `variant`                              | 400 `IllegalArgumentException`                                  | ✅                                                    |
| 1.5 MB 文件                                                   | 413，错误名 `IllegalArgumentException`                          | ✅                                                    |
| 管理员 approve / reject                                       | 200；active 唯一；rejected 不再下发；重复上传驳回文件回 pending | ✅                                                    |
| 签名纹理 URL                                                  | 200 `image/png`；篡改/过期 403；不存在的 id 404                 | ✅                                                    |
| `GameProfile.properties.textures`                             | base64 可解码；SLIM 带 `metadata.model=slim`；CAPE 存在         | ✅                                                    |
| 封禁：hasJoined / refresh / 上传                              | 403；解封后同一 refresh token 仍可成功（未被消耗）              | ✅                                                    |
| refresh 轮换                                                  | 旧 access 立即 401                                              | ✅                                                    |
| 浏览器：登录 → 形象面板 → 上传 → 审核后刷新                   | 当前皮肤/披风图片、INACTIVE 列表、pending 提示均正确            | ✅                                                    |
| 浏览器：授权页 → 回调 → `/me` → refresh                       | 授权确认、token 展示、player 展示、轮换成功                     | ✅                                                    |

### 3.1.3 M3/M4 论坛与账号冒烟（2026-10-20）

环境：`node dist/main.js`（`m3-smoke.db`，端口 8000）+ Next.js 生产构建（:3000）。
论坛/账号/管理端为非协议端点，验证统一封装与权限边界。

| 场景                                                            | 结果                                                                           | 判定 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---- |
| 首次启动种子版块                                                | 4 个默认版块；分类帖子数与最近活动正确                                         | ✅   |
| 用户发帖 / 管理员回帖 / 楼层自增                                | 200/201；Markdown 与 `@提及` 入库                                              | ✅   |
| 点赞切换（帖子与回复）                                          | 200；重复点赞取消；自赞 400                                                    | ✅   |
| 通知：回帖 / @提及 / 公告 / 审核                                | 未读数正确；单条与全部已读生效                                                 | ✅   |
| 举报：创建 / 重复 / 队列 / 处理                                 | 201/409/200；resolved 后 reporter 收到审核通知                                 | ✅   |
| 置顶 / 精华 / 锁定 / 隐藏 / 恢复 / 删除                         | 锁定后普通用户回复 403、版主可回；隐藏后游客 404、作者可见                     | ✅   |
| 回复隐藏/恢复                                                   | 公开详情不再出现；版主可看到 hidden 并恢复                                     | ✅   |
| 版块创建/修改/删除                                              | 200；空版块可删，有帖子/子版块时 409                                           | ✅   |
| 用户封禁/解封                                                   | 默认同时封论坛+游戏；封禁后发帖 403；解封恢复                                  | ✅   |
| 改名                                                            | 首次成功；30 天冷却 400；旧名 30 天保留期内他人使用 409                        | ✅   |
| 设备令牌（网页自助）                                            | 已移除：`/api/user/tokens` 不再提供，`token` 表仍由 OAuth/Yggdrasil 签发与轮换 | ➖   |
| 纹理切换                                                        | 已通过纹理互斥 active；公开主页/GameProfile 同步                               | ✅   |
| 帖子图片上传                                                    | PNG 200 + 内容寻址 URL；非图片 400；公开读取正确                               | ✅   |
| 管理统计                                                        | 用户/玩家/帖子/回复/举报/纹理/令牌/版块计数正确                                | ✅   |
| Web SSR                                                         | `/forum`、分类页、帖子页、个人主页、RSS、sitemap、robots 均 200                | ✅   |
| 浏览器：登录 → 论坛 → 回帖 → 通知 → 设置 → 改名/纹理 → 管理后台 | 全部 UI 操作成功；管理端建服务器返回一次性密钥                                 | ✅   |

### 3.1.4 论坛前端 UI/UX 优化验证（2026-10-23）

范围：`apps/web/components`（`post-list`、`reply-form`、`site-header`、`pagination`、`markdown-editor`、`toast`、`vote-button`、`quote-button`）及 `/forum`、`/forum/[slug]`、`/forum/post/[id]`、发帖/编辑页；后端 API 与 shared 契约未改动。

环境：Next.js 16.4.2 生产构建（:3000）+ `node apps/server/dist/main.js`（:8000，开发库）；`pnpm lint`、`pnpm --filter @mcserauth/web typecheck`、`pnpm --filter @mcserauth/web build` 全部通过。

| 检查项        | 结果                                                                                                     | 判定 |
| ------------- | -------------------------------------------------------------------------------------------------------- | ---- |
| 路由可用性    | `/forum`、`/forum/server-news`、`/forum/post/1`、`/forum/new`、`/users/:id` 均 200                       | ✅   |
| 列表视觉      | 作者头像加载 `avatarUrl` 图片；版块/置顶/精华徽章；移动端隐藏头像后标题、摘要、回复/点赞数据完整         | ✅   |
| 面包屑        | 首页/论坛/版块/主题层级正确，当前项 `aria-current="page"`，长标题省略并可读全量 `title`                  | ✅   |
| 发帖/回帖反馈 | 空内容禁用发布；发布中 spinner + `aria-busy`；成功 toast；新回复自动定位并短暂高亮                       | ✅   |
| 引用          | 引用 chip 显示作者/楼层/摘要；toast 与编辑器聚焦；取消引用会移除对应 Markdown 块                         | ✅   |
| 点赞          | 乐观更新 + `aria-pressed`/`aria-busy`；失败回滚并 toast；自赞 400 已提示                                 | ✅   |
| 用户菜单      | details/summary 可键盘操作；Escape 关闭并回焦；站内跳转后自动收起                                        | ✅   |
| 分页/越界     | 分页链接带 `aria-label`/`aria-current`；`?page=999` 显示越界空态与返回链接                               | ✅   |
| 加载态        | `/forum`、版块、帖子、发帖、编辑路由均有骨架屏（`loading.tsx`）                                          | ✅   |
| 移动端 390px  | 版块快捷横条可滑动；无横向溢出；侧栏位于正文之后；浮动回复/回顶按钮可用；头部登录/注册均显示             | ✅   |
| 无障碍        | skip link、焦点环、编辑 tab 方向键、表单错误 `role="alert"`、状态 `aria-live`、对话框 `aria-describedby` | ✅   |
| 临时数据清理  | 验证账号、回复与通知已从开发库删除；未改动业务数据                                                       | ✅   |

未验证项：真实移动设备触摸手势与屏幕阅读器朗读；IDE 内嵌浏览器视图不可见导致截图失败，改用 headless Chrome 1440×900 / 390×844 截图与 DOM 几何检查。

### 3.1.5 authlib-injector 兼容层冒烟（2026-10-24）

环境：`pnpm dev`（NestJS watch，:8000，开发库 `apps/server/data/mcserauth.db`），账号 `admin@mcserauth.dev`。
本环境无图形界面，**HMCL 本体未运行**；以下为启动器等价的 curl 结果（均断言 HTTP 状态码）。

| 请求                                                                                          | 结果                                                                                                           | 判定 |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| `GET /api`、`GET /api/`                                                                       | 200 `{meta:{serverName,implementationName,implementationVersion,links},skinDomains:["localhost","127.0.0.1"]}` | ✅   |
| `POST /api/authserver/authenticate`（正确密码，含 `agent`/`clientToken`/`requestUser`）       | 200 `accessToken`+`clientToken` 回显+`availableProfiles`+`selectedProfile`+`user`                              | ✅   |
| `POST /api/authserver/authenticate`（错误密码）                                               | 403 `{error:"ForbiddenOperationException",errorMessage:"Invalid credentials…"}`                                | ✅   |
| `POST /api/authserver/validate`（有效）                                                       | 204                                                                                                            | ✅   |
| `POST /api/sessionserver/session/minecraft/join`（`serverId=deadbeefcafe1234`，未登记白名单） | 204（白名单不生效）                                                                                            | ✅   |
| `GET /api/sessionserver/session/minecraft/hasJoined`（同哈希）                                | 200 `GameProfile` + `properties.textures`                                                                      | ✅   |
| 同上但 `serverId=unknownhash`                                                                 | 204                                                                                                            | ✅   |
| `GET /api/sessionserver/session/minecraft/profile/{uuid}`                                     | 200；非法 UUID 400 `IllegalArgumentException`                                                                  | ✅   |
| `POST /api/api/profiles/minecraft`（`["Admin","NobodyHere"]`）                                | 200，未知昵称跳过                                                                                              | ✅   |
| `POST /api/authserver/refresh`                                                                | 200 新 `accessToken`；旧 token `validate` 403                                                                  | ✅   |
| `POST /api/authserver/invalidate` → `validate`                                                | 204 → 403                                                                                                      | ✅   |
| 回归：原生 `POST /api/session/joinServer`／`GET /api/session/hasJoined` 用未登记 `serverId`   | 403 `ForbiddenOperationException`（白名单仍生效）                                                              | ✅   |

未验证：HMCL/PCL2 真机登录、authlib-injector 注入后的客户端与服务端握手（需桌面环境 + Paper 测试服）。

### 3.1.6 四级权限、超级后台与皮肤直接生效冒烟（2026-10-24）

环境：`node dist/main.js`（:8100，独立库 `./data/verify.db`，`CONSOLE_KEY` 已配置，
`UPLOAD_DIR=./data/uploads-verify`）；curl 均断言 HTTP 状态码。

| 场景 / 请求                                        | 结果                                                              | 判定 |
| -------------------------------------------------- | ----------------------------------------------------------------- | ---- |
| `GET /api/site`                                    | 200；默认展示配置                                                 | ✅   |
| `GET /api/console/session`（未登录）               | 200 `enabled=true, authenticated=false`                           | ✅   |
| `POST /api/console/login`（错误密钥 / 正确密钥）   | 401 / 200 + HttpOnly 签名 Cookie                                  | ✅   |
| `GET /api/console/settings`（无 Cookie）           | 401                                                               | ✅   |
| `PATCH /api/console/settings`（SMTP 密码）         | 200 `smtpPassSet=true`；库中为 `enc:v1:*` 密文                    | ✅   |
| 控制台将普通账号提升为 `superadmin`                | 200；`GET /api/admin/site` 从 403 变为 200                        | ✅   |
| 超级管理员修改站点展示信息                         | 200；公开 `GET /api/site` 立即反映新站名与公告                    | ✅   |
| 超级管理员调整成员为 `reviewer`                    | 200；该账号可读 `/api/admin/forum/stats`                          | ✅   |
| 审核员尝试封禁超级管理员 / 自己                    | 403                                                               | ✅   |
| 审核员禁言普通成员（1 小时）→ 发帖 → 解禁 → 再发帖 | 禁言期间 403；解禁后 201                                          | ✅   |
| 控制台将唯一超级管理员降级                         | 409“必须至少保留一名超级管理员”                                   | ✅   |
| 超级管理员在站点后台修改自己的角色                 | 403“不能修改自己的角色”                                           | ✅   |
| 上传 128×128 皮肤                                  | 400“仅原版尺寸，不支持高清纹理”                                   | ✅   |
| 上传 64×64 皮肤 / 64×32 披风                       | 200 `status=approved`；`GET skins` 中为 ACTIVE                    | ✅   |
| 签名纹理读取                                       | 签名 URL 200 `image/png`，篡改签名 403                            | ✅   |
| `DELETE /api/user/textures/{id}`（当前皮肤）       | 200 `{deleted:true}`；`skins` 为空，回退默认形象                  | ✅   |
| 浏览器 `/textures`（访客 / 登录）                  | 访客渲染默认皮肤；登录后渲染签名披风；无 CORS/WebGL/console error | ✅   |
| 浏览器 `/console` 密钥登录                         | “站点与发件”“角色管理”两个标签正常渲染                            | ✅   |

已验证：Chromium 中 skinview3d WebGL 实际渲染默认皮肤与签名披风纹理。
未验证：SMTP 实际投递（当前仅存储配置，未接入发件实现）。

### 3.1.7 M4.5 人机验证与成长体系冒烟（2026-10-25）

冒烟方式：独立 SQLite 冒烟库（`apps/server/data/captcha-smoke.db`、`growth-smoke.db`，
均先 `node scripts/migrate.mjs` 应用迁移 `0007_heavy_mother_askani`），
`node apps/server/dist/main.js` 以 `PORT=8010/8011/8012` 起进程，
`curl` + Node `fetch` 断言 **HTTP 状态码**（不看响应体定论）。

**人机验证链路（14/14 通过）**

| 断言                                                                 | 结果                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/captcha/config`（开启后）→ `enabled=true provider=builtin` | 200                                                      |
| 无 `x-captcha-token` 直接 `POST /api/auth/sign-up/email`             | 400 `请先完成人机验证`                                   |
| `GET /api/captcha/challenge` 取 SVG 算术题                           | 200                                                      |
| 提交错误答案                                                         | 400 `验证码不正确`                                       |
| 提交正确答案                                                         | 200（签发三段式令牌）                                    |
| 同一 challenge 二次校验                                              | 400 `验证码已使用，请刷新`                               |
| 带有效令牌注册                                                       | **200**（关键：证明不会锁死登录）                        |
| 同一令牌重放登录                                                     | 400 `人机验证已使用，请重新验证`                         |
| 令牌 + 错误密码                                                      | 401，随后同令牌再试已失效 400                            |
| 启动器授权页 `GET /api/oauth/entry`                                  | 200，内嵌 `captcha-box` 且脚本请求 `/api/captcha/config` |
| 凭证端点突发请求                                                     | 429（`credentialLimiter` 10 次/60 秒生效）               |

**成长体系链路（19/19 通过）**

| 断言                                                      | 结果                             |
| --------------------------------------------------------- | -------------------------------- |
| `GET /api/growth/overview` 暴露 `rules`/`shop` 动态价格   | 通过                             |
| `POST /api/growth/checkin` 按默认规则发 10 经验 + 10 积分 | 通过                             |
| 非管理员 `PATCH /api/admin/growth/rules`                  | 403                              |
| 超管部分覆盖 `{checkinBaseXp:50, replyXp:0}`              | 200，未提及键仍为默认            |
| 越界值 `titleApplicationLevel:999`                        | 400，且不落库                    |
| 改规则后新签到                                            | 50 经验（即时生效）              |
| `POST /api/admin/growth/rules/reset`                      | 200，回默认且 `customized=false` |
| 授予 `赞助商`（special）后 `levelExempt`                  | true                             |
| 免等级持有者签到                                          | `xpAwarded=0`、积分照发          |
| 免等级持有者从 `/api/growth/leaderboard` 消失             | 通过（其他人仍在榜）             |
| `custom` 称号持有者仍参与等级、仍可获得经验               | 通过                             |

**单元测试**：新增 `progress.service`（31 例）、`site.service`（17 例）、
`captcha.service`（16 例）、`admin-access.service`（10 例）四组；
`pnpm --filter @mcserauth/server test` 由 5 文件 17 例增至 **9 文件 91 例全绿**
（临时文件 SQLite + 直接实例化 service，不起 Nest 容器）。

**契约文档**：`pnpm openapi:export` 后 `docs/openapi.json` 新增 25 条 M4.5 路径
（`/api/growth/*`、`/api/captcha/*`、`/api/admin/growth/*` 含 `rules`、
`/api/admin/site/{captcha,permissions/{id}}`、`/api/site/home`），
`check-openapi-refs.mjs` 校验 **125 个本地 `$ref` 全部可解析**。

**过程中修掉的两处真实缺陷**

1. `mergeGrowthRules()` 用完整 schema 校验"部分补丁"，导致任何省略键都报
   `invalid_type: undefined`，PATCH 规则直接 500 → 改用 `growthRulesPatchSchema`。
2. 前端 `api-client` 把人机验证管理端点写成 `/api/admin/captcha`，实际前缀是
   `/api/admin/site/captcha`（会 404）→ 已按导出的 OpenAPI 反向核对全部字面量路径。

**风险记录**：`captchaEnabled` 缺省时取 `isProduction`，即**生产环境默认开启验证码**。
在补齐 `x-captcha-token` 之前，生产站点的网页注册/登录会全部 400——本节第 1 条冒烟
（带令牌注册返回 200）正是这条回归的守卫。

### 3.1.8 找回密码链路冒烟（2026-10-25）

冒烟方式：独立 SQLite 冒烟库（`/tmp/pwreset-live/app.db`，先 `node scripts/migrate.mjs`），
`MAIL_PROVIDER=console` 取日志里的原始链接，`site_setting.captchaEnabled=true` 模拟生产缺省；
Node `fetch` 直接断言 HTTP 状态码与 `Location` 头，浏览器端用 Next.js 16 dev（:3000）走通 UI。

| 断言                                                           | 结果                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| `POST /api/auth/forget-password`（better-auth 1.7 前的旧路径） | **404**（本轮缺陷的成因，见下方说明）                   |
| `POST /api/auth/request-password-reset` 无 `x-captcha-token`   | 400 `请先完成人机验证`                                  |
| 带有效令牌的申请                                               | 200，`sendResetPassword` 收到 `/reset-password/<token>` |
| 未知邮箱的申请                                                 | 200 且不发件（防枚举）                                  |
| “重新发送”（换新令牌再发一次）                                 | 200                                                     |
| `GET` 邮件链接                                                 | 302 到 `<web>/reset-password?token=<token>`             |
| `POST /api/auth/reset-password`                                | 200 `{status:true}`，argon2id 重哈希入库                |
| 同一令牌二次提交                                               | 400 `INVALID_TOKEN`（一次性消费）                       |
| 旧密码登录 / 新密码登录                                        | 401 `INVALID_EMAIL_OR_PASSWORD` / 200                   |
| 重置后原网页会话                                               | 会话行清零（`revokeSessionsOnPasswordReset: true`）     |
| 令牌过期或伪造的邮件链接                                       | 302 到 `<web>/reset-password?error=INVALID_TOKEN`       |
| 重置端点突发请求                                               | 429（`credentialLimiter` 10 次/60 秒生效）              |

**修掉的缺陷**：better-auth 1.7.10 已把发信端点改名为 `POST /request-password-reset`
（`/forget-password` 仅存在于 email-otp 插件的废弃路径），而 `apps/web` 仍在请求旧路径，
点击「发送重置邮件」恒为 404；`auth.instance.ts` 的人机验证 `before` 钩子同样挂在死路径上，
导致生产环境的发信请求实际**不受验证码保护**（SMTP 中继可被当作免费发信器）。
两处路径已对齐，`/api/auth/request-password-reset` 与 `/api/auth/reset-password`
一并纳入 `credentialLimiter`，重置成功即吊销全部网页会话（启动器令牌不受影响）。

**单元测试**：新增 `test/password-reset.test.ts` 6 例，经 `auth.handler` 打真实 HTTP 路径，
覆盖端点改名回归、令牌一次性、会话吊销、防枚举与验证码门禁；
`pnpm --filter @mcserauth/server test` 由 9 文件 91 例增至 **10 文件 97 例全绿**。

### 3.1.9 F1 首轮真机联调：HMCL × 生产 VPS（2026-11-01）

```text
启动器/版本：HMCL（版本号待用户补录）
联调日期：2026-11-01
服务器地址：https://auth.example.com/api（生产：Debian 13 VPS / Caddy TLS / pm2 单进程 / SQLite）
操作步骤：
1) HMCL 设置 → 账户 → 外置登录，认证服务器填 https://auth.example.com/api；
2) 网站邮箱 + 密码登录 → 启动器显示昵称与 UUID；
3) 网站侧上传 64×64 classic 皮肤后，启动器/游戏内皮肤下发可见。
异常表现：无（登录与皮肤链路一次通过）。
结论：登录 + 皮肤链路通过；进服握手（Paper 侧 join/hasJoined）待补录。
```

服务端同期生产 curl 断言（同一 VPS 部署，全部以 HTTP 状态码 + 响应形状判定）：

| 断言                                                                              | 结果                                                                                       | 判定         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| `GET /api` 元数据                                                                 | 200，`meta`/`links`/`skinDomains`，无 `signaturePublickey`                                 | ✅           |
| `POST /api/authserver/authenticate`（正确密码 + `clientToken` + `requestUser`）   | 200，`accessToken` + `clientToken` 回显 + `availableProfiles` + `selectedProfile` + `user` | ✅           |
| 同上（错误密码）                                                                  | 403 `ForbiddenOperationException`（原生错误形状）                                          | ✅           |
| `POST validate`（有效 / 伪造 / refresh 后旧令牌 / invalidate 后令牌）             | 204 / **403** / **403** / **403**                                                          | ✅（修复后） |
| `POST refresh`                                                                    | 200 新令牌 + `clientToken` 回显；旧令牌立即失效                                            | ✅           |
| `POST invalidate`                                                                 | 204（幂等）                                                                                | ✅           |
| `GET /api/profiles/minecraft/{name}`、`GET /api/sessionserver/.../profile/{uuid}` | 200 `GameProfile`；未知昵称 204                                                            | ✅           |
| `POST /api/api/profiles/minecraft`（批量，`{"names":[…]}`）                       | 200 数组、未知昵称跳过；body 非法 400 `IllegalArgumentException`                           | ✅           |
| `POST /api/sessionserver/session/minecraft/join`（任意握手哈希）                  | 204；`hasJoined` 未加入 204、命中 200 + `properties.textures`                              | ✅           |
| `POST /api/minecraft/profile/skins`（multipart `file`+`variant`）                 | 200 `TextureUploadResponse`，签名 URL 公开可下载                                           | ✅           |
| 皮肤上传 → `sessionserver profile/{uuid}`                                         | `properties.textures` base64 可解码，`SKIN.url` 指向签名 URL                               | ✅           |
| 伪造令牌的 `hasJoined` 语义、错误形状                                             | `{error, errorMessage}`，无统一信封                                                        | ✅           |

**本轮发现并修复的缺陷**（commit `bb43208`，已部署生产并复验）：

`yggdrasil.controller.ts` 的 `validate()` 缺少 `await`——`YggdrasilService.validate()` 对无效令牌抛出的
`ForbiddenException` 在 204 响应发出后才被拒收，**任何令牌 validate 一律 204**，403 永远到不了启动器，
拒绝只以未处理 Promise 拒绝的形式打进 stderr。§3.1.5 的冒烟记录（"伪造令牌 → 403"）当时为真，
系后续重构引入回归且 e2e 未覆盖无效分支。修复：controller 改 `async` + `await`，并在
`yggdrasil.e2e.test.ts` 补无效令牌 403 断言作回归守卫（全套 25 文件 240 例全绿）。

### 3.2 启动器侧待记录信息（模板）

联调时请记录（每款启动器一段）：

```text
启动器/版本：
联调日期：
服务器地址：
操作步骤：
1) …
实际发出的请求（方法 + 完整 URL + 关键字段）：
收到响应（状态码 + 前 200 字符）：
异常表现（如有）：
结论：通过 / 需修订（附 checklist 对应条目）
```

重点关注（风险 #1 对冲点）：

1. 启动器打开认证入口时请求的 URL 与参数（`availability`/`entry`/OAuth 授权码流程 or Yggdrasil 直登）；
2. `hasJoined` 实际用的是 GET 还是 POST、字段完整列表；
3. 档案查询路径拼写（是否带 `/minecraft/` 前缀）；
4. 启动器对 501 的表现（应提示"服务端功能未实现"而非崩溃）。

### 3.3 HMCL / PCL2 手工联调步骤

1. 桌面环境启动 server（`pnpm dev` 或 `node apps/server/dist/main.js`），确认 `GET /health`。
2. 走原生 `/api/session/*` 链路时，先用管理员账号通过 `/api/admin/servers` 登记游戏服务器的 `serverId`，
   否则 joinServer/hasJoined 会按白名单返回 403；走 §2.5 的 `/api/sessionserver/*` 时不需要登记。
3. **HMCL**：设置 → 账户 → 添加账户 → 选择"外置登录"→ 服务器地址填 `http://localhost:8000/api`
   （API 根；用户名填网站邮箱、密码填网站密码；**不是** `/api/oauth/entry`）；按 §3.2 记录请求。
4. **PCL2**：设置 → 启动器 → 游戏账户 → 认证服务器填 `http://localhost:8000/api`；同法记录。
   PCL2 默认只接受 HTTPS，本地明文联调需手动放行或改用内网 HTTPS 域名。
5. 用 `docs/protocol-checklist.md` 差分：启动器实际字段 vs 本表暂定字段，逐项修订实现与 shared 类型。

## 4. 待核清单汇总（按优先级）

> 2026-11-01 首轮真机（§3.1.9）后更新：1–7 项已收敛或降级，8–10 项归产品决策；
> **F1 关闭前仅剩「Paper 侧进服握手真机补录」**（影响第 2/3 项的最终打勾）。

1. ~~**授权主流程形态**~~ **不阻塞（2026-10-24 已收敛）**：HMCL/PCL2 走 §2.5 `/authserver/*`
   密码直登（真机验证通过）；浏览器 OAuth 授权码 + PKCE 保留给自研启动器与网页演示。
2. **`serverId` 语义**：按双轨实现（原生白名单 / authlib-injector 任意握手哈希）。compat 层
   join→hasJoined 已在生产 curl 断言；**真机 Paper 握手补录后打勾**。
3. `hasJoined` 方法与字段：GET（`username`+`serverId`）+ 204/200/403 语义已在生产断言
   （未加入 204、命中 200 带 textures、白名单外原生接口 403）；`ip` 参数保持可选。
   **真机 Paper 握手补录后打勾**。
4. ✅ profiles 命名空间（2026-11-01）：`/api/profiles/minecraft/{name}`（204/200）、
   `/api/api/profiles/minecraft` 批量（未知昵称跳过）、`/sessionserver/.../profile/{uuid}`
   三处均已生产断言；非法 UUID 400。
5. ✅ 纹理字段（2026-11-01）：`state=ACTIVE/INACTIVE`、`variant=classic|slim`、签名 URL
   （TTL 300s，启动器每次拉 profile 自然刷新）经真机皮肤上传/下发验证。
6. ✅ multipart 上传（2026-11-01）：`file` + `variant` 字段名与 200 `TextureUploadResponse`
   真机通过。
7. ✅ `textures` 属性签名（2026-11-01）：元数据不含 `signaturePublickey`，authlib-injector
   在无公钥时不校验签名，HMCL 真机接受无签名 textures 属性；base64 结构可解码。
8. 令牌有效期定值（`expires_in` 30 天、可配）→ **产品决策**，协议层面 `expires_in` 字段已按
   OAuth 惯例返回；不再阻塞。
9. 首次授权自动创建 player 策略（昵称来源、冲突后缀）→ **产品决策**（策划案待确认项），
   实现行为已在 §2.1 记录。
10. `server_entry.secret` 用途 → **产品/运维决策**（当前仅哈希入库、不参与协议鉴权）；
    authlib-injector 兼容层不要求密钥，真机登录未受影响。

## 5. 变更记录

| 日期       | 变更                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-18 | M0 首版：13 个路径/15 个操作全部登记；curl 契约冒烟通过；`/docs/openapi.json` 同步产出                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-20 | M1 认证核心：实现 entry 登录/确认页、`POST entry`、authenticate（code+PKCE）、refresh 轮换、`/user/profiles/me` 双认证；新增 `oauth_code` 表与 M1 冒烟记录；session/profiles 仍为 501                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-20 | M2：实现 joinServer/hasJoined（GET+POST）、profiles 查询、皮肤/披风上传（sharp 校验 + pending 审核）、签名纹理 URL 与管理端白名单/审核接口；新增 `game_session` 表、skin 去重索引、`SESSION_JOIN_TTL_SECONDS`/`TEXTURE_URL_TTL_SECONDS`；更新 OpenAPI 与 M2 冒烟记录                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-20 | M3/M4：新增论坛（版块/帖子/回复/点赞/通知/举报/图片上传）、账号设置（资料/改名/设备令牌/纹理切换）、公开主页、管理后台（用户/内容/举报/版块/公告/纹理/服务器）、RSS/sitemap；`post.locked`、`notification.message`、回复楼层唯一索引；协议端点未改动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-24 | authlib-injector 兼容层（§2.5）：新增 `GET /api` 元数据、`/authserver/{authenticate,refresh,validate,invalidate}`、`/sessionserver/session/minecraft/{join,hasJoined,profile}`、`/api/api/profiles/*` 命名空间；`game_session.server_id` 去掉外键（迁移 `0004`）以承载握手哈希；原生 `/api/session/*` 仍强制白名单；更新 OpenAPI 与 §3.1.5 冒烟记录                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-24 | 四级权限（reviewer/admin/superadmin + 密钥超级后台）、禁言、站点展示/发件配置、皮肤上传即生效与 3D 预览、`site_setting` 表（迁移 `0006`）；更新 §3.1.6 冒烟记录                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-25 | M4.5 人机验证与社区成长体系（§2.6，策划案 6 阶段之外的扩展特性）：验证码三提供商（builtin/turnstile/hcaptcha）+ 一次性 HMAC 令牌接入网页登录与启动器授权页；`user_progress`/`daily_checkin`/`point_transaction`/`title`/`title_application`/`user_title`/`banner`/`captcha_challenge`/`user_permission` 九张表（迁移 `0007`）；100 级 11 档称号、特别称号退出等级体系、积分商店（翻倍卡/披风解锁/Banner）与打赏；首页内容改由 `site_setting.homeContent` 管理（`GET /api/site/home`）；超管能力下放到 `user_permission`；成长规则可由 `PATCH /api/admin/growth/rules` 覆盖；新增 4 组单元测试（74 例全绿）与 §3.1.7 冒烟记录，OpenAPI 增补 25 条路径                                                                                                                                                              |
| 2026-10-25 | 找回密码修复（§3.1.8，无迁移、无新表）：网页端申请端点由 better-auth 1.7 已废弃的 `/api/auth/forget-password` 改为 `/api/auth/request-password-reset`（原路径恒 404），人机验证 `before` 钩子同步挂载到真实路径；`emailAndPassword.revokeSessionsOnPasswordReset: true` 使重置吊销全部网页会话；`credentialLimiter` 覆盖两个重置端点；`/forgot-password` 已发送视图补上 `CaptchaField`（否则“重新发送”在生产环境必 400）；新增 `test/password-reset.test.ts`（6 例，10 文件 97 例全绿）                                                                                                                                                                                                                                                                                                                           |
| 2026-10-25 | 站点外观（超级面板）与设备令牌自助页下线：`site_setting` 新增 `siteIcon`/`customCss` 键（无迁移），新增 `POST /api/admin/site/icon` 与 `DELETE /api/admin/site/icon`、公开 `GET /api/site/icon/{filename}`，`PATCH /api/admin/site` 接受 `customCss`；根布局内联自定义 CSS 并输出 `icon`/`apple-icon` 链接，页头品牌改用同一张图；移除 `/api/user/tokens` 列表与吊销端点及 `/textures` 的启动器设备面板（`token` 表与授权流程不变）；OpenAPI 同步                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-01 | 2.0 F2/F6 文档同步（**协议端点与字段语义零改动**）：三库迁移基线按 ADR 0007 对齐为各一份 29 表 `0000`（旧 SQLite 12 版历史移除，上文各行中的迁移编号仅存于 git 历史）；真实 MySQL 8.0 / PostgreSQL 16 的迁移、测试与 `db:copy-data` 端到端在 CI 首次全绿（run 41162131163），T2/T3 关闭；§1 非协议端点清单按实际路由改写并标注 `/api/user/tokens` 已移除（恢复排期 F14）；策划案升 v1.3（D4 部分被 ADR 0006 推翻、A4 设备页状态、披风与游客浏览判为已实现）；README 删除「设置页展示最近使用」等失效描述。`docs/openapi.json` 重新导出为 **104 路径 / 123 操作**：补入 F5 的 `/health/live`、`/health/ready`，并修正导出脚本与 `main.ts` 的前缀排除表不一致（原会误登记为 `/api/health/*`，实测 404），两处改用同一份 `PREFIX_EXCLUDED_ROUTES`；协议分组本身未变。**§4 的 10 项待核仍未收敛，需真机启动器（F1）** |
| 2026-11-01 | **F1 首轮真机联调**（§3.1.9，生产 VPS `https://auth.example.com`）：HMCL 外置登录 + 皮肤下发真机通过；配套生产 curl 断言覆盖 authenticate/validate/refresh/invalidate/join/hasJoined/profiles/上传全链路。**发现并修复 `validate` 缺 `await` 缺陷**（commit `bb43208`，含 e2e 回归守卫）：无效令牌一律 204、403 到不了启动器，§3.1.5 记录系重构前真值。§4 据此收敛：1–7 项关闭或待 Paper 补录打勾，8–10 项归产品决策；**F1 仅剩进服握手（Paper 侧）真机补录**                                                                                                                                                                                                                                                                                                                                                     |
