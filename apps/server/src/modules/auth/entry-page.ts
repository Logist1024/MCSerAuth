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

/**
 * M0 placeholder for the launcher consent page.
 *
 * A3: the real page is rendered directly by NestJS (the only rendering
 * exception in the project) so it shares the website login cookie. Until M1
 * this returns a static, escaped page that documents the received parameters —
 * enough to record what launchers actually send.
 */
export function renderEntryPlaceholder(query: OAuthEntryQuery): string {
  const rows: Array<[string, string | undefined]> = [
    ['client_id', query.client_id],
    ['redirect_uri', query.redirect_uri],
    ['response_type', query.response_type],
    ['scope', query.scope],
    ['state', query.state],
    ['code_challenge_method', query.code_challenge_method],
  ];

  const details = rows
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(
      ([name, value]) =>
        `<tr><th>${escapeHtml(name)}</th><td><code>${escapeHtml(value ?? '')}</code></td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MCSerAuth · 授权确认</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #0f172a; color: #e2e8f0; }
      main { width: min(34rem, calc(100vw - 3rem)); background: #1e293b; border: 1px solid #334155; border-radius: 1rem; padding: 2rem; box-shadow: 0 24px 60px rgb(0 0 0 / 0.35); }
      h1 { margin: 0 0 0.5rem; font-size: 1.35rem; }
      p { color: #94a3b8; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font-size: 0.85rem; }
      th, td { text-align: left; padding: 0.45rem 0; border-bottom: 1px solid #334155; vertical-align: top; word-break: break-all; }
      th { color: #94a3b8; font-weight: 500; width: 40%; }
      .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; background: #164e63; color: #a5f3fc; font-size: 0.75rem; margin-bottom: 1rem; }
      footer { color: #64748b; font-size: 0.75rem; margin-top: 1.5rem; }
    </style>
  </head>
  <body>
    <main>
      <span class="badge">M0 占位页</span>
      <h1>MCSerAuth 授权确认</h1>
      <p>授权链路将在 M1 实现。此页面仅用于启动器契约联调，记录启动器实际发送的授权参数。</p>
      ${details ? `<table><tbody>${details}</tbody></table>` : '<p>未收到授权参数。</p>'}
      <footer>协议：Commons-Designs（authlib-injector 体系）</footer>
    </main>
  </body>
</html>`;
}
