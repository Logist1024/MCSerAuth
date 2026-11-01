# ADR 0009：前端外观系统（主题模式 / 点缀色 / 图标风格）

- 状态：已采纳
- 日期：2026-11-01

## 背景

站点此前只有一套绿色偏灰的主题，深色模式完全跟随 `prefers-color-scheme`，用户无法手动
切换；论坛与游戏账号管理的 UI 也缺搜索/排序与档案式布局（同期 UI 迭代见 README 功能
清单）。主题切换需要一套不引入运行时依赖、且与 RSC 渲染模型兼容的机制。

## 决策

- **偏好只存浏览器**：主题模式（`light`/`dark`/`system`）、点缀色
  （`green`/`blue`/`purple`/`orange`/`pink`）、图标风格（`svg`/`emoji`）存 localStorage
  （key 前缀 `mcserauth:`），服务端不感知、不进 cookie。登录与否不影响外观。
- **data 属性驱动 CSS 变量**：偏好写在 `<html>` 的 `data-theme-mode` /
  `data-theme-color` / `data-icon-style` 上；`globals.css` 的 `:root` 定义浅色变量，
  深色与各点缀色按属性选择器覆盖。组件样式只允许引用 `--accent` 等语义 token，
  **禁止硬编码颜色**（版块 hue 等按 hue 生成的颜色除外，深色分支需成对维护）。
- **首帧内联脚本**：`app/layout.tsx` 在 body 顶部放一段阻塞式纯脚本，在水合前把
  localStorage 偏好写到 `<html>`，避免深色用户闪白；`<html>` 上加
  `suppressHydrationWarning` 抑制预期中的属性级水合警告。
- **system 模式的双选择器**：深色变量同时挂在 `[data-theme-mode='dark']` 与
  `@media (prefers-color-scheme: dark) { :root:not([data-theme-mode='light']) }` 两处，
  两块内容必须成对修改；显式深色走前者，`system` 与无 JS 回退走后者。
- **图标双渲染**：`components/icons.tsx` 的 `Icon` 同时渲染 SVG 与 emoji 两个子元素，
  由 `[data-icon-style]` 用 CSS 切换显隐。这样 `Icon` 保持纯函数组件，可在服务端组件
  中使用，无需 React context。新增图标时须同步补 `PATHS` 与 `EMOJI` 两张表。
- **切换 UI**：`components/appearance/appearance-menu.tsx` 页头弹层即时写 localStorage
  并更新 data 属性，不触发路由刷新；站点设置里的站长 `customCss` 注入层保持在文档
  最后，优先级仍高于内置主题。

## 影响

- 深色/点缀色的变量块存在成对重复（显式 dark 与 system 回退），修改主题时必须同步
  两处，否则 `system` 用户与手动深色用户看到不同结果。
- 新增点缀色需要补：浅色覆盖块、深色两个选择器块、`appearance-menu` 色点样式与
  `lib/appearance.ts` 的枚举。
- 无 JS 环境回退到服务端默认值（system/green/svg），功能不受影响。
