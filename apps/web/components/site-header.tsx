'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, startTransition } from 'react';
import { roleAtLeast } from '@mcserauth/shared';
import { fetchUnreadCount, fetchUserSettings } from '@/lib/api-client';
import { fetchWebsiteSession, signOut, type WebsiteSession } from '@/lib/auth-client';
import Avatar from './avatar';
import { Icon, LogoMark } from './icons';
import { useToast } from './toast';

/** Sticky community header: navigation, composer entry, unread badge and account menu. */
export default function SiteHeader({
  siteName = 'MCSerAuth 社区',
  tagline = '社区',
  iconUrl = null,
}: {
  siteName?: string;
  tagline?: string;
  iconUrl?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [session, setSession] = useState<WebsiteSession | null | undefined>(undefined);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const inFlight = useRef(false);
  const lastFocusReload = useRef(0);

  const reload = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const current = await fetchWebsiteSession();
      setSession(current);
      if (current === null) {
        setAvatarUrl(null);
        setUnread(0);
        return;
      }

      const [settingsResult, unreadResult] = await Promise.allSettled([
        fetchUserSettings(),
        fetchUnreadCount(),
      ]);
      setAvatarUrl(
        settingsResult.status === 'fulfilled' ? settingsResult.value.user.avatarUrl : null,
      );
      setUnread(unreadResult.status === 'fulfilled' ? unreadResult.value.unreadCount : 0);
    } catch {
      setSession(null);
      setAvatarUrl(null);
      setUnread(0);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void reload();
    const onSessionChanged = (): void => {
      // Let the browser apply the cleared session cookie before refetching.
      window.setTimeout(() => {
        void reload();
      }, 120);
    };
    const onNotificationsChanged = (): void => {
      void reload();
    };
    const onFocus = (): void => {
      const now = Date.now();
      if (now - lastFocusReload.current < 30_000) {
        return;
      }
      lastFocusReload.current = now;
      void reload();
    };
    window.addEventListener('mcserauth:session-changed', onSessionChanged);
    window.addEventListener('mcserauth:notifications-changed', onNotificationsChanged);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('mcserauth:session-changed', onSessionChanged);
      window.removeEventListener('mcserauth:notifications-changed', onNotificationsChanged);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload]);

  useEffect(() => {
    if (menu.current !== null) {
      menu.current.open = false;
    }
  }, [pathname]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      const element = menu.current;
      if (
        element !== null &&
        element.open &&
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        element.open = false;
      }
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const element = menu.current;
      if (event.key !== 'Escape' || element === null || !element.open) {
        return;
      }
      element.open = false;
      element.querySelector<HTMLElement>('summary')?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      setSession(null);
      setAvatarUrl(null);
      setUnread(0);
      window.dispatchEvent(new Event('mcserauth:session-changed'));
      toast.success('已退出登录');
      startTransition(() => {
        router.push('/forum');
        router.refresh();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退出登录失败');
    } finally {
      setSigningOut(false);
    }
  }

  const isModerator = roleAtLeast(session?.user.role, 'reviewer');
  const signedIn = session !== null && session !== undefined;
  const onLoginPage = pathname.startsWith('/login');
  const forumActive = pathname === '/forum' || pathname.startsWith('/forum/');
  const texturesActive = pathname === '/textures' || pathname.startsWith('/textures/');
  const loginNext = pathname.startsWith('/login') ? '/forum' : pathname;
  const loginHref = `/login?next=${encodeURIComponent(loginNext)}`;
  const composeHref =
    session === null ? `/login?next=${encodeURIComponent('/forum/new')}` : '/forum/new';

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/" aria-label={`${siteName} 首页`}>
          {iconUrl === null ? (
            <LogoMark size={30} />
          ) : (
            <img
              className="brand-logo"
              src={iconUrl}
              alt=""
              width={30}
              height={30}
              decoding="async"
            />
          )}
          <span className="brand-text">
            <span className="brand-name">{siteName}</span>
            <span className="brand-sub">{tagline}</span>
          </span>
        </Link>

        <nav className="primary-nav" aria-label="主导航">
          <Link
            className="primary-nav-link"
            href="/forum"
            aria-current={forumActive ? 'page' : undefined}
          >
            论坛
          </Link>
          <Link
            className="primary-nav-link"
            href="/textures"
            aria-current={texturesActive ? 'page' : undefined}
          >
            游戏账号管理
          </Link>
        </nav>

        <div className="header-actions">
          {signedIn ? (
            <Link
              className="button primary small header-compose"
              href={composeHref}
              aria-label="发起新话题"
            >
              <Icon name="pen" width={16} height={16} />
              <span>发帖</span>
            </Link>
          ) : null}

          {session === undefined ? (
            <span className="header-loading" aria-hidden="true" />
          ) : session !== null ? (
            <>
              {isModerator ? (
                <Link className="icon-button" href="/admin" aria-label="管理后台" title="管理后台">
                  <Icon name="shield" width={19} height={19} />
                </Link>
              ) : null}

              <Link
                className="icon-button badge-button"
                href="/notifications"
                aria-label={unread > 0 ? `通知，${unread} 条未读` : '通知'}
                title="通知"
              >
                <Icon name="bell" width={19} height={19} />
                {unread > 0 ? (
                  <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>
                ) : null}
              </Link>

              <details className="user-menu" ref={menu}>
                <summary
                  className="user-menu-trigger"
                  aria-label={`账号菜单：${session.user.name}`}
                >
                  <Avatar name={session.user.name} src={avatarUrl} size="sm" />
                  <span className="user-menu-name">{session.user.name}</span>
                  <Icon name="chevronDown" width={14} height={14} className="user-menu-chevron" />
                </summary>
                <div
                  className="user-menu-popover"
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest('a') !== null &&
                      menu.current !== null
                    ) {
                      menu.current.open = false;
                    }
                  }}
                >
                  <div className="user-menu-identity">
                    <strong>{session.user.name}</strong>
                    <span>{session.user.email}</span>
                  </div>
                  <Link className="user-menu-item" href={`/users/${session.user.id}`}>
                    <Icon name="user" width={16} height={16} />
                    个人主页
                  </Link>
                  <Link className="user-menu-item" href="/forum/growth">
                    <Icon name="star" width={16} height={16} />
                    成长中心
                  </Link>
                  <Link className="user-menu-item" href="/textures">
                    <Icon name="gamepad" width={16} height={16} />
                    游戏账号管理
                  </Link>
                  <button
                    className="user-menu-item user-menu-signout"
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                  >
                    <Icon name="logout" width={16} height={16} />
                    {signingOut ? '退出中…' : '退出登录'}
                  </button>
                </div>
              </details>
            </>
          ) : onLoginPage ? null : (
            <div className="auth-actions">
              <Link className="button ghost small" href={loginHref}>
                登录
              </Link>
              <Link className="button primary small" href={`${loginHref}&mode=signup`}>
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
