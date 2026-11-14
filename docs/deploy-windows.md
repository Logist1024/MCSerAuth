# Windows / 宝塔服主部署指南

> 读者画像：Windows 常驻主机（家机房 / Windows Server 面板机），一台已备案域名，
> 会用 PowerShell 复制粘贴命令。目标是让 server(:8000) + web(:3000) 在本机跑起来，
> 并由 Caddy 反代到 443，最后给出 Paper 侧的接入参数。
>
> **诚实声明（先读）**：本仓库的部署 runbook（[`docs/deploy.md`](deploy.md)）以 Linux 为准。
> 下面所有 `pnpm` 层命令（`install` / `build` / `db:migrate` / `db:seed` / `admin:grant` /
> `db:backup`）与 Linux 完全一致，已在 Node 22 环境逐条实测通过；**Windows 特有步骤
> （MSI 安装、NSSM 服务注册、Caddy 服务化、.bat 启动脚本）受验证环境所限未在实机
> Windows 上跑过**，命令均来自 Node.js / NSSM / Caddy 官方文档，遇到问题请提 issue。
> 宝塔面板以 Linux 版为主，其 Windows 版更新长期停滞（官方安装包已下架）；如果你
> 装了宝塔 Windows 面板并习惯用它的「网站反向代理」，可以替代 §5 的 Caddy 完成
> 反代，但本文以 Caddy 为准（与仓库 [`deploy/Caddyfile`](../deploy/Caddyfile) 同源）。

## 0. 前置检查

- [ ] 一个已备案域名，两条 A 记录（如 `mcserauth.example.com` 与 `auth.example.com`，
      或单域名方案见下文）都指向这台 Windows 机器的公网 IP；
- [ ] 443 与 80 端口在路由器/防火墙上已放行（生产强校验要求 HTTPS，见
      [`deploy.md`](deploy.md) §1）；**8000/3000 绝不能直接对公网开放**——
      反代是唯一入口；
- [ ] `APP_URL` 与 `AUTH_URL` 必须属于同一个注册域（例如 `example.com` +
      `auth.example.com`），否则 Cookie 跨站不带（详见 [`deploy.md`](deploy.md) §1）。

## 1. 安装 Node.js 22 与 pnpm

1. 下载并安装 [Node.js 22 LTS MSI](https://nodejs.org/en/download)（一路默认即可；
   建议勾选「Automatically install the necessary build tools」——万一 better-sqlite3
   没有匹配你 Node 版本的预编译包，需要它本地编译）。
2. 开一个新的 **PowerShell（管理员）**，验证版本并启用 pnpm：

   ```powershell
   node -v          # 应输出 v22.x
   corepack enable
   corepack prepare pnpm@9.15.9 --activate
   pnpm -v          # 应输出 9.15.9（版本由 package.json 的 packageManager 锁定）
   ```

## 2. 取代码、装依赖、构建

```powershell
cd C:\
mkdir mcserauth; cd mcserauth
git clone https://github.com/Logist1024/MCSerAuth.git app; cd app
pnpm install --frozen-lockfile
```

> 若 `pnpm install` 在 better-sqlite3 一步报错，先按第 1 步装好 Build Tools 再
> 重试；报错原文通常写明缺少 `node-gyp` 编译环境。

写环境变量（先写再构建，`NEXT_PUBLIC_*` 是构建期内联的，构建后改无效）：

```powershell
copy .env.example apps\server\.env
copy apps\web\.env.example apps\web\.env.local
notepad apps\server\.env          # 按 §4 编辑
notepad apps\web\.env.local
pnpm build                        # shared → server → web 全量构建
```

建库、迁移、种子数据（按 `DATABASE_URL` 自动选方言）：

```powershell
pnpm db:migrate                   # 默认在 apps\server\data\ 下创建 SQLite 库
pnpm db:seed                      # 可选：写入占位版块/站点设置
```

## 3. 注册第一个超级管理员

先临时前台跑起来（PowerShell 窗口 A）：

```powershell
pnpm dev                          # 本机联调用；生产常驻见 §6
```

浏览器打开 <http://localhost:3000> 注册账号（生产配置下需通过人机验证与邮箱验证——
`MAIL_PROVIDER=console` 时验证邮件只写进服务端日志，见 §4 第 5 条），然后新开
PowerShell 窗口 B：

```powershell
pnpm admin:grant you@example.com superadmin
```

## 4. 生产 `.env`（Windows 本机示例）

`apps/server/.env` 至少改成下面这样（逐项理由见 [`deploy.md`](deploy.md) §3）：

```ini
NODE_ENV=production
PORT=8000
COOKIE_SECURE=true
BETTER_AUTH_SECRET=<openssl rand -base64 48 的输出，或任意 ≥32 字符随机串>
APP_URL=https://mcserauth.example.com
AUTH_URL=https://auth.example.com
DATABASE_URL=./data/mcserauth.db
UPLOAD_DIR=./data/uploads
MAIL_PROVIDER=smtp
MAIL_FROM="MCSerAuth <noreply@example.com>"
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=noreply@example.com
SMTP_PASS=<邮箱服务商的授权码>
CONSOLE_KEY=<留空 = 禁用 /console；要开就填 ≥16 字符随机串>
```

`apps/web/.env.local`：

```ini
NEXT_PUBLIC_API_BASE_URL=https://auth.example.com
NEXT_PUBLIC_SITE_URL=https://mcserauth.example.com
```

Windows 注意事项：

- 相对路径 `./data/mcserauth.db`、`./data/uploads` 直接可用（Node 按
  `apps\server\` 工作目录解析）；想放到别盘就写绝对路径
  （`DATABASE_URL=D:\mcserauth-data\mcserauth.db`）。
- 生成随机串：PowerShell 里执行
  `[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))`
  亦可，不必非用 openssl。
- **`MAIL_PROVIDER=smtp` 必须显式设置**：只填 `SMTP_*` 参数不会切换发件方式，
  默认 `console` 只把邮件写进日志（这是最容易漏的一条，`mail.service.ts` 按这个
  字段决定走哪个 transport）。

改完 `.env` 后如果之前已经 `pnpm build` 过，需要重新 `pnpm build`（web 侧变量是
构建期内联的）。

## 5. Caddy 反代到 443

1. 从 [Caddy 下载页](https://caddyserver.com/download) 取 Windows amd64 版
   `caddy.exe`，放到 `C:\caddy\`。
2. 把仓库的 [`deploy/Caddyfile`](../deploy/Caddyfile) 复制为 `C:\caddy\Caddyfile`，
   将其中两个域名换成你的，单域名路径分派方案该文件末尾有现成注释段。
3. 验证并前台试跑（PowerShell 管理员）：

   ```powershell
   cd C:\caddy
   .\caddy.exe validate --config Caddyfile
   .\caddy.exe run --config Caddyfile
   ```

   DNS 已指向本机时，Caddy 自动向 Let's Encrypt 签发证书（首次会打印 ACME 交互）。

4. 注册为 Windows 服务（开机自启，[官方推荐写法](https://caddyserver.com/docs/running)）：

   ```powershell
   sc.exe create Caddy binPath= "C:\caddy\caddy.exe run --config C:\caddy\Caddyfile" start= auto
   sc.exe start Caddy
   ```

   （注意 `binPath=`、`start=` 的等号后面必须有空格，这是 `sc.exe` 的语法。）

## 6. 让 server / web 常驻（NSSM 注册两个服务）

仓库自带的 `deploy/ecosystem.config.cjs` 是 pm2 的 Linux 配置（日志路径写死
`/var/log/mcserauth`），**不要在 Windows 上直接用**。这里用
[NSSM](https://nssm.cc/download)（把任意程序注册成 Windows 服务的小工具）注册
两个服务，对应关系与 ecosystem.config.cjs 一致：

```powershell
# 解压 nssm.exe 到 C:\nssm\ 后（PowerShell 管理员）：
cd C:\mcserauth\app

# 服务 1：NestJS API（生产启动命令 = apps/server 的 pnpm start）
C:\nssm\nssm.exe install mcserauth-server "C:\Program Files\nodejs\node.exe" "dist\main.js"
C:\nssm\nssm.exe set mcserauth-server AppDirectory C:\mcserauth\app\apps\server
C:\nssm\nssm.exe set mcserauth-server AppEnvironmentExtra NODE_ENV=production

# 服务 2：Next.js web（生产启动命令 = apps/web 的 pnpm start，绑定回环）
C:\nssm\nssm.exe install mcserauth-web "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000"
C:\nssm\nssm.exe set mcserauth-web AppDirectory C:\mcserauth\app\apps\web
C:\nssm\nssm.exe set mcserauth-web AppEnvironmentExtra NODE_ENV=production

C:\nssm\nssm.exe start mcserauth-server
C:\nssm\nssm.exe start mcserauth-web
```

要点：

- **必须是单进程**（NSSM 默认就是一个，别改成多实例）：限流、验证码、进程内缓存
  都是内存态，多进程会破坏语义（[`deploy.md`](deploy.md) §7）。
- 两个服务都只被 Caddy 反代对外；Windows 防火墙入站规则里只放行 80/443/22(RDP)，
  不要放行 3000/8000。
- 日志：NSSM 默认不落盘，建议
  `C:\nssm\nssm.exe set mcserauth-server AppStdout C:\mcserauth\logs\server-out.log`
  （`AppStderr` 同理），或先用 `C:\nssm\nssm.exe restart mcserauth-server` 排查。

## 7. 冒烟

```powershell
curl.exe -s https://auth.example.com/health/ready   # 应含 "database":"up"
curl.exe -sI https://mcserauth.example.com          # 应看到 200 与 HSTS 头
```

浏览器：注册 → 登录 → 发帖 → `/textures` 上传皮肤（64×32 / 64×64 PNG，
披风需积分解锁）。

## 8. Paper 侧接入（进服）

前提：客户端 **和** Paper 两侧都要注入 authlib-injector（本仓库不含 Paper 插件）。
authlib-injector 从
[GitHub Releases](https://github.com/yushijinhun/authlib-injector/releases)
或镜像 <https://authlib-injector.yushi.moe/> 下载，把 jar 放进 Paper 服务端目录。

1. `server.properties`：

   ```properties
   online-mode=false
   ```

2. 启动脚本 `start.bat`（与 paper jar 同目录；**URL 是 MCSerAuth 的 API 根**）：

   ```bat
   @echo off
   java -Xms2G -Xmx4G ^
     -javaagent:authlib-injector-1.2.8.jar=https://auth.example.com/api ^
     -jar paper-1.21.4.jar nogui
   pause
   ```

   - `authlib-injector-1.2.8.jar` 换成你实际下载的文件名；
   - 客户端与 Paper 必须指向**同一个 MCSerAuth 实例**（同一数据库）。Paper 与
     MCSerAuth 同机时，`-javaagent:authlib-injector-1.2.8.jar=http://127.0.0.1:8000/api`
     直连本机 API 也可用；但**玩家客户端注入的地址必须是玩家可达的公网地址**
     `https://auth.example.com/api`；
   - `-Xms` / `-Xmx` 按机器内存调整。

3. 玩家客户端：HMCL → 设置 → 账户 → 添加账户 → 「外置登录」，认证服务器填
   `https://auth.example.com/api`，用户名填**网站邮箱**；PCL2 在
   设置 → 启动器 → 游戏账户。图文步骤见 [`player-guide.md`](player-guide.md)。

## 9. 备份（Windows 侧）

`pnpm db:backup` 在 Windows 上同样可用（SQLite 分支走 better-sqlite3 备份 API，
不依赖外部命令；MySQL/PG 分支需要 `mysqldump.exe` / `pg_dump.exe` 在 PATH 里）：

```powershell
cd C:\mcserauth\app
pnpm db:backup -- --dry-run     # 先打印计划
pnpm db:backup                  # 产物在 apps\server\data\backups\
```

上传目录要单独备份：

```powershell
tar czf C:\mcserauth\backups\uploads-%DATE%.tar.gz -C apps\server data\uploads
```

再用 Windows 任务计划程序（`taskschd.msc`）把上述命令挂成每日任务即可，
对应 Linux 版的 [`deploy/backup.cron`](../deploy/backup.cron)。

## 10. 与 Linux runbook 的差异对照

| 事项          | Linux（[`deploy.md`](deploy.md)） | Windows（本文）                     |
| ------------- | --------------------------------- | ----------------------------------- |
| 进程守护      | pm2 + `pm2 startup`               | NSSM 注册两个服务                   |
| 反代/TLS      | Caddy（systemd）                  | Caddy（`sc.exe` 服务）              |
| 防火墙        | ufw 关 3000/8000                  | Windows 防火墙入站规则只放行 80/443 |
| 日志          | pm2 + logrotate                   | NSSM `AppStdout` 或任务计划清理     |
| 定时备份      | cron（`deploy/backup.cron`）      | 任务计划程序                        |
| `pnpm` 命令层 | 完全一致                          | 完全一致                            |
