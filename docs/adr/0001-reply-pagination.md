# ADR 0001：帖子回复分页

- 状态：已采纳
- 日期：2026-10-24

## 背景

`GET /api/forum/posts/:id` 原先一次返回全部回复，热帖会把整页回复装入 SSR 响应，内存与传输都不可控。

## 决策

- 详情接口新增 `replyPage` / `replyPageSize`（默认 1/20，上限 50）。
- 响应在保留 `replies` 的同时新增 `replyTotal`、`replyPage`、`replyPageSize`。
- `replies` 只包含当前页，`replyTotal` 是当前查看者可见的回复总数。
- Web 帖子页用 `?replyPage=N` 驱动分页；回复成功跳到最后页并定位新楼层。

## 影响

- 旧调用方忽略新字段即可保持兼容；`replies` 的语义从“全部”变为“当前页”，这是有意的行为变更。
- 新索引 `reply(post_id, status, floor)` 支撑分页查询。
