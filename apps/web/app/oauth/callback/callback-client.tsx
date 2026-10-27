'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { OAuthTokenResponse, UserProfilesMeResponse } from '@mcserauth/shared';
import {
  ProtocolApiError,
  authenticateOAuth,
  fetchMyProfile,
  refreshOAuth,
} from '@/lib/api-client';

const PENDING_KEY = 'mcserauth.oauth.pending';

interface PendingAuthorization {
  state: string;
  verifier: string;
  redirectUri: string;
  clientId?: string;
}

function describeError(error: unknown): string {
  if (error instanceof ProtocolApiError) {
    return `${error.protocolError}（HTTP ${error.status}）：${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function maskToken(token: string): string {
  if (token.length <= 24) {
    return token;
  }
  return `${token.slice(0, 14)}…${token.slice(-8)}`;
}

function readPendingAuthorization(): PendingAuthorization | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw === null ? null : (JSON.parse(raw) as PendingAuthorization);
  } catch {
    return null;
  }
}

export default function OAuthCallbackClient() {
  const searchParams = useSearchParams();
  const [tokens, setTokens] = useState<OAuthTokenResponse | null>(null);
  const [profile, setProfile] = useState<UserProfilesMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'exchanging' | 'ready' | 'failed'>('exchanging');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const providerError = searchParams.get('error');

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    if (providerError !== null) {
      setError(`授权服务返回错误：${providerError}`);
      setStatus('failed');
      return;
    }
    if (code === null) {
      setError('回调地址缺少 code 参数。');
      setStatus('failed');
      return;
    }

    const pending = readPendingAuthorization();
    if (pending === null) {
      setError('未找到本地 PKCE 记录，请从首页重新发起授权。');
      setStatus('failed');
      return;
    }
    if (state === null || state !== pending.state) {
      setError('state 校验失败，授权结果可能被篡改，请重新发起。');
      setStatus('failed');
      return;
    }

    void (async () => {
      try {
        const result = await authenticateOAuth({
          code,
          client_id: pending.clientId,
          redirect_uri: pending.redirectUri,
          code_verifier: pending.verifier,
        });
        sessionStorage.removeItem(PENDING_KEY);
        setTokens(result);

        try {
          setProfile(await fetchMyProfile({ accessToken: result.access_token }));
        } catch (profileError) {
          setError(`令牌已签发，但 /user/profiles/me 调用失败：${describeError(profileError)}`);
        }

        setStatus('ready');
      } catch (exchangeError) {
        setError(describeError(exchangeError));
        setStatus('failed');
      }
    })();
  }, [code, providerError, state]);

  async function handleLoadProfile() {
    if (tokens === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setProfile(await fetchMyProfile({ accessToken: tokens.access_token }));
    } catch (profileError) {
      setError(describeError(profileError));
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    if (tokens === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await refreshOAuth({ refresh_token: tokens.refresh_token });
      setTokens(next);
      setProfile(await fetchMyProfile({ accessToken: next.access_token }));
    } catch (refreshError) {
      setError(describeError(refreshError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <h1>OAuth 回调结果</h1>
        <p className="muted">
          授权码 → 启动器令牌 → <code>GET /api/user/profiles/me</code> → <code>refresh</code>{' '}
          轮换。令牌只保存在当前页面内存中，刷新页面即丢失。
        </p>

        {status === 'exchanging' ? <p>正在用授权码换取令牌…</p> : null}
        {error !== null ? <p className="bad">{error}</p> : null}

        {tokens !== null ? (
          <div className="stack">
            <div className="status-row">
              <span className="status-label">token_type</span>
              <span className="status-value">{tokens.token_type}</span>
            </div>
            <div className="status-row">
              <span className="status-label">expires_in</span>
              <span className="status-value">
                {tokens.expires_in} s（{Math.round(tokens.expires_in / 86_400)} 天）
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">access_token</span>
              <span className="status-value">{maskToken(tokens.access_token)}</span>
            </div>
            <div className="status-row">
              <span className="status-label">refresh_token</span>
              <span className="status-value">{maskToken(tokens.refresh_token)}</span>
            </div>
            {tokens.user ? (
              <div className="status-row">
                <span className="status-label">token.user</span>
                <span className="status-value">
                  {tokens.user.name}（{tokens.user.email} · {tokens.user.role}）
                </span>
              </div>
            ) : null}
            <div className="actions">
              <button
                className="button secondary"
                type="button"
                onClick={handleLoadProfile}
                disabled={busy}
              >
                重新调用 /me
              </button>
              <button className="button" type="button" onClick={handleRefresh} disabled={busy}>
                {busy ? '处理中…' : '刷新令牌（轮换）'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {profile !== null ? (
        <section className="card">
          <h2>当前用户档案</h2>
          <div className="status-row">
            <span className="status-label">user</span>
            <span className="status-value">
              {profile.user.name}（{profile.user.email} · {profile.user.role}）
            </span>
          </div>
          <div className="status-row">
            <span className="status-label">player</span>
            <span className="status-value">
              {profile.player
                ? `${profile.player.nickname} · ${profile.player.uuid}${
                    profile.player.banned ? ' · 已封禁' : ''
                  }`
                : '未绑定'}
            </span>
          </div>
        </section>
      ) : null}

      <p>
        <Link className="button secondary" href="/">
          返回首页
        </Link>
      </p>
    </>
  );
}
