'use client';

import {
  ROLE_RANK,
  normalizeUserRole,
  roleAtLeast,
  type AdminUserSummary,
  type Paginated,
  type UserRole,
} from '@mcserauth/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  adminBanUser,
  adminListUsers,
  adminMuteUser,
  adminUnbanUser,
  adminUnmuteUser,
  adminUpdateUserRole,
} from '@/lib/api-client';
import ConfirmDialog from '@/components/confirm-dialog';
import { describeApiError } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { roleClass, roleLabel } from '@/lib/forum-ui';

const MUTE_DURATIONS = [
  { value: 1, label: '1 小时' },
  { value: 6, label: '6 小时' },
  { value: 24, label: '1 天' },
  { value: 72, label: '3 天' },
  { value: 168, label: '7 天' },
  { value: 720, label: '30 天' },
];

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'user', label: '成员' },
  { value: 'reviewer', label: '审核员' },
  { value: 'admin', label: '管理员' },
];

function isMuted(user: AdminUserSummary): boolean {
  return user.mutedUntil !== null && new Date(user.mutedUntil).getTime() > Date.now();
}

export default function AdminUsers({ role, viewerId }: { role: UserRole; viewerId: string }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminUserSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<AdminUserSummary | null>(null);
  const [banReason, setBanReason] = useState('');
  const [unbanTarget, setUnbanTarget] = useState<AdminUserSummary | null>(null);
  const [muteTarget, setMuteTarget] = useState<AdminUserSummary | null>(null);
  const [muteHours, setMuteHours] = useState(24);
  const [muteReason, setMuteReason] = useState('');
  const banDialog = useRef<HTMLDialogElement>(null);
  const muteDialog = useRef<HTMLDialogElement>(null);

  const canBan = roleAtLeast(role, 'admin');
  const canManageRoles = roleAtLeast(role, 'superadmin');

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminListUsers({ search: query || undefined, page, pageSize: 20 }));
    } catch (fetchError) {
      setError(describeApiError(fetchError));
    }
  }, [page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const element = banDialog.current;
    if (element === null) {
      return;
    }
    if (banTarget !== null && !element.open) {
      element.showModal();
    } else if (banTarget === null && element.open) {
      element.close();
    }
  }, [banTarget]);

  useEffect(() => {
    const element = muteDialog.current;
    if (element === null) {
      return;
    }
    if (muteTarget !== null && !element.open) {
      element.showModal();
    } else if (muteTarget === null && element.open) {
      element.close();
    }
  }, [muteTarget]);

  function canModerate(user: AdminUserSummary): boolean {
    return (
      user.id !== viewerId &&
      ROLE_RANK[normalizeUserRole(user.role)] < ROLE_RANK[normalizeUserRole(role)]
    );
  }

  async function ban(): Promise<void> {
    if (banTarget === null) {
      return;
    }
    const user = banTarget;
    setBusy(`ban-${user.id}`);
    setError(null);
    setNotice(null);
    try {
      await adminBanUser(user.id, {
        reason: banReason.trim() === '' ? undefined : banReason.trim(),
        banForum: true,
        banGame: true,
      });
      setNotice(`${user.name} 已封禁（论坛与游戏）。`);
      setBanTarget(null);
      setBanReason('');
      await load();
    } catch (banError) {
      setError(describeApiError(banError));
    } finally {
      setBusy(null);
    }
  }

  async function unban(): Promise<void> {
    if (unbanTarget === null) {
      return;
    }
    const user = unbanTarget;
    setBusy(`unban-${user.id}`);
    setError(null);
    setNotice(null);
    try {
      await adminUnbanUser(user.id, { unbanForum: true, unbanGame: true });
      setNotice(`${user.name} 已解封。`);
      setUnbanTarget(null);
      await load();
    } catch (unbanError) {
      setError(describeApiError(unbanError));
    } finally {
      setBusy(null);
    }
  }

  async function mute(): Promise<void> {
    if (muteTarget === null) {
      return;
    }
    const user = muteTarget;
    setBusy(`mute-${user.id}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await adminMuteUser(user.id, {
        durationHours: muteHours,
        reason: muteReason.trim() === '' ? undefined : muteReason.trim(),
      });
      setNotice(
        `${user.name} 已被禁言至 ${
          updated.mutedUntil ? formatDateTime(updated.mutedUntil) : '稍后'
        }。`,
      );
      setMuteTarget(null);
      setMuteReason('');
      await load();
    } catch (muteError) {
      setError(describeApiError(muteError));
    } finally {
      setBusy(null);
    }
  }

  async function unmute(user: AdminUserSummary): Promise<void> {
    setBusy(`unmute-${user.id}`);
    setError(null);
    setNotice(null);
    try {
      await adminUnmuteUser(user.id, {});
      setNotice(`${user.name} 的禁言已解除。`);
      await load();
    } catch (unmuteError) {
      setError(describeApiError(unmuteError));
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(user: AdminUserSummary, nextRole: UserRole): Promise<void> {
    if (nextRole === user.role) {
      return;
    }
    setBusy(`role-${user.id}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await adminUpdateUserRole(user.id, { role: nextRole });
      setNotice(`${user.name} 的角色已调整为${roleLabel(updated.role)}。`);
      await load();
    } catch (roleError) {
      setError(describeApiError(roleError));
    } finally {
      setBusy(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="card">
      <div className="section-heading">
        <h2>用户管理</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="昵称或邮箱"
          />
          <button className="button secondary" type="submit">
            搜索
          </button>
        </form>
      </div>
      <p className="muted small">
        {canBan ? '可禁言与封禁低于自己权限的账号。' : '审核员可以禁言普通成员，不能封禁账号。'}
        {canManageRoles ? ' 超级管理员可调整审核员与管理员。' : null}
      </p>

      {notice !== null ? <p className="ok">{notice}</p> : null}
      {error !== null ? <p className="bad">{error}</p> : null}
      {data === null ? <p className="muted">加载中…</p> : null}

      {data !== null && data.items.length === 0 ? (
        <p className="texture-empty">没有匹配的用户。</p>
      ) : null}

      {data !== null && data.items.length > 0 ? (
        <ul className="admin-list">
          {data.items.map((user) => {
            const muted = isMuted(user);
            const moderatable = canModerate(user);
            return (
              <li className="admin-list-item" key={user.id}>
                <div>
                  <strong>
                    <Link href={`/users/${user.id}`}>{user.name}</Link>
                  </strong>
                  <span className={`role-badge ${roleClass(user.role)}`}>
                    {roleLabel(user.role)}
                  </span>
                  {user.banned ? <span className="flag flag-hidden">封禁</span> : null}
                  {muted ? <span className="flag flag-muted">禁言中</span> : null}
                  <p className="muted small">
                    {user.email} · 注册于 {formatDate(user.createdAt)} · 帖子 {user.postCount}
                  </p>
                  <p className="muted small">
                    {user.player
                      ? `游戏角色 ${user.player.nickname}（${user.player.uuid}）${
                          user.player.banned ? ' · 游戏封禁' : ''
                        }`
                      : '未创建游戏角色'}
                    {muted && user.mutedUntil ? ` · 禁言至 ${formatDateTime(user.mutedUntil)}` : ''}
                  </p>
                  {canManageRoles && user.role !== 'superadmin' && user.id !== viewerId ? (
                    <label className="inline-select">
                      <span className="muted small">角色</span>
                      <select
                        value={user.role}
                        disabled={busy !== null}
                        onChange={(event) => void changeRole(user, event.target.value as UserRole)}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="actions">
                  {muted ? (
                    <button
                      className="button tiny secondary"
                      type="button"
                      disabled={busy !== null || !moderatable}
                      onClick={() => void unmute(user)}
                    >
                      解除禁言
                    </button>
                  ) : (
                    <button
                      className="button tiny secondary"
                      type="button"
                      disabled={busy !== null || !moderatable}
                      onClick={() => {
                        setMuteHours(24);
                        setMuteReason('');
                        setMuteTarget(user);
                      }}
                    >
                      禁言
                    </button>
                  )}
                  {canBan ? (
                    user.banned || user.player?.banned ? (
                      <button
                        className="button tiny secondary"
                        type="button"
                        disabled={busy !== null || !moderatable}
                        onClick={() => setUnbanTarget(user)}
                      >
                        解封
                      </button>
                    ) : (
                      <button
                        className="button tiny danger"
                        type="button"
                        disabled={busy !== null || !moderatable}
                        onClick={() => {
                          setBanReason('');
                          setBanTarget(user);
                        }}
                      >
                        封禁
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {data !== null && totalPages > 1 ? (
        <div className="pagination">
          <button
            className="button secondary"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            上一页
          </button>
          <span className="muted small">
            {page} / {totalPages}
          </span>
          <button
            className="button secondary"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}

      <dialog
        ref={banDialog}
        className="dialog"
        aria-labelledby="ban-user-title"
        onCancel={(event) => {
          event.preventDefault();
          if (busy === null) {
            setBanTarget(null);
          }
        }}
        onClick={(event) => {
          if (event.target === banDialog.current && busy === null) {
            setBanTarget(null);
          }
        }}
      >
        <div className="dialog-head">
          <span className="dialog-icon danger">
            <span aria-hidden="true">!</span>
          </span>
          <div>
            <h2 id="ban-user-title">封禁 {banTarget?.name}？</h2>
            <p className="muted small">
              默认同时封禁论坛与游戏身份。游戏侧从下次登录起生效，论坛立即生效。
            </p>
          </div>
        </div>
        <div className="report-body">
          <div className="field">
            <label htmlFor="ban-reason">封禁理由（可选，供后台记录）</label>
            <textarea
              id="ban-reason"
              value={banReason}
              maxLength={500}
              rows={3}
              onChange={(event) => setBanReason(event.target.value)}
              placeholder="例如：发布广告、多次人身攻击"
            />
          </div>
        </div>
        <div className="dialog-actions">
          <button
            className="button ghost"
            type="button"
            onClick={() => setBanTarget(null)}
            disabled={busy !== null}
          >
            取消
          </button>
          <button
            className="button danger-solid"
            type="button"
            onClick={() => void ban()}
            disabled={busy !== null}
          >
            {busy !== null ? '处理中…' : '确认封禁'}
          </button>
        </div>
      </dialog>

      <dialog
        ref={muteDialog}
        className="dialog"
        aria-labelledby="mute-user-title"
        onCancel={(event) => {
          event.preventDefault();
          if (busy === null) {
            setMuteTarget(null);
          }
        }}
        onClick={(event) => {
          if (event.target === muteDialog.current && busy === null) {
            setMuteTarget(null);
          }
        }}
      >
        <div className="dialog-head">
          <span className="dialog-icon">
            <span aria-hidden="true">…</span>
          </span>
          <div>
            <h2 id="mute-user-title">禁言 {muteTarget?.name}？</h2>
            <p className="muted small">禁言期间不能发帖或回复，但仍可浏览。</p>
          </div>
        </div>
        <div className="report-body">
          <div className="field">
            <label htmlFor="mute-duration">禁言时长</label>
            <select
              id="mute-duration"
              value={muteHours}
              onChange={(event) => setMuteHours(Number(event.target.value))}
            >
              {MUTE_DURATIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mute-reason">禁言理由（可选）</label>
            <textarea
              id="mute-reason"
              value={muteReason}
              maxLength={500}
              rows={3}
              onChange={(event) => setMuteReason(event.target.value)}
              placeholder="例如：短时间内重复刷屏"
            />
          </div>
        </div>
        <div className="dialog-actions">
          <button
            className="button ghost"
            type="button"
            onClick={() => setMuteTarget(null)}
            disabled={busy !== null}
          >
            取消
          </button>
          <button
            className="button"
            type="button"
            onClick={() => void mute()}
            disabled={busy !== null}
          >
            {busy !== null ? '处理中…' : '确认禁言'}
          </button>
        </div>
      </dialog>

      <ConfirmDialog
        open={unbanTarget !== null}
        title={`解封 ${unbanTarget?.name ?? '该用户'}？`}
        description="将同时解除论坛与游戏封禁。"
        confirmLabel="确认解封"
        busy={busy !== null}
        onConfirm={() => void unban()}
        onCancel={() => setUnbanTarget(null)}
      />
    </section>
  );
}
