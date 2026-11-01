# ADR 0008：HTTP e2e 测试层形态

- 状态：已采纳
- 日期：2026-11-01
- 关联：2.0 开发指南 F8、技术债 T4/T8、[ADR 0007](0007-migration-baseline-alignment.md)

## 背景

1.x 起测试只覆盖 service 层：`apps/server/test/` 全部直接 `new` 服务类或手造依赖，
从不经过 Nest 容器，更不经过 HTTP。supertest 已在 devDependencies 里装了数个版本而未被
import 过。T4 记录的风险是明确的：controller、守卫、过滤器、`AllExceptionsFilter` 的
envelope 分流、better-auth 裸 express 挂载与 CSP/限流中间件——这些「组装层」零覆盖，
任何装配顺序改动都可能静默破坏协议形状或安全基线。

2.0 开发指南 F8 预设的形态是「supertest + `@nestjs/testing` 起真实 Nest 应用、内存
SQLite、关闭外呼」，落 ADR 定稿。

## 决策

### 1. supertest + 共享真实启动工厂，不引入 `@nestjs/testing`

调查后否掉了指南里 `@nestjs/testing` 的预设：这个应用的全部 e2e 价值恰恰在
`main.ts` 的 express 装配链上（better-auth 必须先于 body parser 消费 raw body、
CSP nonce 按请求生成、双 express-rate-limit、`setGlobalPrefix` 排除健康探针）。
若测试用 `Test.createTestingModule` 另起一套并手动复刻这些中间件，等于把装配链
复制一份，必然漂移——测的不再是生产跑的东西。

因此把 `main.ts` 的装配原样抽成 `src/http/server.factory.ts` 的
`createServerApp()`：生产入口只调它 + `listen`；e2e 调它 + `app.init()`，对
`app.getHttpServer()` 跑 supertest。中间件顺序与生产逐字节一致，`main.ts` 与测试
没有第二份装配代码可漂移。

不用 `@nestjs/testing` 唯一损失是 `overrideProvider`。逐项检查后确认不需要：
`MAIL_PROVIDER` 默认 `console`（只打日志不外呼）；captcha 在 `NODE_ENV=test` 下
默认关闭；数据库走 `createTestContext()` 事先设好的 `DATABASE_URL`。将来若确需
替换 provider，再补 `@nestjs/testing` 也不迟——工厂已把装配收敛到一处。

### 2. 文件 SQLite，每测试文件一个应用实例

沿用 `test/helpers/db.ts` 的 `createTestContext()`（临时目录文件库 + WAL）而非
内存库：迁移时机、WAL 语义、路径 resolve 与生产行为一致，且该 helper 已验证过。
e2e 文件在 `beforeAll` 起一个 app、`afterAll` 关闭——起应用的代价摊到整条链路，
链路内步骤本来就要共享状态（同一用户发帖→回帖→被处置）。

### 3. 限流不关闭，用 `X-Forwarded-For` 隔离

服务开着 `trust proxy 1`，每个测试角色带独立 `X-Forwarded-For`，既让 10 次/分的
credential limiter 不串桶，又保证链路 6 能真实打满 429——关掉限流会让「限流永远
绿」成为盲区。

### 4. 归属与运行方式

e2e 文件放 `apps/server/test/e2e/*.e2e.test.ts`，vitest 现有 include 自动收录，
`test-databases` 矩阵经 `TEST_DATABASE_URL` 自动继承——论坛/Yggdrasil/纹理三条
链路在真实 MySQL/PG 上照跑，无需改 CI。

## 后果

- `main.ts` 不再是唯一装配点，但两处共用一个工厂，装配漂移问题结构性消失；
- e2e 直接依赖真实中间件行为，协议形状（`{error,errorMessage}` vs envelope）、
  429 语义、CSP 头都从「代码评审推断」变成「测试断言」；
- T8（better-auth 裸挂载）的决策注释落在工厂内，错误形状一致性由
  `protocol-shape.e2e.test.ts` 守住；
- 代价：e2e 比 service 测试慢（每文件一次完整启动），故只放六条核心链路而非全端点
  复制；超过 20s 默认超时的文件需 `vi.setConfig({ testTimeout })` 单独放宽。
