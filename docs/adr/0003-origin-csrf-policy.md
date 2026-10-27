# ADR 0003：Cookie 写接口的 Origin 校验

- 状态：已采纳
- 日期：2026-10-24

## 背景

论坛、账号设置与管理端使用 better-auth Cookie 鉴权，写接口此前只依赖 `SameSite=Lax`，没有应用层 CSRF 防护。

## 决策

- 新增全局 `OriginGuard`：对 POST/PUT/PATCH/DELETE 校验 `Origin`（回退 `Referer`）是否属于 `APP_URL` / `AUTH_URL`。
- 协议控制器（`@ProtocolApi`）跳过校验，保持启动器/服务端调用兼容。
- 无 Origin 的请求：无会话 Cookie 时放行（curl/launcher）；生产环境携带会话 Cookie 时拒绝，开发环境放行便于调试。
- 授权确认页额外要求生产环境必须带 Origin。

## 影响

- 跨站浏览器写请求返回 403 `ORIGIN_BLOCKED`。
- 生产环境的 Cookie 自动化脚本需要显式发送 `Origin` 头。
