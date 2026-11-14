# 玩家体验优化（player-ux-improvements）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面向普通玩家，优化登录/注册/找回密码到日常使用的全链路体验：错误信息中文化、表单防呆与即时反馈、流程跳转不断裂、导航直达账号安全。

**Architecture:** 全部改动限定在 `apps/web`（Next.js 16 纯渲染层），不触碰服务端与数据库。复用已有的 `describeAuthError()` 中文映射基础设施扩展错误翻译；新增两个小型客户端组件（`PasswordInput`、`CopyButton`）与一个纯函数模块（`password-strength`），其余为既有组件的局部修改。

**Tech Stack:** Next.js 16 App Router（React 19）、自研 CSS 令牌体系（`app/styles/` 分片）、Vitest + jsdom + @testing-library（web 已配置）、pnpm 9 monorepo。

## Global Constraints

- 只改 `apps/web/**`；跨端类型只写在 `packages/shared`（本次无需改 shared）。
- TS 严格模式：`no-explicit-any` 为 error、`noUncheckedIndexedAccess`（索引访问返回 `T | undefined`）、`verbatimModuleSyntax`（类型导入必须 `import type`）。
- UI 文案一律简体中文；代码注释遵循现有英文注释风格。
- 提交遵循 Conventional Commits，主题行英文；husky + lint-staged 提交时自动跑 eslint --fix 与 prettier。
- 每个任务完成后本地四项全绿：`pnpm lint`、`pnpm format:check`、`pnpn typecheck`（正确命令为 `pnpm typecheck`）、`pnpm test`。
- `pnpm typecheck` 会先构建 shared，改完代码直接跑即可。
- 密码规则全站统一：最少 8 位、最多 128 位。
- 不改服务端 captcha 消费顺序（安全设计：token 在凭据校验前被消费），前端只做失败后的自动换题与文案安抚。

---

### Task 1: 认证错误信息中文化

**Files:**

- Modify: `apps/web/lib/auth-client.ts:173-197`（AUTH_CODE_MESSAGES 与 describeAuthError）
- Modify: `apps/web/components/login-form.tsx:96-119,129-141`（catch 分支接入 describeAuthError）
- Modify: `apps/web/components/forgot-password-form.tsx:28-29`（同上）
- Create: `apps/web/lib/auth-client.test.ts`

**Interfaces:**

- Consumes: 现有 `AuthClientError`（`message`、`status`、`code`）、现有 `describeAuthError(error: unknown): string`。
- Produces: 扩展后的 `describeAuthError`，新增映射：`INVALID_EMAIL_OR_PASSWORD → '邮箱或密码不正确'`、`USER_ALREADY_EXISTS → '该邮箱已被注册，试试直接登录'`、`INVALID_EMAIL → '邮箱格式不正确'`、`FAILED_TO_CREATE_USER → '注册暂时失败，请稍后再试'`、`USER_NOT_FOUND → '账号不存在，请先注册'`。后续任务直接调用，签名不变。

背景：登录/注册失败时 better-auth 返回英文 message（如 "Invalid email or password"），而 `reset-password-form.tsx:43` 与 `account-security.tsx:85` 已在用 `describeAuthError`，唯独最高频的登录/注册表单直接显示原始英文。服务端昵称校验（`auth.instance.ts:175-203`）返回的已是中文，会原样透传。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/lib/auth-client.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { AuthClientError, describeAuthError } from './auth-client';

describe('describeAuthError', () => {
  it('maps known better-auth codes to Chinese text', () => {
    expect(
      describeAuthError(
        new AuthClientError('Invalid email or password', 401, 'INVALID_EMAIL_OR_PASSWORD'),
      ),
    ).toBe('邮箱或密码不正确');
    expect(
      describeAuthError(new AuthClientError('User already exists', 400, 'USER_ALREADY_EXISTS')),
    ).toBe('该邮箱已被注册，试试直接登录');
    expect(
      describeAuthError(new AuthClientError('Failed to create user', 500, 'FAILED_TO_CREATE_USER')),
    ).toBe('注册暂时失败，请稍后再试');
  });

  it('falls back to English message matching when the code is unknown', () => {
    expect(describeAuthError(new AuthClientError('Invalid email or password', 401, ''))).toBe(
      '邮箱或密码不正确',
    );
    expect(describeAuthError(new AuthClientError('User already exists', 400, ''))).toBe(
      '该邮箱已被注册，试试直接登录',
    );
    expect(describeAuthError(new AuthClientError('Invalid email', 400, ''))).toBe('邮箱格式不正确');
  });

  it('passes server-side Chinese messages through unchanged', () => {
    expect(describeAuthError(new AuthClientError('该昵称已被其他账号使用', 400, ''))).toBe(
      '该昵称已被其他账号使用',
    );
  });

  it('keeps the existing code mappings intact', () => {
    expect(describeAuthError(new AuthClientError('x', 400, 'EMAIL_NOT_VERIFIED'))).toBe(
      '邮箱尚未验证，请先到邮箱打开验证链接',
    );
  });

  it('stringifies non-error values', () => {
    expect(describeAuthError('boom')).toBe('boom');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @mcserauth/web exec vitest run lib/auth-client.test.ts`
Expected: FAIL —— 新映射断言不匹配（当前返回英文原文）。

- [ ] **Step 3: 扩展 auth-client.ts 映射**

`apps/web/lib/auth-client.ts` 中替换 `AUTH_CODE_MESSAGES`（174-181 行）为：

```ts
/** better-auth machine codes → readable messages; unknown codes fall through. */
const AUTH_CODE_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: '当前密码不正确',
  INVALID_EMAIL_OR_PASSWORD: '邮箱或密码不正确',
  PASSWORD_TOO_SHORT: '新密码太短（至少 8 位）',
  PASSWORD_TOO_LONG: '新密码太长',
  USER_ALREADY_EXISTS: '该邮箱已被注册，试试直接登录',
  USER_NOT_FOUND: '账号不存在，请先注册',
  CREDENTIAL_ACCOUNT_NOT_FOUND: '该账号未设置密码登录',
  EMAIL_NOT_VERIFIED: '邮箱尚未验证，请先到邮箱打开验证链接',
  INVALID_TOKEN: '链接无效或已过期，请重新申请',
  INVALID_EMAIL: '邮箱格式不正确',
  FAILED_TO_CREATE_USER: '注册暂时失败，请稍后再试',
};
```

`describeAuthError`（183-197 行）在现有两条正则之后追加（保持函数签名不变）：

```ts
if (/invalid email or password/i.test(error.message)) {
  return '邮箱或密码不正确';
}
if (/user already exists/i.test(error.message)) {
  return '该邮箱已被注册，试试直接登录';
}
if (/invalid email\b/i.test(error.message)) {
  return '邮箱格式不正确';
}
if (/failed to create user/i.test(error.message)) {
  return '注册暂时失败，请稍后再试';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @mcserauth/web exec vitest run lib/auth-client.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 登录/找回密码表单接入**

`apps/web/components/login-form.tsx`：

- import 行加入 `describeAuthError`（与现有 `@/lib/auth-client` import 合并）。
- `submit` catch（96-98 行）：`setError(message)` 改为 `setError(describeAuthError(authError))`（删除对 `message` 局部变量的依赖）。
- `resend` catch（114-115 行）：`toast.error(...)` 改为 `toast.error(describeAuthError(authError))`。
- `switchAccount` catch（136-137 行）：`toast.error(...)` 改为 `toast.error(describeAuthError(authError))`。

`apps/web/components/forgot-password-form.tsx`：

- import 加入 `describeAuthError`。
- `send` catch（28-29 行）：`setError(...)` 改为 `setError(describeAuthError(authError))`。

- [ ] **Step 6: 全量校验**

Run: `pnpm --filter @mcserauth/web exec vitest run && pnpm typecheck`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/auth-client.ts apps/web/lib/auth-client.test.ts apps/web/components/login-form.tsx apps/web/components/forgot-password-form.tsx
git commit -m "feat(web): translate auth failures into friendly Chinese messages"
```

---

### Task 2: PasswordInput 组件（密码可见性切换）

**Files:**

- Modify: `apps/web/components/icons.tsx:3-42`（IconName 加 `eye`/`eyeOff`）与 `PATHS` 表
- Create: `apps/web/components/password-input.tsx`
- Modify: `apps/web/app/styles/05-community.css`（auth 区块后追加样式）
- Modify: `apps/web/components/login-form.tsx`（密码框替换为新组件）

**Interfaces:**

- Produces: `export default function PasswordInput(props: { id: string; value: string; onChange: (value: string) => void; autoComplete?: string; placeholder?: string; minLength?: number; maxLength?: number; required?: boolean; })`。任务 3 的确认密码框复用此组件。

- [ ] **Step 1: icons.tsx 增加 eye / eyeOff**

`IconName` 联合类型中 `'flag'` 之前插入 `| 'eye'`、`| 'eyeOff'`（保持字母序：eye 在 flag 前，eyeOff 紧随 eye）。`PATHS` 表对应位置插入（lucide 风格 stroke path，与现有图标一致）：

```tsx
  eye: (
    <>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.243" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </>
  ),
```

- [ ] **Step 2: 创建 password-input.tsx**

```tsx
'use client';

import { useState } from 'react';
import { Icon } from './icons';

/** Password input with a show/hide toggle; used across the auth forms. */
export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  maxLength,
  required,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="password-toggle"
        type="button"
        aria-label={visible ? '隐藏密码' : '显示密码'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} width={16} height={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 追加样式（05-community.css 末尾 auth 区块后）**

```css
.password-field {
  position: relative;
}

.password-field input {
  width: 100%;
  padding-right: 2.6rem;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 0.4rem;
  transform: translateY(-50%);
  display: inline-flex;
  padding: 0.35rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.password-toggle:hover {
  color: var(--fg-strong);
  background: var(--surface-strong);
}
```

执行时先检查 `.field input` 的既有 padding（在 `01-base.css`/`02-components.css` 中 grep `.field input`），保证 `padding-right` 与现有内边距协调、不与 `box-sizing` 冲突。

- [ ] **Step 4: login-form.tsx 接入**

import `PasswordInput`，将 263-275 行密码 `<div className="field">` 内的 `<input>` 替换为：

```tsx
<PasswordInput
  id="login-password"
  value={password}
  onChange={setPassword}
  minLength={8}
  maxLength={128}
  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
  placeholder={mode === 'signup' ? '至少 8 个字符' : '输入密码'}
  required
/>
```

- [ ] **Step 5: 校验**

Run: `pnpm --filter @mcserauth/web exec tsc --noEmit -p tsconfig.json 2>/dev/null || pnpm typecheck`
以 `pnpm typecheck` 为准（会先构建 shared），再跑 `pnpm lint`。
Expected: 无类型错误、无 lint 错误。

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/icons.tsx apps/web/components/password-input.tsx apps/web/app/styles/05-community.css apps/web/components/login-form.tsx
git commit -m "feat(web): add password visibility toggle to the auth form"
```

---

### Task 3: 注册防呆——确认密码、密码强度提示与即时反馈

**Files:**

- Create: `apps/web/lib/password-strength.ts`
- Create: `apps/web/lib/password-strength.test.ts`
- Modify: `apps/web/components/login-form.tsx`（确认密码字段、强度条、onChange 清错、提交校验）
- Modify: `apps/web/components/reset-password-form.tsx:99-108`（密码框补 `maxLength={128}`）
- Modify: `apps/web/app/styles/05-community.css`（强度条样式）

**Interfaces:**

- Consumes: Task 2 的 `PasswordInput`。
- Produces: `export interface PasswordStrength { score: 0 | 1 | 2 | 3; label: string }`、`export function passwordStrength(password: string): PasswordStrength`。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/lib/password-strength.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it('returns score 0 with empty label for empty input', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' });
  });

  it('scores short passwords as weak even with variety', () => {
    expect(passwordStrength('aB1!').score).toBe(0);
  });

  it('reaches score 1 at 8 chars', () => {
    expect(passwordStrength('abcdefgh').score).toBe(1);
  });

  it('reaches score 2 with length plus letter case mix', () => {
    expect(passwordStrength('Abcdefghijklm').score).toBe(2);
  });

  it('reaches score 3 with digits and symbols on a long mixed password', () => {
    expect(passwordStrength('Abcdefghij12!@').score).toBe(3);
  });

  it('always returns a non-empty label for non-empty input', () => {
    expect(passwordStrength('aB1!').label).not.toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @mcserauth/web exec vitest run lib/password-strength.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 password-strength.ts**

```ts
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3;
  label: string;
}

const LABELS = ['太短了', '还可以', '不错', '很棒'] as const;

/** Lightweight, non-blocking strength hint for the sign-up form. */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return { score: 0, label: '' };
  }
  let score: 0 | 1 | 2 | 3 = 0;
  if (password.length >= 8) {
    score = 1;
  }
  if (password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score = 2;
  }
  if (score === 2 && /\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) {
    score = 3;
  }
  return { score, label: LABELS[score] ?? '' };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @mcserauth/web exec vitest run lib/password-strength.test.ts`
Expected: PASS。

- [ ] **Step 5: login-form.tsx 注册防呆**

1. 新增 state：`const [confirm, setConfirm] = useState('');`
2. import：`import { passwordStrength } from '@/lib/password-strength';`
3. 提交校验（`submit` 开头，昵称校验之后）：

```ts
if (mode === 'signup' && password !== confirm) {
  setError('两次输入的密码不一致');
  return;
}
```

4. 密码字段之后（仅 signup 模式）插入确认密码字段与强度提示：

```tsx
{
  mode === 'signup' ? (
    <>
      <div className="field">
        <label htmlFor="login-confirm">再输入一次密码</label>
        <PasswordInput
          id="login-confirm"
          value={confirm}
          onChange={setConfirm}
          maxLength={128}
          autoComplete="new-password"
          placeholder="和上面保持一致"
          required
        />
        {confirm.length > 0 && confirm !== password ? (
          <p className="bad small">两次输入的密码不一致</p>
        ) : null}
      </div>
      {password.length > 0 ? (
        <div className="strength-meter" aria-live="polite">
          <div className="strength-bar" aria-hidden="true">
            {[1, 2, 3].map((segment) => (
              <span
                key={segment}
                className={`strength-segment${passwordStrength(password).score >= segment ? ' on' : ''}`}
              />
            ))}
          </div>
          <span className="strength-label small muted">{passwordStrength(password).label}</span>
        </div>
      ) : null}
    </>
  ) : null;
}
```

5. 即时清错：`name`/`email`/`password`/`confirm` 的 onChange 中追加 `setError(null);`（用户开始修改即清除旧报错；`unverifiedHint` 保留由切换模式清理）。用 `PasswordInput` 的 `onChange` 回调包装：`onChange={(value) => { setPassword(value); setError(null); }}`。
6. `switchMode` 中追加 `setConfirm('');`，防止切换模式后残留。
7. 昵称 onChange 同样追加 `setError(null);`。

- [ ] **Step 6: 强度条样式（05-community.css 末尾）**

```css
.strength-meter {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: -0.35rem;
}

.strength-bar {
  display: flex;
  flex: 1;
  gap: 3px;
}

.strength-segment {
  height: 3px;
  flex: 1;
  border-radius: 2px;
  background: var(--border);
}

.strength-segment.on {
  background: var(--accent);
}

.strength-label {
  flex: none;
}
```

- [ ] **Step 7: reset-password-form.tsx 补 maxLength**

99-108 行新密码 `<input>` 追加 `maxLength={128}`，与注册/修改密码一致。

- [ ] **Step 8: 校验**

Run: `pnpm --filter @mcserauth/web exec vitest run && pnpm typecheck && pnpm lint`
Expected: 全绿。

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/password-strength.ts apps/web/lib/password-strength.test.ts apps/web/components/login-form.tsx apps/web/components/reset-password-form.tsx apps/web/app/styles/05-community.css
git commit -m "feat(web): add sign-up confirm password, strength hint and live feedback"
```

---

### Task 4: 邮箱验证回调保留 next 跳转

**Files:**

- Modify: `apps/web/lib/auth-client.ts:102-146`（signUpWithEmail / resendVerificationEmail 加 nextPath）
- Modify: `apps/web/components/login-form.tsx`（调用处传 next）

**Interfaces:**

- Produces: `signUpWithEmail(input, captchaToken?, nextPath?)`、`resendVerificationEmail(email, nextPath?)` —— 第三参数可选，向后兼容。

背景：玩家从"需要登录的页面"（如点发帖按钮被带到 `/login?next=/forum/new`）走注册流程，验证邮件回调固定跳 `/login?verified=1`，`next` 丢失，验证成功后回不到原目标页。

- [ ] **Step 1: auth-client.ts 增加回调构造**

在 `signUpWithEmail` 上方新增私有 helper：

```ts
/** Verification mail lands back on /login; keep the original destination. */
function verificationCallbackURL(nextPath?: string): string {
  const url = new URL('/login', window.location.origin);
  url.searchParams.set('verified', '1');
  if (nextPath !== undefined && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
    url.searchParams.set('next', nextPath);
  }
  return url.toString();
}
```

`signUpWithEmail`（102-116 行）签名加 `nextPath?: string`，`callbackURL` 改为 `verificationCallbackURL(nextPath)`；`resendVerificationEmail`（138-146 行）同样加 `nextPath?: string` 并替换 `callbackURL`。

- [ ] **Step 2: login-form.tsx 传参**

- `signUpWithEmail({ ... }, captchaToken ?? undefined, next)`（77-79 行）
- `resend(to)` 改为 `resend(to: string, nextPath: string)`，内部调用 `resendVerificationEmail(to, nextPath)`；两处调用（pendingVerification 卡片 192 行、unverifiedHint 294 行）都传 `next`。

- [ ] **Step 3: 校验**

Run: `pnpm typecheck && pnpm lint`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/auth-client.ts apps/web/components/login-form.tsx
git commit -m "fix(web): preserve the next destination through email verification"
```

---

### Task 5: 重发验证邮件 60 秒冷却

**Files:**

- Modify: `apps/web/components/login-form.tsx`

**Interfaces:**

- Consumes: Task 4 的 `resend(to, nextPath)`。

背景：`pendingVerification` 卡片与 `unverifiedHint` 的重发按钮无冷却，服务端有频控但界面不提示，连点只收获报错。

- [ ] **Step 1: 冷却状态与计时器**

新增 state：`const [resendCooldown, setResendCooldown] = useState(0);`

新增 effect（放在现有 session effect 之后）：

```tsx
useEffect(() => {
  if (resendCooldown === 0) {
    return;
  }
  const timer = window.setTimeout(() => {
    setResendCooldown((current) => Math.max(0, current - 1));
  }, 1000);
  return () => window.clearTimeout(timer);
}, [resendCooldown]);
```

- [ ] **Step 2: resend 成功后启动冷却**

`resend` 的 try 成功分支追加 `setResendCooldown(60);`

- [ ] **Step 3: 两处重发按钮接入**

pendingVerification 卡片（188-195 行）与 unverifiedHint（290-297 行）的按钮：

- `disabled={busy || resendCooldown > 0}`
- 文案：`{busy ? '发送中…' : resendCooldown > 0 ? `重新发送（${resendCooldown}s）` : '重新发送验证邮件'}`

- [ ] **Step 4: 校验**

Run: `pnpm typecheck && pnpm lint`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/login-form.tsx
git commit -m "feat(web): cool down verification-mail resends for 60 seconds"
```

---

### Task 6: 通知页错误态区分"未登录"与"故障"

**Files:**

- Modify: `apps/web/app/notifications/page.tsx:76,88-95,275-285`

**Interfaces:**

- Consumes: 现有 `ApiError`（`apps/web/lib/api-client.ts` re-export，含 `status: number`）。

背景：任何加载错误（网络故障、500）都显示"去登录"按钮，误导玩家。

- [ ] **Step 1: error 状态改为结构化对象**

```ts
const [error, setError] = useState<{ message: string; unauthorized: boolean } | null>(null);
```

`load` 的 catch 改为：

```ts
      } catch (fetchError) {
        setData(null);
        setError({
          message: describeApiError(fetchError),
          unauthorized: fetchError instanceof ApiError && fetchError.status === 401,
        });
      } finally {
```

import 追加：`import { ApiError } from '@/lib/api-client';`（该文件已从 `@/lib/api-client` import 其他函数，合并进现有 import 语句）。

- [ ] **Step 2: 渲染分支**

275-285 行错误 EmptyState 改为：

```tsx
          ) : error !== null ? (
            <EmptyState
              icon="alert"
              tone="error"
              description={error.message}
              action={
                error.unauthorized ? (
                  <Link className="button primary" href="/login?next=%2Fnotifications">
                    去登录
                  </Link>
                ) : (
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => void load()}
                  >
                    重试
                  </button>
                )
              }
            />
          ) : filtered.length === 0 ? (
```

- [ ] **Step 3: 校验**

Run: `pnpm typecheck && pnpm lint`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/notifications/page.tsx
git commit -m "fix(web): distinguish sign-in required from load failures on notifications"
```

---

### Task 7: 用户菜单增加"账号与安全"直达入口

**Files:**

- Modify: `apps/web/components/site-header.tsx:318-329`（用户菜单）
- Modify: `apps/web/components/profile/account-security.tsx:19`（锚点）

背景：改密码/改邮箱藏在个人主页侧栏，导航无直达入口；玩家找不到"账号设置"。

- [ ] **Step 1: account-security.tsx 加锚点**

`<section className="side-card">` 改为 `<section className="side-card" id="security">`。

- [ ] **Step 2: site-header.tsx 用户菜单加链接**

"个人主页"链接（318-321 行）之后插入：

```tsx
<Link className="user-menu-item" href={`/users/${session.user.id}#security`}>
  <Icon name="settings" width={16} height={16} />
  账号与安全
</Link>
```

（`settings` 图标已存在于 `icons.tsx:36`。）

- [ ] **Step 3: 校验**

Run: `pnpm typecheck && pnpm lint`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/site-header.tsx apps/web/components/profile/account-security.tsx
git commit -m "feat(web): add account security shortcut to the user menu"
```

---

### Task 8: 移动端注册页卖点紧凑保留

**Files:**

- Modify: `apps/web/app/styles/10-responsive.css:43-45`

背景：`<68rem` 时 `.auth-points { display: none; }`，移动端注册页完全没有价值说明。

- [ ] **Step 1: 替换隐藏为紧凑两列**

```css
.auth-points {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem 0.9rem;
  margin-top: 0.9rem;
}

.auth-points li {
  font-size: 0.8rem;
}
```

- [ ] **Step 2: 校验**

Run: `pnpm format:check && pnpm lint`
Expected: 全绿（纯 CSS 改动，typecheck 不受影响，但跑一次 `pnpm typecheck` 确认无意外）。

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/styles/10-responsive.css
git commit -m "fix(web): keep sign-up selling points visible on mobile in compact form"
```

---

### Task 9: 个人主页 UUID 点击复制

**Files:**

- Create: `apps/web/components/copy-button.tsx
- Modify: `apps/web/app/users/[id]/page.tsx:90`
- Modify: `apps/web/app/styles/05-community.css`（按钮样式）

**Interfaces:**

- Produces: `export default function CopyButton({ value, label }: { value: string; label?: string })` —— 通用复制按钮，后续任何"复制原始值"场景可复用。

背景：公开主页直接展示 36 位 UUID 原文，视觉噪声大；玩家对 UUID 的唯一需求是复制给管理员/启动器排障。

- [ ] **Step 1: 创建 copy-button.tsx**

```tsx
'use client';

import { useState } from 'react';
import { Icon } from './icons';

/** Copies a raw value (UUID, server address…) on click; shows a check on success. */
export default function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      // Clipboard API unavailable (insecure context); fall back to showing the raw value.
    }
  }

  return (
    <button
      className="copy-button mono tiny-text"
      type="button"
      title={`点击复制：${value}`}
      onClick={() => void copy()}
    >
      <span>{label ?? value}</span>
      <Icon name={copied ? 'check' : 'link'} width={12} height={12} />
    </button>
  );
}
```

- [ ] **Step 2: users/[id]/page.tsx 替换 UUID 展示**

import `CopyButton`，90 行：

```tsx
<span className="mono tiny-text">{profile.player.uuid}</span>
```

改为：

```tsx
<CopyButton value={profile.player.uuid} label={`${profile.player.uuid.slice(0, 8)}…`} />
```

- [ ] **Step 3: 样式（05-community.css 末尾）**

```css
.copy-button {
  display: inline-flex;
  gap: 0.3rem;
  align-items: center;
  padding: 0.1rem 0.35rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: copy;
}

.copy-button:hover {
  color: var(--fg-strong);
  border-color: var(--accent);
}
```

- [ ] **Step 4: 校验**

Run: `pnpm typecheck && pnpm lint`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/copy-button.tsx apps/web/app/users/[id]/page.tsx apps/web/app/styles/05-community.css
git commit -m "feat(web): make profile UUID click-to-copy instead of raw text"
```

---

## 收尾验证（全部任务完成后）

- [ ] **全量四项**：`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
- [ ] **构建**：`pnpm build`（shared → server → web 全量构建通过）
- [ ] **手动冒烟**（可选，需要本地起 `pnpm dev` + 数据库）：注册 → 确认密码不一致提示 → 强度条 → 验证邮件重发冷却 → 登录错误中文化。

## 明确不做（超出本次范围）

- 不改服务端 captcha token 消费顺序（安全设计，前端已自动换题）。
- 不引入 react-hook-form / zod 全量重构表单（改动面大，收益边际）。
- 不动 `/console` 运维后台与 admin 组件。
- 不新增组件级渲染测试（CaptchaField/Next router mock 面大；纯函数已覆盖，符合 web 包现有测试惯例）。
