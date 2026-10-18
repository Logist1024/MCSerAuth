# Commons-Designs 协议对照 Checklist（M0 首版）

> 依据：《docs/项目策划案.md》2.2；M0 任务范围与结论见《docs/底座初步开发完成情况.md》
> 状态：**M0 首版**。本文是"服务端实现 ↔ 官方协议文档"的逐字段核对底稿；
> 所有标有 ⚠️ 的字段均为**待官方协议文档核对**的暂定值，核对完成后逐项打勾并删除告警。
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
| 状态码映射   | 400/422→IllegalArgument；401→Unauthorized；403→ForbiddenOperation；404→NotFound；501→NotImplemented；其余→Internal                                                 | ⚠️                |
| Content-Type | 请求 `application/json`（上传为 `multipart/form-data`）；响应 `application/json`，授权页为 `text/html`                                                             | —                 |
| 认证         | M0 不签发任何令牌；M1 起 OAuth 令牌与 better-auth 网站会话双轨（策划案 2.2.3）                                                                                     | —                 |
| UUID 形态    | 32 位小写十六进制、无连字符（`PROTOCOL_UUID_PATTERN`）                                                                                                             | ⚠️                |
| 基地址       | 本地 `http://localhost:8000`；上线后为认证域（env `AUTH_URL`，T2）                                                                                                 | —                 |

### 1.1 stub 语义

M0 期间：已具备最小合法返回的端点返回 200（availability / entry），其余业务端点
统一抛 `NotImplementedException` → **HTTP 501** + 上述错误形状；请求校验失败返回
**HTTP 400**。501 是刻意选择：启动器/工具可据此识别"服务存在但功能未实现"。

## 2. 端点对照表

图例：✅ M0 已冒烟（curl，2026-10-18）｜🧪 待启动器联调｜⚠️ 字段待核对｜🚧 M0 stub

### 2.1 账户与授权（OAuth 风格）

#### `GET /api/oauth/availability`

- M0 行为：🚧 恒返回 `available: true`（连通性检查点）✅
- 响应字段：

| 字段        | 类型    | M0 固定值 | 核对                           |
| ----------- | ------- | --------- | ------------------------------ |
| `available` | boolean | `true`    | ⚠️ 字段名/是否含更多信息待核对 |

- 状态码：200；配置错误才会出现 5xx（统一 501/500 错误形状先于业务）。
- 请求参数：无。

#### `GET /api/oauth/entry`

- M0 行为：🚧 返回中文占位授权页 HTML（`text/html`），把 query 原样回显用于核对启动器传参 ✅
- 请求参数（浏览器跳转 query，暂定 OAuth 风格）：

| 参数                                       | 类型                    | 必填 | 说明           | 核对                    |
| ------------------------------------------ | ----------------------- | ---- | -------------- | ----------------------- |
| `client_id`                                | string                  | 否   | 启动器标识     | ⚠️                      |
| `redirect_uri`                             | string                  | 否   | 回跳地址       | ⚠️                      |
| `response_type`                            | string                  | 否   | 授权类型       | ⚠️                      |
| `scope`                                    | string                  | 否   | 授权范围       | ⚠️                      |
| `state`                                    | string                  | 否   | 防 CSRF 透传值 | ⚠️                      |
| `code_challenge` / `code_challenge_method` | string (`S256`/`plain`) | 否   | PKCE           | ⚠️ 是否使用 PKCE 待核对 |

- 响应：`200` HTML。字段无关，页面文案在 M1 接网站登录态后替换（A3：由 NestJS 同源渲染）。
- 需核对：启动器是否要求该页以特定 query 跳回（`redirect_uri` + `code`/`state` 格式）。

#### `POST /api/oauth/authenticate`

- M0 行为：🚧 `501` `NotImplementedException` ✅
- 请求体（暂定，支持"授权码或令牌"两种输入二选一）：

| 字段            | 类型   | 必填              | 核对                |
| --------------- | ------ | ----------------- | ------------------- |
| `code`          | string | 与 `token` 二选一 | ⚠️ 主流程究竟用哪种 |
| `token`         | string | 同上              | ⚠️                  |
| `client_id`     | string | 否                | ⚠️                  |
| `redirect_uri`  | string | 否                | ⚠️                  |
| `code_verifier` | string | 否（PKCE）        | ⚠️                  |

- 请求校验失败：`400` `IllegalArgumentException`（字段全可选，仅在类型不符时触发）。
- M1 目标响应（`OAuthTokenResponse`）：

| 字段            | 类型                             | 核对                              |
| --------------- | -------------------------------- | --------------------------------- |
| `access_token`  | string                           | ⚠️ 命名风格（snake_case）待核对   |
| `token_type`    | string（暂定 `Bearer`）          | ⚠️                                |
| `expires_in`    | number（秒，暂定 2592000=30 天） | ⚠️ 有效期定值待策划确认           |
| `refresh_token` | string                           | ⚠️ 是否在 authenticate 阶段即返回 |
| `scope`         | string                           | 否                                | ⚠️                   |
| `user`          | object `{id,email,name,role}`    | 否                                | ⚠️ 是否携带/字段构成 |

- M1 目标状态码：200 成功；400 参数非法；401 授权码/令牌无效；403 账号封禁。

#### `POST /api/oauth/refresh`

- M0 行为：🚧 `501` ✅
- 请求体：`refresh_token`（string，必填）+ `client_id`（可选）→ 缺失时 `400` `IllegalArgumentException` ✅
- M1 目标响应：同 `OAuthTokenResponse`；状态码 200 / 400 / 401。

#### `GET /api/user/profiles/me`

- M0 行为：🚧 `501`（未登录也不提前 401，保证 M0 形状单一）✅
- M1 目标响应（暂定）：

```jsonc
{
  "user":   { "id": "...", "email": "...", "name": "...", "role": "user|mod|admin" },
  "player": { "uuid": "…32hex…", "nickname": "...", "banned": false } | null
}
```

- M1 目标状态码：200；401 无有效令牌。⚠️ 整体结构与 `player` 可空性待核对。

### 2.2 Minecraft 会话服务（服务器调用）

#### `POST /api/session/joinServer`

- M0 行为：🚧 `501` ✅
- 请求体（Yggdrasil 命名，暂定）：

| 字段              | 类型   | 说明                                          | 核对                |
| ----------------- | ------ | --------------------------------------------- | ------------------- |
| `accessToken`     | string | 启动器访问令牌                                | ⚠️ 大小写/携带方式  |
| `selectedProfile` | string | 玩家 UUID（32 位无连字符）                    | ⚠️ 是否允许带连字符 |
| `serverId`        | string | 服务器注册 ID（须在 `server_entry` 白名单内） | ⚠️                  |

- M0 校验：三字段必填，否则 `400` `IllegalArgumentException` ✅
- M1 目标：204 成功（Yggdrasil 惯例，无响应体）；400/401/403（令牌无效/服务器未白名单）。

#### `POST /api/session/hasJoined` 与 `GET /api/session/hasJoined`

- 说明：本仓库**同时登记两种变体**——
  - `GET`：authlib-injector 生态惯用的查询变体（query 参数）；
  - `POST`：M0 端点清单中登记的变体（JSON body，字段同上）。
  - ⚠️ 官方协议采用哪种（或两者都要）必须在核对时确认；若只保留一种，删除另一种即可（两种变体共用
    同一 DTO 与 M1 实现）。
- M0 行为：🚧 均为 `501` ✅（`POST` 带 JSON body）
- 参数（query 或 body）：

| 字段       | 类型   | 必填 | 说明                    | 核对             |
| ---------- | ------ | ---- | ----------------------- | ---------------- |
| `username` | string | 是   | 待校验昵称              | ⚠️ 是否应传 UUID |
| `serverId` | string | 是   | 服务器 ID，用于匹配会话 | ⚠️               |
| `ip`       | string | 否   | 调用方 IP，防"复制会话" | ⚠️ 是否要求      |

- M0 校验：`username`/`serverId` 必填，否则 `400` ✅
- M1 目标：200 + `GameProfile`（含 `properties`，皮肤纹理走 `textures` 属性）；无会话时 204；
  封禁走 `ForbiddenOperationException`（策划案 2.2.3 判定：`player.banned` 拦在 hasJoined）。
- `GameProfile` 形状：

| 字段             | 类型                            | 说明                         | 核对            |
| ---------------- | ------------------------------- | ---------------------------- | --------------- |
| `id`             | string                          | 32hex UUID                   | ⚠️              |
| `name`           | string                          | 昵称                         | ⚠️              |
| `properties`     | array `{name,value,signature?}` | 纹理等，`textures` 为 base64 | ⚠️ 签名是否必需 |
| `profileActions` | string[]                        | 可选（生态扩展）             | ⚠️              |

### 2.3 玩家档案与形象资产

| 端点                                 | M0 行为                       | M2 目标                                               | 核对要点                                                  |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `GET /api/profiles/minecraft/{name}` | 🚧 501 ✅                     | 200 `GameProfile`；无此玩家时目标码待定（204 或 404） | 单查接口是否官方存在                                      |
| `POST /api/profiles/minecraft`       | 🚧 501 ✅；body 校验 `400` ✅ | 200 `GameProfile[]`（可能为空数组）                   | ⚠️ 请求是 `{"names":[…]}` 还是裸数组；批量上限（暂定 10） |
| `GET /api/profiles/{uuid}`           | 🚧 501 ✅                     | 200 `GameProfile`（含 textures 属性）                 | ⚠️ 与 `/minecraft/profile/{uuid}` 的关系                  |
| `GET /api/minecraft/profile/skins`   | 🚧 501 ✅                     | 200 `MinecraftProfileResponse`                        | ⚠️ 是否要求登录、返回全部皮肤还是当前                     |
| `POST /api/minecraft/profile/skins`  | 🚧 501 ✅                     | 200/204 上传成功；待审状态如何表达                    | ⚠️ multipart 字段名（暂定 `file` + `variant`）、响应形状  |
| `GET /api/minecraft/profile/capes`   | 🚧 501 ✅                     | 200 `MinecraftProfileResponse`                        | ⚠️ 同上                                                   |
| `POST /api/minecraft/profile/capes`  | 🚧 501 ✅                     | 200/204                                               | ⚠️ 字段名                                                 |

`MinecraftProfileResponse`（暂定，Marginalia 风格）：

```jsonc
{
  "id": "…32hex…",
  "name": "Nick",
  "skins": [
    {
      "id": "…",
      "state": "ACTIVE|INACTIVE",
      "url": "https://…",
      "variant": "CLASSIC|SLIM",
      "alias": "?",
    },
  ],
  "capes": [{ "id": "…", "state": "ACTIVE|INACTIVE", "url": "https://…", "alias": "?" }],
}
```

⚠️ 待核对：`state`/`variant` 大小写常量、`url` 是否为签名短时链接（策划案 2.2.2 决定`应用层签名 URL`）、
数组为空时是否省略字段。

## 3. HMCL/PCL2 契约联调记录

### 3.1 本轮（M0）实际执行情况

本开发环境为无图形界面的容器，且外网仅放通 npm registry 与部分 API，**无法运行 HMCL/PCL2 本体**。
因此 M0 阶段用 curl 对"启动器将实际请求"的端点做了契约级冒烟（下表），
真实启动器联调按 §3.3 步骤由人工在桌面环境补录。

curl 冒烟记录（2026-10-18，`node dist/main.js`，端口 8000）：

| 请求                                                                                      | 结果                                               | 判定                  |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------- |
| `GET /health`                                                                             | 200 `{"code":0,"data":{…"database":"up"}}`         | ✅ 统一封装/探活正确  |
| `GET /api/oauth/availability`                                                             | 200 `{"available":true}`                           | ✅                    |
| `GET /api/oauth/entry?client_id=hmcl&redirect_uri=…&state=…`                              | 200 HTML（query 回显）                             | ✅                    |
| `POST /api/oauth/authenticate {"code":"abc"}`                                             | 501 `{"error":"NotImplementedException",…}`        | ✅ 原生错误形状       |
| `POST /api/oauth/refresh {"refresh_token":"abc"}`                                         | 501 同上                                           | ✅                    |
| `POST /api/oauth/refresh {}`                                                              | 400 `IllegalArgumentException`                     | ✅ 校验分流           |
| `GET /api/user/profiles/me`                                                               | 501                                                | ✅                    |
| `POST /api/session/joinServer {}`                                                         | 400（三字段缺失清单）                              | ✅                    |
| `POST /api/session/joinServer {accessToken,selectedProfile,serverId}`                     | 501                                                | ✅                    |
| `GET                                                                                      | POST /api/session/hasJoined?username=…&serverId=…` | 501 / 400（缺参）     | ✅  |
| `GET /api/profiles/minecraft/Steve`                                                       | 501                                                | ✅                    |
| `POST /api/profiles/minecraft {"names":["Steve","Alex"]}`                                 | 501                                                | ✅                    |
| `GET /api/profiles/{32hex}`                                                               | 501                                                | ✅                    |
| `GET                                                                                      | POST /api/minecraft/profile/skins`、`capes`        | 501                   | ✅  |
| better-auth：`POST /api/auth/sign-up/email`、`sign-in/email`、`GET /api/auth/get-session` | 200 + Cookie 会话（argon2id 入库）                 | ✅ M0 退出标准第 3 条 |

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

### 3.3 HMCL / PCL2 手工联调步骤（M1 前补做）

1. 桌面环境启动 server（`pnpm dev` 或 `node apps/server/dist/main.js`），确认 `GET /health`。
2. **HMCL**：设置 → 账户 → 添加账户 → 选择"外置登录"→ 服务器地址填 `http://localhost:8000`
   （如要求完整 URL，试 `http://localhost:8000/api/oauth/entry`）；按 §3.2 记录请求。
3. **PCL2**：设置 → 启动器 → 游戏账户 → 认证服务器填 `http://localhost:8000`；同法记录。
4. 用 `docs/protocol-checklist.md` 差分：启动器实际字段 vs 本表暂定字段，逐项修订实现与 shared 类型。

## 4. 待核清单汇总（按优先级）

1. **授权主流程形态**：Commons-Designs 是 OAuth 授权码流程（entry → code → authenticate）还是 Yggdrasil 直登？
   决定 `oauth/*` 三个端点的存废与字段。← 风险最高
2. `hasJoined` 方法与字段（`username` vs UUID、`ip` 是否必传）。
3. profiles 命名空间：`/api/profiles/*` vs `/minecraft/profile/*` 各自职责与返回码（204/404）。
4. 纹理字段：`state`/`variant` 常量、签名 URL 要求、空数组省略规则。
5. multipart 上传字段名与成功响应形状。
6. 令牌响应字段与有效期（`expires_in`）定值。

## 5. 变更记录

| 日期       | 变更                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 2026-10-18 | M0 首版：13 个路径/15 个操作全部登记；curl 契约冒烟通过；`/docs/openapi.json` 同步产出 |
