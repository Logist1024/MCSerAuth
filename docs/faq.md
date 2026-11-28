# 故障排查（FAQ）

> 按「症状 → 原因 → 处理」组织。找不到你的问题？到
> [Issues](https://github.com/Logist1024/MCSerAuth/issues) 提交（附 `/health` 输出、
> 数据库方言与复现步骤）；漏洞请走 [`SECURITY.md`](../SECURITY.md) 的私密渠道。

## 启动阶段

**进程启动即退出，报 `COOKIE_SECURE` / `BETTER_AUTH_SECRET` 相关错误**

`NODE_ENV=production` 时启动强校验：`COOKIE_SECURE=true` 必填、
`BETTER_AUTH_SECRET` 不能用开发默认值（≥32 字符）、`APP_URL`/`AUTH_URL`
不能是回环地址（localhost / 127.0.0.1 / ::1 / 0.0.0.0）。全部在
`apps/server/.env` 里改，逐项清单见 [`deploy.md`](deploy.md) §3。

**`pnpm install` 在 better-sqlite3 一步失败**

原生模块需要编译环境：Linux 补 `apt install -y build-essential python3`；
Windows 安装 Node 时勾选「Automatically install the necessary build tools」。
详见 [`deploy.md`](deploy.md) §8。

**启动器（HMCL / PCL2 / Prism）拉取认证服务器元数据失败**

认证服务器地址必须填 **API 根**（形如 `https://auth.example.com/api`），
不是网站地址也不是 `/api/oauth/entry`。本地开发用
`http://localhost:8000/api`；PCL2 默认只接受 HTTPS（见下文）。

## 网页行为异常

**登录成功，但所有接口 401**

`APP_URL` 与 `AUTH_URL` 不在同一个注册域（例如 `APP_URL=example.com` 而
`AUTH_URL=auth.cn`）。better-auth 的会话 Cookie 是 `SameSite=Lax`，跨注册域
不带。两个 URL 必须同注册域（`example.com` + `auth.example.com` 即可），
见 [`deploy.md`](deploy.md) §1。

**写操作 403「缺少请求来源」**

OriginGuard 会拒绝「带网站会话 Cookie 但没有 `Origin`/`Referer` 头」的写请求
（CSRF 防护，生产环境生效）。浏览器正常使用不受影响；用 curl / 脚本做
Cookie 会话自动化时，显式加一个受信任的 `Origin` 头：

```bash
curl -b jar.txt -X POST https://auth.example.com/api/admin/servers \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://example.com' \
  -d '{"serverId":"survival-1","name":"生存服一区"}'
```

**玩家收不到验证邮件**

先检查 `MAIL_PROVIDER`：默认（或设为 `console`）时邮件**只写进服务端日志**，
不投递——只填 `SMTP_*` 参数不会切换发件方式。`console` 模式下验证链接可直接
从日志复制：

```bash
grep -A1 'mail:console' /var/log/mcserauth/server-out.log | tail -5
```

生产必须显式 `MAIL_PROVIDER=smtp`（或在 `/console` 后台把发件方式设为 SMTP），
见 [`deploy.md`](deploy.md) §3。

**注册后提示「邮箱尚未验证」，无法登录**

用 `MAIL_PROVIDER=console` 时按上一条从日志取验证链接；配置了 SMTP 却仍收不到
时，检查 `MAIL_FROM` 是否为发件服务商允许的地址、授权码是否正确，并看日志里
有无 `[mail:fallback]`（SMTP 投递失败会降级写日志，不会中断注册流程）。

**管理后台 `/admin` 进不去或菜单缺失**

后台按角色显示入口。用 `pnpm admin:grant <email> superadmin|admin|reviewer`
授予角色后再登录；个别面板还需对应的能力下放（超级管理员默认拥有全部），
见 [`features.md`](features.md) §5。

**邮箱验证链接打不开 / 指向 localhost**

生产环境 `APP_URL`/`AUTH_URL` 配了回环地址——这是启动强校验，正常情况下
起不来；如果你手动放行了校验，把这两个变量改成真实 https 地址即可。

## 纹理与游戏

**上传 4K / 高清皮肤被拒**

只支持原版尺寸：皮肤 64×32 / 64×64（classic/slim）、披风 64×32，≤ 1 MiB。
高清纹理不支持，直接拒绝——这是已知限制，不是 bug。

**披风上传 / 切换返回 403，皮肤正常**

披风功能需要先在成长中心用积分解锁（`/forum/growth` 商店），皮肤不受影响。

**启动器登录报「密码错误」，但网站能登录**

启动器的「用户名」填的是**网站邮箱**，不是游戏角色名；密码是网站密码。
忘记密码走网站登录页的「忘记密码」。

**进服报「无效会话 / 无效 token」**

进服需要**客户端和 Paper 两侧都注入** authlib-injector（Paper 侧
`online-mode=false` + `-javaagent:authlib-injector.jar=<认证地址>/api`），
两侧必须指向同一个 MCSerAuth 实例。本仓库不含 Paper 插件，接入参数见
[`deploy.md`](deploy.md) §2.3 与 [`deploy-windows.md`](deploy-windows.md) §8。

**PCL2 添加认证服务器被拒**

PCL2 默认只接受 HTTPS 认证地址；`http://` 地址会被拒。让服主按部署文档配好
TLS 再试。完整玩家侧步骤见 [`player-guide.md`](player-guide.md)。

**想吊销某台设备上的启动器登录**

网站侧没有设备管理页（已于 2026-10-25 移除）；在启动器内对该账户执行
「invalidate / 登出」，或由服务器管理员按 [`features.md`](features.md) §2
的会话语义处理。

## 数据库

**昵称 / 帖子里的 emoji 写入失败**

MySQL 建库时没有显式 `utf8mb4`。按 [`deploy.md`](deploy.md) §2.2 重建：
`CREATE DATABASE mcserauth CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
迁移只建表、不改已有库的字符集。

**SQLite 报 `database is locked`**

SQLite 是单连接单写者、写事务全局串行（且限流/缓存都在内存态，服务**只能单进程**）。
高并发写入场景切换 MySQL/PostgreSQL：改 `DATABASE_URL` → `pnpm db:migrate` →
`pnpm db:copy-data -- --truncate`，见 [`database.md`](database.md)。

**恢复备份后 `pnpm db:migrate` 开始应用大量迁移**

说明备份的迁移历史与当前仓库不一致（比如来自发布前的内部构建）。不要继续，
改走「新建空库 → `pnpm db:migrate` → `pnpm db:copy-data -- --truncate` 搬迁」，
见 [`deploy.md`](deploy.md) §5。

## 部署与运维

**pm2 开了 cluster / 多实例后，限流行为异常、验证码时灵时不灵**

限流、验证码令牌、进程内缓存都是**内存态**，只能单进程运行。pm2 保持
`exec_mode: 'fork'`、`instances: 1`（`deploy/ecosystem.config.cjs` 默认即如此），
Docker 不要扩副本。约束详情见 [`deploy.md`](deploy.md) §7。

**公网能直接访问 8000 / 3000 端口**

防火墙没关内网端口。进程监听全网卡，必须靠边界关闭：Linux
`sudo ufw deny 3000,8000/tcp`，Windows 防火墙入站规则只放行 80/443。
否则绕过 Caddy 的 TLS 与安全头直接暴露。

**接口变慢，怀疑慢查询**

`DbService` 对超过 200ms 的查询打 `warn`：

```bash
grep 'slow query' /var/log/mcserauth/server-out.log | tail -20
```

Windows（NSSM）查看 `C:\mcserauth\logs\server-out.log`。日志与轮转配置见
[`deploy.md`](deploy.md) §6。

**升级版本后行为异常**

升级路径：`git pull` → `pnpm install --frozen-lockfile` → `pnpm build` →
`pnpm db:migrate` → 重启进程 → 按 [`deploy.md`](deploy.md) §2.3 冒烟。
升级前先看 [`CHANGELOG.md`](../CHANGELOG.md) 的对应小节；迁移前先
`pnpm db:backup`。
