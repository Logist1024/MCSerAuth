# ADR 0005：四级权限与皮肤站直接生效

- 状态：已采纳
- 日期：2026-10-24

## 背景

原模型只有 `user / mod / admin` 三个角色，帖子和皮肤共用同一扇门；皮肤上传必须等待审核，
与“皮肤站上传即用”的产品预期不符。运营方还需要一个与网站账号分离、只靠密钥进入的
最高权限入口，用于配置发件邮箱和任命超级管理员。

## 决策

### 角色

- 枚举改为 `user / reviewer / admin / superadmin`，历史 `mod` 在迁移脚本中归一为
  `reviewer`；权限检查统一使用 `roleAtLeast`，不再逐处比较字符串。
- `reviewer`（审核员）：举报、帖子/回复审核、禁言普通成员。
- `admin`（管理员）：审核员全部权限 + 封禁/解封（默认论坛+游戏）。
- `superadmin`（超级管理员）：管理员全部权限 + 站点展示设置、版块、公告、服务器白名单、
  调整审核员/管理员角色；不能修改自己的角色，也不能改动其他超级管理员。
- 禁言是独立于封禁的 `user.muted_until` 时间戳，到期自动失效；封禁仍沿用
  `user.banned` + `player.banned`。

### 超级后台

- 访问 `/console`（可用 web 侧 `CONSOLE_PATH` 重写到自定义路径），使用 `CONSOLE_KEY`
  密钥登录；密钥不落库，直接与 env 常量时间比较。
- 会话是独立 HttpOnly Cookie，HMAC 签名并带过期时间，不依赖 better-auth。
- 超级后台可调整任意角色（含超级管理员），但不能移除最后一名超级管理员；可配置站点
  展示、发件方式、SMTP 参数与发件邮箱。SMTP 密码使用 `BETTER_AUTH_SECRET` 派生密钥
  AES-256-GCM 加密后存入 `site_setting`，接口只返回 `smtpPassSet`。
- 站点展示配置写入 `site_setting`，公开接口 `GET /api/site` 只暴露展示字段。

### 皮肤站

- 上传校验通过后直接 `approved + active`，同一 `(player, kind)` 的旧 active 自动置为
  INACTIVE；不再有 pending 前置审核，也不再有 pending 数量上限。
- 仅接受原版尺寸：皮肤 64×32 / 64×64，披风 64×32；高清纹理返回 400。
- 审核员可在 `/admin?tab=textures` 事后下架违规纹理；下架会取消 active，玩家回退默认形象。
- 新增删除自己的纹理；Web 端用 skinview3d 渲染 3D 预览。形象库仅本人可见，
  不提供公开最新形象列表，也不能切换或删除他人的纹理。

## 影响

- 旧 `mod` 账号升级后显示为审核员；`admin:grant` 支持
  `user / reviewer / admin / superadmin`，默认授予 `superadmin`。
- 版块/公告/服务器白名单从 `admin` 上移到 `superadmin`；管理员仍可封禁审核员与普通成员。
- 皮肤上传不再产生 pending 数据；`skin.status` 保留 `pending` 仅为兼容历史行。
- 超级后台密钥缺失时控制台整体禁用，不提供任何默认密钥。
