'use client';

import {
  BANNER_STATUSES,
  hasAdminPermission,
  type AdminBannerOverview,
  type AdminPermission,
  type AdminTitleOverview,
  type BannerStatus,
  type BannerSummary,
  type TitleApplicationStatus,
  type TitleApplicationSummary,
  type UserRole,
} from '@mcserauth/shared';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import ConfirmDialog from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import {
  adminAdjustPoints,
  adminCreateTitle,
  adminGrantTitle,
  adminGrowthBanners,
  adminGrowthTitles,
  adminRevokeTitle,
  adminReviewBanner,
  adminReviewTitleApplication,
} from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import './admin-growth.css';

type TitleItem = AdminTitleOverview['titles'][number];

const APPLICATION_STATUS_LABELS: Record<TitleApplicationStatus, string> = {
  pending: '待处理',
  approved: '已通过',
  rejected: '已驳回',
};

const BANNER_STATUS_LABELS: Record<BannerStatus, string> = {
  pending: '待审核',
  approved: '展示中',
  rejected: '已驳回',
  expired: '已过期',
};

const DEFAULT_TITLE_COLOR = '#8b5cf6';

interface RevokeTarget {
  titleId: number;
  titleName: string;
  userId: string;
  holderName: string;
}

/** Special titles with holders plus the create / grant / revoke controls. */
function TitleDesk({
  overview,
  reload,
}: {
  overview: AdminTitleOverview;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(DEFAULT_TITLE_COLOR);
  const [grantIds, setGrantIds] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    setError(null);
    if (trimmedName.length < 2 || trimmedName.length > 20) {
      setError('称号名称需要 2–20 个字符。');
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color.trim())) {
      setError('颜色必须是 #RRGGBB 格式。');
      return;
    }
    setBusy('create');
    try {
      await adminCreateTitle({
        name: trimmedName,
        description: description.trim() === '' ? null : description.trim(),
        color: color.trim(),
      });
      toast.success(`称号「${trimmedName}」已创建。`);
      setName('');
      setDescription('');
      setColor(DEFAULT_TITLE_COLOR);
      await reload();
    } catch (createError) {
      setError(describeApiError(createError));
    } finally {
      setBusy(null);
    }
  }

  async function grant(title: TitleItem): Promise<void> {
    const userId = (grantIds[title.id] ?? '').trim();
    setError(null);
    if (userId === '') {
      setError(`请先填写要授予「${title.name}」的用户 ID。`);
      return;
    }
    setBusy(`grant-${title.id}`);
    try {
      await adminGrantTitle(title.id, userId);
      toast.success(`已授予 ${userId} 称号「${title.name}」。`);
      setGrantIds((current) => ({ ...current, [title.id]: '' }));
      await reload();
    } catch (grantError) {
      setError(describeApiError(grantError));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(): Promise<void> {
    if (revokeTarget === null) {
      return;
    }
    setBusy('revoke');
    setError(null);
    try {
      await adminRevokeTitle(revokeTarget.titleId, revokeTarget.userId);
      toast.success(`已收回 ${revokeTarget.holderName} 的称号「${revokeTarget.titleName}」。`);
      setRevokeTarget(null);
      await reload();
    } catch (revokeError) {
      setError(describeApiError(revokeError));
      setRevokeTarget(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card mg-section">
      <div className="mg-section-head">
        <h3>特别称号</h3>
        <span className="muted small">共 {overview.titles.length} 个称号</span>
      </div>
      <p className="mg-desc">
        特别称号会让账号脱离等级体系（不获得经验、不参与排行榜）。新建后可按用户 ID
        授予，授予与收回都会给对方发送站内通知。
      </p>

      <form className="stack" onSubmit={create}>
        <div className="mg-grid-3">
          <div className="field">
            <label htmlFor="title-name">称号名称（2–20 字）</label>
            <input
              id="title-name"
              value={name}
              maxLength={20}
              placeholder="例如：开服元老"
              onChange={(event) => setName(event.target.value)}
              disabled={busy !== null}
            />
          </div>
          <div className="field">
            <label htmlFor="title-color">颜色（#RRGGBB）</label>
            <input
              id="title-color"
              value={color}
              maxLength={7}
              pattern="#[0-9a-fA-F]{6}"
              placeholder={DEFAULT_TITLE_COLOR}
              onChange={(event) => setColor(event.target.value)}
              disabled={busy !== null}
            />
          </div>
          <div className="field">
            <label htmlFor="title-description">说明（可选，200 字内）</label>
            <input
              id="title-description"
              value={description}
              maxLength={200}
              onChange={(event) => setDescription(event.target.value)}
              disabled={busy !== null}
            />
          </div>
        </div>
        <div className="actions">
          <button
            className="button"
            type="submit"
            disabled={busy !== null}
            aria-busy={busy === 'create'}
          >
            新建称号
          </button>
        </div>
      </form>

      {error !== null ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mg-list">
        {overview.titles.map((title) => (
          <li className="mg-row" key={title.id}>
            <div className="mg-row-body">
              <p className="mg-row-title">
                <span
                  className="mg-color-dot"
                  style={{ background: title.color }}
                  aria-hidden="true"
                />
                {title.name}
                <span className="mg-badge">
                  {title.kind === 'special' ? '特别称号' : '专属称号'}
                </span>
                <span className="muted small">#{title.id}</span>
              </p>
              <p className="mg-row-meta">{title.description ?? '无说明'}</p>
              <div className="mg-holders">
                {title.holders.length === 0 ? (
                  <span className="muted small">暂无人持有</span>
                ) : (
                  title.holders.map((holder) => (
                    <span className="mg-holder" key={holder.userId}>
                      {holder.name}
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          setRevokeTarget({
                            titleId: title.id,
                            titleName: title.name,
                            userId: holder.userId,
                            holderName: holder.name,
                          })
                        }
                      >
                        收回
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="mg-row-actions">
              <div className="field">
                <label htmlFor={`grant-${title.id}`}>授予给用户 ID</label>
                <input
                  id={`grant-${title.id}`}
                  value={grantIds[title.id] ?? ''}
                  placeholder="用户 ID"
                  onChange={(event) =>
                    setGrantIds((current) => ({ ...current, [title.id]: event.target.value }))
                  }
                  disabled={busy !== null}
                />
              </div>
              <button
                className="button tiny secondary"
                type="button"
                disabled={busy !== null}
                aria-busy={busy === `grant-${title.id}`}
                onClick={() => void grant(title)}
              >
                授予
              </button>
            </div>
          </li>
        ))}
      </ul>
      {overview.titles.length === 0 ? <p className="mg-empty">还没有任何称号。</p> : null}

      <ConfirmDialog
        open={revokeTarget !== null}
        tone="danger"
        title={`收回「${revokeTarget?.titleName ?? ''}」？`}
        description={`将从 ${revokeTarget?.holderName ?? ''} 身上收回该称号，对方会收到通知。`}
        confirmLabel="确认收回"
        busy={busy === 'revoke'}
        onConfirm={() => void revoke()}
        onCancel={() => setRevokeTarget(null)}
      />
    </section>
  );
}

/** Level-100 custom title application queue. */
function ApplicationQueue({
  overview,
  reload,
}: {
  overview: AdminTitleOverview;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = overview.applications.filter((item) => item.status === 'pending');
  const reviewed = overview.applications.filter((item) => item.status !== 'pending');

  async function review(application: TitleApplicationSummary, approve: boolean): Promise<void> {
    setBusy(application.id);
    setError(null);
    try {
      await adminReviewTitleApplication(application.id, approve);
      toast.success(
        approve
          ? `已通过「${application.proposedName}」，称号已自动授予 ${application.userName}。`
          : `已驳回 ${application.userName} 的称号申请。`,
      );
      await reload();
    } catch (reviewError) {
      setError(describeApiError(reviewError));
    } finally {
      setBusy(null);
    }
  }

  function renderRow(application: TitleApplicationSummary): ReactNode {
    return (
      <li className="mg-row" key={application.id}>
        <div className="mg-row-body">
          <p className="mg-row-title">
            {application.proposedName}
            <span className={`mg-badge${application.status === 'pending' ? ' on' : ''}`}>
              {APPLICATION_STATUS_LABELS[application.status]}
            </span>
            <span className="muted small">#{application.id}</span>
          </p>
          <p className="mg-row-meta">
            申请人：{application.userName}（{application.userId}） · 提交于{' '}
            {formatDateTime(application.createdAt)}
            {application.resultTitle ? ` · 生成称号「${application.resultTitle.name}」` : ''}
            {application.reviewedAt ? ` · 处理于 ${formatDateTime(application.reviewedAt)}` : ''}
          </p>
          <p className="mg-row-meta">理由：{application.reason}</p>
        </div>
        {application.status === 'pending' ? (
          <div className="mg-row-actions">
            <button
              className="button tiny"
              type="button"
              disabled={busy !== null}
              aria-busy={busy === application.id}
              onClick={() => void review(application, true)}
            >
              通过
            </button>
            <button
              className="button tiny danger"
              type="button"
              disabled={busy !== null}
              aria-busy={busy === application.id}
              onClick={() => void review(application, false)}
            >
              驳回
            </button>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <section className="card mg-section">
      <div className="mg-section-head">
        <h3>满级称号申请</h3>
        <span className="muted small">待处理 {pending.length} 条</span>
      </div>
      <p className="mg-desc">
        达到申请等级的玩家可提交专属称号申请；通过后系统会自动创建同名称号并授予申请人。列表仅展示最近
        50 条。
      </p>
      {error !== null ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}

      {pending.length === 0 ? (
        <p className="mg-empty">当前没有待处理的称号申请。</p>
      ) : (
        <ul className="mg-list">{pending.map(renderRow)}</ul>
      )}

      {reviewed.length > 0 ? (
        <>
          <div className="mg-section-head late">
            <h3>历史申请</h3>
          </div>
          <ul className="mg-list">{reviewed.map(renderRow)}</ul>
        </>
      ) : null}
    </section>
  );
}

/** Banner review queue with a status filter; rejecting refunds the spend. */
function BannerQueue() {
  const toast = useToast();
  const [status, setStatus] = useState<BannerStatus | 'all'>('pending');
  const [data, setData] = useState<AdminBannerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminGrowthBanners(status === 'all' ? undefined : status));
    } catch (loadError) {
      setError(describeApiError(loadError));
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(banner: BannerSummary, approve: boolean): Promise<void> {
    setBusy(banner.id);
    setError(null);
    try {
      await adminReviewBanner(banner.id, approve);
      toast.success(
        approve
          ? `Banner「${banner.title}」已上线展示。`
          : `Banner「${banner.title}」已驳回，购买积分已自动退还给 ${banner.ownerName}。`,
      );
      await load();
    } catch (reviewError) {
      setError(describeApiError(reviewError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card mg-section">
      <div className="mg-section-head">
        <h3>Banner 审核</h3>
        <div className="inline-form">
          <label htmlFor="banner-status" className="sr-only">
            按状态筛选 Banner
          </label>
          <select
            id="banner-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as BannerStatus | 'all')}
          >
            <option value="all">全部状态</option>
            {BANNER_STATUSES.map((item) => (
              <option key={item} value={item}>
                {BANNER_STATUS_LABELS[item]}
              </option>
            ))}
          </select>
          <button className="button secondary" type="button" onClick={() => void load()}>
            刷新
          </button>
        </div>
      </div>
      <p className="mg-desc">
        玩家用积分购买 Banner 位后进入待审核队列。通过即开始按展示天数计时；
        <strong>驳回会自动把积分退还给购买者</strong>，无需另外调账。
      </p>
      {error !== null ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}
      {data === null ? <p className="muted">加载中…</p> : null}
      {data !== null && data.banners.length === 0 ? (
        <p className="mg-empty">当前筛选条件下没有 Banner。</p>
      ) : null}
      {data !== null && data.banners.length > 0 ? (
        <ul className="mg-list">
          {data.banners.map((banner) => (
            <li className="mg-row" key={banner.id}>
              <div className="mg-row-body">
                <p className="mg-row-title">
                  {banner.title}
                  <span className={`mg-badge${banner.status === 'pending' ? ' on' : ''}`}>
                    {BANNER_STATUS_LABELS[banner.status]}
                  </span>
                  <span className="muted small">#{banner.id}</span>
                </p>
                <p className="mg-row-meta">
                  提交者：{banner.ownerName}（{banner.userId}） · 创建于{' '}
                  {formatDateTime(banner.createdAt)}
                  {banner.href ? ` · 链接 ${banner.href}` : ' · 无跳转链接'}
                  {banner.endsAt
                    ? ` · 展示至 ${formatDateTime(banner.endsAt)}`
                    : banner.startsAt
                      ? ` · 自 ${formatDateTime(banner.startsAt)}`
                      : ''}
                </p>
                <p className="mg-row-meta">{banner.description ?? '无描述'}</p>
              </div>
              {banner.status === 'pending' ? (
                <div className="mg-row-actions">
                  <button
                    className="button tiny"
                    type="button"
                    disabled={busy !== null}
                    aria-busy={busy === banner.id}
                    onClick={() => void review(banner, true)}
                  >
                    通过
                  </button>
                  <button
                    className="button tiny danger"
                    type="button"
                    disabled={busy !== null}
                    aria-busy={busy === banner.id}
                    onClick={() => void review(banner, false)}
                  >
                    驳回并退积分
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Manual point ledger adjustment. */
function PointAdjust() {
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ userId: string; points: number } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setBalance(null);
    const target = userId.trim();
    if (target === '') {
      setError('请填写要调整积分的用户 ID。');
      return;
    }
    const value = Number(amount.trim());
    if (!Number.isInteger(value) || value === 0) {
      setError('变动数量必须是不等于 0 的整数。');
      return;
    }
    if (value < -100_000 || value > 100_000) {
      setError('单次调整范围在 -100000 到 100000 之间。');
      return;
    }
    setBusy(true);
    try {
      const result = await adminAdjustPoints(target, {
        amount: value,
        memo: memo.trim() === '' ? undefined : memo.trim(),
      });
      setBalance({ userId: result.userId, points: result.points });
      toast.success(
        `${target} 的积分已${value > 0 ? '增加' : '减少'} ${Math.abs(value)}，当前余额 ${result.points}。`,
      );
      setAmount('');
      setMemo('');
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mg-section">
      <div className="mg-section-head">
        <h3>积分调账</h3>
      </div>
      <p className="mg-desc">
        正数发放、负数扣减，单笔上限 ±100000。每次调账都会写入积分流水并通知对方，请务必填写备注。
      </p>
      <form className="stack" onSubmit={submit}>
        <div className="mg-grid-3">
          <div className="field">
            <label htmlFor="points-user">用户 ID</label>
            <input
              id="points-user"
              value={userId}
              placeholder="例如：usr_2m..."
              onChange={(event) => setUserId(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="points-amount">变动数量（正加负减）</label>
            <input
              id="points-amount"
              type="number"
              step={1}
              min={-100_000}
              max={100_000}
              value={amount}
              placeholder="+500 或 -500"
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="points-memo">备注（200 字内）</label>
            <input
              id="points-memo"
              value={memo}
              maxLength={200}
              placeholder="活动补偿 / 违规扣减"
              onChange={(event) => setMemo(event.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <div className="actions">
          <button className="button" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? '提交中…' : '提交调账'}
          </button>
        </div>
      </form>
      {error !== null ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}
      {balance !== null ? (
        <p className="ok" role="status">
          {balance.userId} 当前积分余额：{balance.points}
        </p>
      ) : null}
    </section>
  );
}

/** Growth economy desk: titles, applications, banners and point adjustments. */
export default function AdminGrowth({
  role,
  permissions,
}: {
  role: UserRole;
  permissions: readonly AdminPermission[];
}) {
  const canTitles = hasAdminPermission(role, permissions, 'titles.manage');
  const canBanners = hasAdminPermission(role, permissions, 'banners.manage');
  const canPoints = hasAdminPermission(role, permissions, 'points.adjust');

  const [overview, setOverview] = useState<AdminTitleOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOverviewError(null);
    try {
      setOverview(await adminGrowthTitles());
    } catch (error) {
      setOverviewError(describeApiError(error));
    }
  }, []);

  useEffect(() => {
    if (canTitles) {
      void loadOverview();
    }
  }, [canTitles, loadOverview]);

  if (!canTitles && !canBanners && !canPoints) {
    return (
      <section className="card">
        <h2>成长台</h2>
        <p className="bad" role="alert">
          当前账号没有被下放「称号」「Banner 审核」「积分调整」中的任何一项能力，请联系超级管理员。
        </p>
      </section>
    );
  }

  return (
    <div className="mg-stack">
      <section className="card">
        <div className="section-heading">
          <h2>成长台</h2>
          <span className="muted small">称号 · 申请 · Banner · 积分</span>
        </div>
        <p className="muted">
          这里处理成长经济的人工介入：特别称号授予与收回、满级专属称号申请、首页 Banner
          审核，以及积分调账。规则数值请在「成长规则」分区修改。
        </p>
      </section>

      {canTitles ? (
        overview === null ? (
          <section className="card">
            <h2>称号与申请</h2>
            {overviewError !== null ? (
              <p className="bad" role="alert">
                {overviewError}
              </p>
            ) : (
              <p className="muted">加载中…</p>
            )}
            {overviewError !== null ? (
              <div className="actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void loadOverview()}
                >
                  重试
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <TitleDesk overview={overview} reload={loadOverview} />
            <ApplicationQueue overview={overview} reload={loadOverview} />
          </>
        )
      ) : (
        <section className="card">
          <h2>称号与申请</h2>
          <p className="muted">需要 titles.manage 能力，当前账号未获授权。</p>
        </section>
      )}

      {canBanners ? (
        <BannerQueue />
      ) : (
        <section className="card">
          <h2>Banner 审核</h2>
          <p className="muted">需要 banners.manage 能力，当前账号未获授权。</p>
        </section>
      )}

      {canPoints ? (
        <PointAdjust />
      ) : (
        <section className="card">
          <h2>积分调账</h2>
          <p className="muted">需要 points.adjust 能力，当前账号未获授权。</p>
        </section>
      )}
    </div>
  );
}
