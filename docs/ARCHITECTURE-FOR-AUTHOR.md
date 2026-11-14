# 架构自述（写给作者本人）

> 第二人称、≤800 字。你写了这套代码但不一定还记得细节；这份文档是你回答
> issue 时的小抄。每句话都能在源码里核对（括号内是位置）。

## ① 一次启动器登录到进服，经过什么？

**登录**：HMCL 发 `POST /api/authserver/authenticate`（`apps/server/src/modules/auth/yggdrasil.controller.ts` 的 `authenticate`）→ `yggdrasil.service.ts` 的 `authenticate()`：先经 `verifyAccountPassword`（`account-password.ts:29`，argon2id）到 `account` 表的 credential 行验邮箱密码，再调 `ensurePlayerForUser`（`oauth.service.ts:457`）保证 `player` 表有 1:1 角色，然后签发令牌写进 `token` 表（只存 SHA-256），返回 accessToken + 档案。**进服**：客户端 `POST /api/sessionserver/session/minecraft/join`（`modules/session/yggdrasil-session.controller.ts`）→ `session.service.ts` 验令牌后写一行 `game_session`；Paper 调 `hasJoined` 兑换掉这行会话，拿到带 `textures` 的 GameProfile——纹理来自 `skin` 表的 active 行，签名 URL 由 `texture.service.ts` 生成。模块顺序：**auth → session → profiles**，表顺序：**account → player → token → game_session → skin**。

## ② 秘密都在哪、丢了会怎样？

- **密码**：`account` 表 credential 行，argon2id 哈希，明文从未落库。数据库泄露可被离线慢速爆破，应对是强制全员重置密码（better-auth 重置流程）。
- **启动器令牌**：`token` 表 `access_token_hash`（model.ts:263，SHA-256 + 唯一索引）。库里只有哈希，泄露数据库**还原不出**可用令牌；但应用在后台逐个吊销并轮换。
- **授权码**：`oauth_code` 表 `code_hash`（model.ts:287），SHA-256，单次使用、5 分钟过期。
- **SMTP 密码**：`site_setting` 表 AES 加密存储，**密钥就是 `BETTER_AUTH_SECRET`**（`mail.service.ts:73`）。换了 SECRET 旧密码解不开——启动日志会出现 "Stored SMTP password could not be decrypted"（mail.service.ts:75），去 `/console` 重填即可。

## ③ 你最该先读的 5 个文件

1. `apps/server/src/config/env.ts` —— 所有配置与生产强校验的唯一入口，环境问题先看它。
2. `apps/server/src/modules/auth/yggdrasil.controller.ts` —— 启动器侧全部端点的路径映射。
3. `apps/server/src/modules/auth/yggdrasil.service.ts` —— authenticate/refresh 真逻辑与令牌哈希落库。
4. `apps/server/src/modules/session/session.service.ts` —— joinServer/hasJoined 与 `game_session` 生命周期。
5. `apps/server/src/db/schema/model.ts` —— 31 张表的唯一事实来源，查表/改表从这里出发。

---

## 附：5 道你可能被问的 issue 与标准答案

1. **「登录为什么填邮箱不填角色名？」**——启动器走网站账号体系认证：`yggdrasil.service.ts:33` 注释写明 "Launchers authenticate with the website e-mail + password"，验的是 `account` 表 credential 行。
2. **「为什么皮肤没有签名 / 元数据没有 signaturePublickey？」**——这是有意为之：`yggdrasil.service.ts` 的 `metadata()` 注释 "No `signaturePublickey` is advertised"；依赖签名校验的第三方工具不适用，是已知限制而非 bug。
3. **「能不能限制只有我的服务器能握手 join？」**——`/api/sessionserver/*` 刻意不限：`yggdrasil-session.controller.ts:66,83` 传 `enforceServerWhitelist: false`（兼容 authlib-injector 生态）；要白名单请让客户端走原生 `/api/session/*`，那里 `session.service.ts` 的 `assertServerAllowed` 查 `server_entry` 表。
4. **「换密钥后邮件发不出去」**——见上②第 4 条：SMTP 密码用 `BETTER_AUTH_SECRET` 加密（`mail.service.ts:73`），轮换密钥后必须在 `/console` 重填发件配置（`docs/deploy.md` §7 也写了）。
5. **「4K 皮肤上传被拒」**——只支持原版尺寸：`texture.service.ts:34-37` 的 `ALLOWED_DIMENSIONS`（皮肤 64×32/64×64、披风 64×32）与 `assertValidPng`（报错文案含「不支持高清纹理」），体积上限 1 MiB（`texture.service.ts:31`）。
