# ADR 0004：公共读取缓存策略

- 状态：已采纳
- 日期：2026-10-24

## 背景

论坛列表与版块树对所有访客相同，但此前统一 `no-store`，SSR 与浏览器都无法复用。

## 决策

- `/api/forum/categories`、`/api/forum/posts` 返回 `Cache-Control: public, max-age=15, stale-while-revalidate=30`。
- Next 的 `/forum`、`/forum/[slug]` 使用 `revalidate = 30`，通过无 Cookie 的 `publicApiFetch` 取数。
- RSS/sitemap 的上游 fetch 使用 300 秒缓存。
- 含查看者状态的页面（帖子详情、设置、后台、通知）保持 `no-store` / `dynamic`。

## 影响

- 公共页面最多延迟 30 秒看到新帖，换取更低的 API 与数据库压力。
- 任何带 Cookie 的读取都不得走公共缓存，避免登录态泄漏。
