import type { OAuthEntryQuery } from '@mcserauth/shared';

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

export interface EntryPageContext {
  appUrl: string;
  query: OAuthEntryQuery;
}

export interface ConsentPageContext extends EntryPageContext {
  query: OAuthEntryQuery & { redirect_uri: string };
  account: { name: string; email: string };
  player: { nickname: string; uuid: string; banned: boolean } | null;
  redirectUriError?: string;
}

function styles(): string {
  return `
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, "Segoe UI", "Noto Sans SC", sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #0f172a; color: #e2e8f0; }
      main { width: min(36rem, calc(100vw - 3rem)); background: #1e293b; border: 1px solid #334155; border-radius: 1rem; padding: 2rem; box-shadow: 0 24px 60px rgb(0 0 0 / 0.35); }
      h1 { margin: 0 0 0.5rem; font-size: 1.35rem; }
      p { color: #94a3b8; line-height: 1.6; }
      a { color: #7dd3fc; }
      table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font-size: 0.85rem; }
      th, td { text-align: left; padding: 0.45rem 0; border-bottom: 1px solid #334155; vertical-align: top; word-break: break-all; }
      th { color: #94a3b8; font-weight: 500; width: 40%; }
      label { display: block; color: #cbd5e1; font-size: 0.85rem; margin-bottom: 0.35rem; }
      input { width: 100%; padding: 0.6rem 0.7rem; margin-bottom: 0.9rem; border-radius: 0.5rem; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font: inherit; }
      button { width: 100%; padding: 0.65rem 1rem; border-radius: 0.5rem; border: 0; background: #0ea5e9; color: #f8fafc; font: inherit; font-weight: 600; cursor: pointer; }
      button:disabled { opacity: 0.6; cursor: wait; }
      .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; background: #164e63; color: #a5f3fc; font-size: 0.75rem; margin-bottom: 1rem; }
      .error-box { border: 1px solid #7f1d1d; background: #450a0a; color: #fecaca; border-radius: 0.5rem; padding: 0.75rem 0.9rem; font-size: 0.85rem; margin: 1rem 0; }
      .account { border: 1px solid #334155; border-radius: 0.6rem; padding: 0.75rem 0.9rem; margin: 1rem 0; font-size: 0.9rem; }
      .account strong { color: #f8fafc; }
      .muted { color: #94a3b8; font-size: 0.8rem; }
      .captcha-box { border: 1px solid #334155; background: #0f172a; border-radius: 0.5rem; padding: 0.75rem 0.9rem; margin-bottom: 0.9rem; }
      .captcha-svg { display: block; margin-bottom: 0.5rem; }
      .captcha-row { display: flex; gap: 0.4rem; align-items: center; }
      .captcha-row input { margin-bottom: 0; flex: 1 1 5rem; min-width: 0; }
      .captcha-row button { width: auto; padding: 0.5rem 0.7rem; font-size: 0.8rem; background: #334155; }
      .captcha-status { margin: 0.5rem 0 0; font-size: 0.78rem; color: #94a3b8; min-height: 1rem; }
      .captcha-status.ok { color: #6ee7b7; }
      .captcha-status.bad { color: #fca5a5; }
      footer { color: #64748b; font-size: 0.75rem; margin-top: 1.5rem; }
  `;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MCSerAuth · ${escapeHtml(title)}</title>
    <style>${styles()}</style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

function parameterRows(query: OAuthEntryQuery): string {
  const rows: Array<[string, string | undefined]> = [
    ['client_id', query.client_id],
    ['redirect_uri', query.redirect_uri],
    ['response_type', query.response_type],
    ['scope', query.scope],
    ['state', query.state],
    ['code_challenge_method', query.code_challenge_method],
  ];

  return rows
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(
      ([name, value]) =>
        `<tr><th>${escapeHtml(name)}</th><td><code>${escapeHtml(value ?? '')}</code></td></tr>`,
    )
    .join('');
}

/**
 * Inline controller for the launcher consent login form.
 *
 * Kept as a plain string (no nested interpolation) because it is embedded into
 * the page template below. The captcha token is single-use and is consumed by
 * better-auth before credentials are checked, so a rejected sign-in has to
 * re-arm the challenge.
 */
const ENTRY_LOGIN_SCRIPT = String.raw`
        var form = document.getElementById('login-form');
        var errorBox = document.getElementById('login-error');
        var button = document.getElementById('login-submit');
        var box = document.getElementById('captcha-box');
        var widget = document.getElementById('captcha-widget');
        var status = document.getElementById('captcha-status');

        var captchaRequired = false;
        var captchaToken = null;
        var captchaProvider = 'builtin';
        var captchaChallengeId = null;
        var captchaSiteKey = null;
        var captchaWidgetId = null;

        function say(message, kind) {
          status.textContent = message;
          status.className = 'captcha-status' + (kind ? ' ' + kind : '');
        }

        function syncSubmit() {
          button.disabled = captchaRequired && captchaToken === null;
        }

        function unwrap(payload) {
          return payload && payload.data ? payload.data : payload;
        }

        function postJson(url, body) {
          return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).then(function (response) {
            return response.json().then(function (payload) {
              return { ok: response.ok, data: unwrap(payload), raw: payload };
            });
          });
        }

        function useToken(result) {
          if (result.ok && result.data && result.data.token) {
            captchaToken = result.data.token;
            say('验证通过，可以继续', 'ok');
          } else {
            captchaToken = null;
            say((result.raw && result.raw.message) || '人机验证未通过，请重试', 'bad');
          }
          syncSubmit();
        }

        function loadBuiltinChallenge() {
          captchaToken = null;
          syncSubmit();
          fetch('/api/captcha/challenge')
            .then(function (response) {
              return response.json().then(function (payload) {
                return { ok: response.ok, data: unwrap(payload) };
              });
            })
            .then(function (result) {
              if (!result.ok || !result.data || !result.data.svg) {
                widget.innerHTML = '';
                say('无法获取人机验证题目，请点击“换一题”重试', 'bad');
                return;
              }
              captchaChallengeId = result.data.id;
              widget.innerHTML =
                '<div class="captcha-svg">' + result.data.svg + '</div>' +
                '<div class="captcha-row">' +
                '<input id="captcha-answer" name="captcha-answer" autocomplete="off" inputmode="numeric" placeholder="算式的结果" />' +
                '<button type="button" id="captcha-refresh">换一题</button>' +
                '<button type="button" id="captcha-check">验证</button>' +
                '</div>';
              say('算出结果并点击“验证”', '');
              document.getElementById('captcha-refresh').addEventListener('click', loadBuiltinChallenge);
              document.getElementById('captcha-check').addEventListener('click', function () {
                var answer = document.getElementById('captcha-answer').value.trim();
                if (answer === '') {
                  say('请输入计算结果', 'bad');
                  return;
                }
                postJson('/api/captcha/verify', { id: captchaChallengeId, answer: answer })
                  .then(useToken)
                  .catch(function () {
                    say('人机验证请求失败，请重试', 'bad');
                  });
              });
            })
            .catch(function () {
              say('人机验证不可用，请稍后重试', 'bad');
            });
        }

        function loadScript(src, done) {
          var existing = document.querySelector('script[src="' + src + '"]');
          if (existing) {
            if (existing.dataset.loaded === 'true') {
              done();
              return;
            }
            existing.addEventListener('load', done);
            return;
          }
          var script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.addEventListener('load', function () {
            script.dataset.loaded = 'true';
            done();
          });
          script.addEventListener('error', function () {
            say('无法加载第三方人机验证脚本，请检查网络', 'bad');
          });
          document.head.appendChild(script);
        }

        function providerWidget() {
          return captchaProvider === 'turnstile' ? window.turnstile : window.hcaptcha;
        }

        function mountExternal() {
          var src = captchaProvider === 'turnstile'
            ? 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
            : 'https://js.hcaptcha.com/1/api.js?render=explicit';
          loadScript(src, function () {
            var instance = providerWidget();
            if (!instance) {
              say('人机验证组件不可用，请稍后重试', 'bad');
              return;
            }
            captchaWidgetId = instance.render(widget, {
              sitekey: captchaSiteKey,
              theme: 'dark',
              callback: function (widgetToken) {
                postJson('/api/captcha/verify', { token: widgetToken }).then(useToken);
              },
            });
            say('请完成上方验证', '');
          });
        }

        function resetCaptcha() {
          if (!captchaRequired) {
            return;
          }
          captchaToken = null;
          syncSubmit();
          if (captchaProvider === 'builtin') {
            loadBuiltinChallenge();
            return;
          }
          var instance = providerWidget();
          if (instance && captchaWidgetId) {
            instance.reset(captchaWidgetId);
          }
        }

        fetch('/api/captcha/config')
          .then(function (response) {
            return response.json().then(function (payload) {
              return unwrap(payload);
            });
          })
          .then(function (config) {
            if (!config || !config.enabled) {
              return;
            }
            captchaRequired = true;
            captchaProvider = config.provider || 'builtin';
            captchaSiteKey = config.siteKey || null;
            box.hidden = false;
            syncSubmit();
            if (captchaProvider === 'builtin') {
              loadBuiltinChallenge();
            } else if (captchaSiteKey) {
              mountExternal();
            } else {
              say('站点已开启人机验证但缺少 Site Key，请联系管理员', 'bad');
            }
          })
          .catch(function () {
            box.hidden = true;
          });

        form.addEventListener('submit', function (event) {
          event.preventDefault();
          if (captchaRequired && captchaToken === null) {
            errorBox.textContent = '请先完成人机验证';
            errorBox.hidden = false;
            return;
          }
          errorBox.hidden = true;
          button.disabled = true;

          var data = new FormData(form);
          var headers = { 'Content-Type': 'application/json' };
          if (captchaToken !== null) {
            headers['x-captcha-token'] = captchaToken;
          }
          try {
            fetch('/api/auth/sign-in/email', {
              method: 'POST',
              credentials: 'include',
              headers: headers,
              body: JSON.stringify({
                email: data.get('email'),
                password: data.get('password'),
              }),
            }).then(function (response) {
              if (response.ok) {
                window.location.reload();
                return Promise.resolve();
              }
              button.disabled = false;
              resetCaptcha();
              var message = '登录失败（HTTP ' + response.status + '）';
              if (response.status === 401) {
                message = '邮箱或密码错误';
              } else if (response.status === 429) {
                message = '请求过于频繁，请稍后再试';
              }
              return response.json()
                .then(function (body) {
                  if (response.status !== 401 && response.status !== 429 && body) {
                    message = body.message || body.error || message;
                  }
                })
                .catch(function () {})
                .then(function () {
                  errorBox.textContent = message;
                  errorBox.hidden = false;
                });
            }).catch(function () {
              button.disabled = false;
              resetCaptcha();
              errorBox.textContent = '无法连接认证服务，请检查网络后重试';
              errorBox.hidden = false;
            });
          } catch (error) {
            button.disabled = false;
            resetCaptcha();
            errorBox.textContent = '无法连接认证服务，请检查网络后重试';
            errorBox.hidden = false;
          }
        });
`;

/** Shown when the launcher opened the consent page without a website session. */
export function renderEntryLoginPage(context: EntryPageContext): string {
  const details = parameterRows(context.query);

  return shell(
    '登录后授权',
    `<span class="badge">M2 会话与形象</span>
      <h1>请先登录 MCSerAuth</h1>
      <p>启动器请求授权前，请使用网站账号登录。登录成功后会自动回到当前授权请求。</p>
      <form id="login-form" method="post" action="/api/auth/sign-in/email">
        <label for="email">邮箱</label>
        <input id="email" name="email" type="email" autocomplete="email" required />
        <label for="password">密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <div id="captcha-box" class="captcha-box" hidden>
          <div id="captcha-widget"></div>
          <p id="captcha-status" class="captcha-status"></p>
        </div>
        <button id="login-submit" type="submit">登录并继续</button>
      </form>
      <div id="login-error" class="error-box" hidden></div>
      ${details ? `<table><tbody>${details}</tbody></table>` : '<p>未收到授权参数。</p>'}
      <p class="muted">还没有账号？请先前往 <a href="${escapeHtml(context.appUrl)}">${escapeHtml(context.appUrl)}</a> 注册。</p>
      <footer>协议：Commons-Designs（OAuth 授权码 + PKCE）</footer>
      <script>${ENTRY_LOGIN_SCRIPT}</script>`,
  );
}

/** Shown to a logged-in account; submitting issues the authorization code. */
export function renderEntryConsentPage(context: ConsentPageContext): string {
  const details = parameterRows(context.query);
  const redirectBlocked = context.redirectUriError !== undefined;

  const playerLine = context.player
    ? `<div>游戏角色：<strong>${escapeHtml(context.player.nickname)}</strong>（<code>${escapeHtml(context.player.uuid)}</code>）${
        context.player.banned ? ' <span style="color:#fca5a5">已被封禁</span>' : ''
      }</div>`
    : '<div class="muted">当前账号还没有游戏角色；首次完成授权时会自动创建。</div>';

  const hiddenFields = [
    ['client_id', context.query.client_id],
    ['redirect_uri', context.query.redirect_uri],
    ['response_type', context.query.response_type ?? 'code'],
    ['scope', context.query.scope],
    ['state', context.query.state],
    ['code_challenge', context.query.code_challenge],
    ['code_challenge_method', context.query.code_challenge_method],
  ]
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name ?? '')}" value="${escapeHtml(value ?? '')}" />`,
    )
    .join('');

  return shell(
    '授权确认',
    `<span class="badge">M2 会话与形象</span>
      <h1>确认授权</h1>
      <p>启动器将通过本次授权获取访问令牌。授权成功后浏览器会携带一次性授权码返回启动器，令牌由启动器在后台换取。</p>
      <div class="account">
        <div>账号：<strong>${escapeHtml(context.account.name)}</strong>（${escapeHtml(context.account.email)}）</div>
        ${playerLine}
      </div>
      ${details ? `<table><tbody>${details}</tbody></table>` : '<p>未收到授权参数。</p>'}
      ${
        redirectBlocked
          ? `<div class="error-box">${escapeHtml(context.redirectUriError ?? '')}</div>`
          : `<form method="post" action="/api/oauth/entry">${hiddenFields}<button type="submit">授权并返回启动器</button></form>`
      }
      <footer>授权码单次使用且短时有效；回调只允许 HTTPS 或本机 HTTP 地址。</footer>`,
  );
}
