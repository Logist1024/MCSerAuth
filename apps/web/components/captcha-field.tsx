'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptchaPublicConfig } from '@mcserauth/shared';
import { fetchCaptchaChallenge, fetchCaptchaConfig, verifyCaptcha } from '@/lib/api-client';
import { Icon } from './icons';

const PROVIDER_SCRIPTS: Record<string, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit',
};

type Phase = 'loading' | 'off' | 'builtin' | 'external' | 'unavailable';

interface ExternalWidget {
  render: (
    element: HTMLElement,
    options: { sitekey: string; theme?: string; callback: (token: string) => void },
  ) => string;
  remove: (widgetId: string) => void;
}

function externalWidget(provider: string): ExternalWidget | undefined {
  const candidate = (window as unknown as Record<string, unknown>)[
    provider === 'turnstile' ? 'turnstile' : 'hcaptcha'
  ];
  return typeof candidate === 'object' && candidate !== null
    ? (candidate as ExternalWidget)
    : undefined;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('人机验证脚本加载失败')));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error('人机验证脚本加载失败')));
    document.head.appendChild(script);
  });
}

export interface CaptchaFieldProps {
  /** Receives the one-shot token on success, or `null` whenever the field resets. */
  onToken: (token: string | null) => void;
  /** Reports whether the site currently requires verification, for submit gating. */
  onActiveChange?: (active: boolean) => void;
  /** Bump to discard the current challenge — a burned token cannot be reused. */
  resetSignal?: number;
}

/**
 * Renders whichever human-verification UI the site has configured.
 *
 * The token it issues is single-use: better-auth consumes it in a `before`
 * hook that runs ahead of the credential check, so a wrong password also
 * destroys the token and the caller must bump `resetSignal`.
 */
export default function CaptchaField({
  onToken,
  onActiveChange,
  resetSignal = 0,
}: CaptchaFieldProps) {
  const [config, setConfig] = useState<CaptchaPublicConfig | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [challenge, setChallenge] = useState<{ id: string; svg: string } | null>(null);
  const [answer, setAnswer] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setVerified(false);
    setAnswer('');
    setError(null);
    onToken(null);
  }, [onToken]);

  const loadChallenge = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await fetchCaptchaChallenge();
      setChallenge({ id: next.id, svg: next.svg });
    } catch (loadError) {
      setChallenge(null);
      setError(loadError instanceof Error ? loadError.message : '无法获取人机验证题目');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchCaptchaConfig()
      .then((next) => {
        if (!active) {
          return;
        }
        setConfig(next);
        if (!next.enabled) {
          setPhase('off');
          onActiveChange?.(false);
        } else if (next.provider === 'builtin') {
          setPhase('builtin');
          onActiveChange?.(true);
        } else if (next.siteKey) {
          setPhase('external');
          onActiveChange?.(true);
        } else {
          setPhase('unavailable');
          onActiveChange?.(true);
        }
      })
      .catch(() => {
        if (active) {
          // A broken config endpoint must not lock people out of a captcha that
          // is not actually enabled server-side.
          setPhase('off');
          onActiveChange?.(false);
        }
      });
    return () => {
      active = false;
    };
  }, [onActiveChange]);

  useEffect(() => {
    if (phase !== 'builtin') {
      return;
    }
    void loadChallenge();
  }, [phase, loadChallenge, resetSignal]);

  useEffect(() => {
    if (resetSignal === 0 || phase === 'off') {
      return;
    }
    reset();
    if (phase === 'external' && widgetIdRef.current !== null) {
      const provider = config?.provider ?? '';
      externalWidget(provider)?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }
  }, [resetSignal, phase, config, reset]);

  useEffect(() => {
    if (phase !== 'external' || config === null) {
      return;
    }
    const { provider, siteKey } = config;
    if (siteKey === null) {
      return;
    }
    const element = containerRef.current;
    if (element === null) {
      return;
    }
    let cancelled = false;
    const src = PROVIDER_SCRIPTS[provider] as string;

    loadScript(src)
      .then(() => {
        if (cancelled) {
          return;
        }
        const widget = externalWidget(provider);
        if (widget === undefined) {
          setError('人机验证组件不可用，请稍后重试');
          return;
        }
        widgetIdRef.current = widget.render(element, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (widgetToken) => {
            verifyCaptcha({ token: widgetToken })
              .then((result) => {
                if (cancelled) {
                  return;
                }
                setVerified(true);
                setError(null);
                onToken(result.token);
              })
              .catch((verifyError) => {
                if (!cancelled) {
                  setError(
                    verifyError instanceof Error ? verifyError.message : '人机验证未通过，请重试',
                  );
                  onToken(null);
                }
              });
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError('无法加载第三方人机验证脚本，请检查网络');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [phase, config, onToken, resetSignal]);

  if (phase === 'off') {
    return null;
  }

  if (phase === 'loading') {
    return (
      <p className="captcha-status muted" aria-live="polite">
        正在准备人机验证…
      </p>
    );
  }

  if (phase === 'unavailable') {
    return (
      <p className="captcha-status bad small" role="alert">
        站点已开启人机验证但缺少 Site Key 配置，请联系管理员。
      </p>
    );
  }

  if (phase === 'external') {
    return (
      <div className="field captcha-field">
        <label>人机验证</label>
        <div ref={containerRef} className="captcha-widget" />
        {verified ? (
          <p className="captcha-status ok small" role="status">
            <Icon name="check" width={13} height={13} /> 验证通过
          </p>
        ) : (
          <p className="captcha-status muted small">请完成上方验证后再提交。</p>
        )}
        {error !== null ? (
          <p className="captcha-status bad small" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  async function submitAnswer(): Promise<void> {
    if (challenge === null || answer.trim() === '') {
      setError('请输入计算结果');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await verifyCaptcha({ id: challenge.id, answer: answer.trim() });
      setVerified(true);
      onToken(result.token);
    } catch (verifyError) {
      onToken(null);
      setVerified(false);
      setError(verifyError instanceof Error ? verifyError.message : '人机验证未通过');
      await loadChallenge();
      setAnswer('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field captcha-field">
      <label htmlFor="captcha-answer">人机验证</label>
      {challenge === null ? (
        <p className="captcha-status muted small">{busy ? '正在出题…' : '验证题目加载失败'}</p>
      ) : (
        <div
          className="captcha-svg"
          // Server-rendered SVG containing only digits and an operator.
          dangerouslySetInnerHTML={{ __html: challenge.svg }}
        />
      )}
      <div className="captcha-row">
        <input
          id="captcha-answer"
          value={answer}
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submitAnswer();
            }
          }}
          placeholder="算式的结果"
          disabled={verified || busy}
          aria-describedby="captcha-help"
        />
        <button
          className="button secondary small"
          type="button"
          onClick={() => void loadChallenge()}
          disabled={busy || verified}
        >
          换一题
        </button>
        <button
          className="button ghost small"
          type="button"
          onClick={() => void submitAnswer()}
          disabled={busy || verified || challenge === null}
        >
          {verified ? '已通过' : '验证'}
        </button>
      </div>
      {verified ? (
        <p id="captcha-help" className="captcha-status ok small" role="status">
          <Icon name="check" width={13} height={13} /> 验证通过，可以继续提交
        </p>
      ) : (
        <p id="captcha-help" className="captcha-status muted small">
          算出结果并点击“验证”，通过后才能提交表单。
        </p>
      )}
      {error !== null ? (
        <p className="captcha-status bad small" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
