import type { PublicUserProfile, UserSettingsResponse } from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Avatar from '@/components/avatar';
import Breadcrumbs from '@/components/breadcrumbs';
import { LevelBadge, TitleBadge } from '@/components/growth/user-badges';
import { Icon } from '@/components/icons';
import PostList from '@/components/post-list';
import ProfileEditor from '@/components/profile/profile-editor';
import AccountSecurity from '@/components/profile/account-security';
import { formatDate } from '@/lib/format';
import { roleClass, roleLabel } from '@/lib/forum-ui';
import { serverApiFetch, serverApiFetchResult } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await serverApiFetch<PublicUserProfile>(`/api/users/${encodeURIComponent(id)}`);
  return { title: profile ? `${profile.user.name} · 个人主页` : '个人主页' };
}

export default async function UserPage({ params }: PageProps) {
  const { id } = await params;
  const [profile, viewer] = await Promise.all([
    serverApiFetch<PublicUserProfile>(`/api/users/${encodeURIComponent(id)}`),
    serverApiFetchResult<UserSettingsResponse>('/api/user/settings'),
  ]);
  if (profile === null) {
    notFound();
  }

  const viewerSettings = viewer.ok ? viewer.data : null;
  const isOwner = viewerSettings !== null && viewerSettings.user.id === profile.user.id;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: '首页', href: '/' },
          { label: '论坛', href: '/forum' },
          { label: profile.user.name },
        ]}
      />

      <header className="profile-hero">
        <Avatar name={profile.user.name} src={profile.user.avatarUrl} size="lg" />
        <div className="profile-identity">
          <h1 className="profile-name">
            {profile.user.name}
            <span className={`role-badge ${roleClass(profile.user.role)}`}>
              {roleLabel(profile.user.role)}
            </span>
          </h1>
          <div className="growth-badges-inline">
            {profile.progress.title !== null ? (
              <TitleBadge
                name={profile.progress.title.name}
                color={profile.progress.title.color}
                size="lg"
              />
            ) : (
              <LevelBadge
                level={profile.progress.level}
                tierName={profile.progress.tierName}
                size="lg"
              />
            )}
          </div>
          <p className="profile-signature">
            {profile.user.signature ?? '这个人很懒，还没有写签名。'}
          </p>
          <div className="profile-meta">
            <span>加入于 {formatDate(profile.user.createdAt)}</span>
            {profile.player !== null ? (
              <>
                <span className="meta-dot" aria-hidden="true">
                  ·
                </span>
                <span className="player-badge">
                  <Icon name="gamepad" width={12} height={12} />
                  {profile.player.nickname}
                </span>
                <span className="mono tiny-text">{profile.player.uuid}</span>
                {profile.player.banned ? <span className="bad small">游戏已封禁</span> : null}
              </>
            ) : (
              <span>· 未绑定游戏身份</span>
            )}
          </div>
          <div className="profile-stats">
            <div className="profile-stat">
              <strong>{profile.stats.posts}</strong>
              <span>主题</span>
            </div>
            <div className="profile-stat">
              <strong>{profile.stats.replies}</strong>
              <span>回复</span>
            </div>
          </div>
        </div>
      </header>

      <div className="profile-layout">
        <div className="profile-main">
          <section className="panel">
            <div className="panel-head">
              <h2>最近主题</h2>
              <Link className="panel-meta" href="/forum">
                查看全部
              </Link>
            </div>
            <PostList
              posts={profile.recentPosts}
              emptyText="还没有发表过主题。"
              showEmptyAction={false}
            />
          </section>
        </div>

        <aside className="profile-side">
          {isOwner && viewerSettings !== null ? (
            <>
              <ProfileEditor
                initialAvatarUrl={viewerSettings.user.avatarUrl ?? ''}
                initialSignature={viewerSettings.user.signature ?? ''}
              />
              <AccountSecurity currentEmail={viewerSettings.user.email} />
            </>
          ) : null}

          <section className="side-card">
            <h2>成长档案</h2>
            <dl className="topic-info-list">
              <div className="topic-info-row">
                <dt>等级</dt>
                <dd>
                  Lv.{profile.progress.level} · {profile.progress.tierName}
                </dd>
              </div>
              <div className="topic-info-row">
                <dt>累计经验</dt>
                <dd>{profile.progress.xp} XP</dd>
              </div>
              <div className="topic-info-row">
                <dt>积分</dt>
                <dd>{profile.progress.points}</dd>
              </div>
              <div className="topic-info-row">
                <dt>连续签到</dt>
                <dd>{profile.progress.checkinStreak} 天</dd>
              </div>
            </dl>
          </section>

          <Link className="button ghost" href="/forum">
            <Icon name="arrowLeft" width={16} height={16} />
            返回论坛
          </Link>
        </aside>
      </div>
    </>
  );
}
