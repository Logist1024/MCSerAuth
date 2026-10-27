'use client';

import type { GrowthRules, GrowthRulesPatch, GrowthRulesResponse } from '@mcserauth/shared';
import { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { adminGrowthRules, adminResetGrowthRules, adminUpdateGrowthRules } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import './admin-growth.css';

/**
 * Field metadata mirroring `growthRulesSchema` in `packages/shared/src/growth.ts`
 * (the zod bounds are not exposed as runtime values, so they are restated here).
 */
interface RuleField {
  key: keyof GrowthRules;
  label: string;
  hint: string;
  min: number;
  max: number;
  unit: string;
}

interface RuleGroup {
  name: string;
  fields: RuleField[];
}

const RULE_GROUPS: RuleGroup[] = [
  {
    name: '签到经验',
    fields: [
      {
        key: 'checkinBaseXp',
        label: '每日签到基础经验',
        hint: '每天第一次签到固定获得的经验值。',
        min: 0,
        max: 1000,
        unit: 'XP',
      },
      {
        key: 'checkinStreakXp',
        label: '连签每日额外经验',
        hint: '连续签到每天在基础上追加的经验值。',
        min: 0,
        max: 1000,
        unit: 'XP',
      },
      {
        key: 'checkinStreakXpCap',
        label: '连签经验加成封顶天数',
        hint: '连签额外经验最多累计到第几天为止。',
        min: 0,
        max: 60,
        unit: '天',
      },
    ],
  },
  {
    name: '签到积分',
    fields: [
      {
        key: 'checkinBasePoints',
        label: '每日签到基础积分',
        hint: '每天第一次签到固定获得的积分。',
        min: 0,
        max: 1000,
        unit: '积分',
      },
      {
        key: 'checkinStreakPoints',
        label: '连签每日额外积分',
        hint: '连续签到每天在基础上追加的积分。',
        min: 0,
        max: 1000,
        unit: '积分',
      },
      {
        key: 'checkinStreakPointsCap',
        label: '连签积分加成封顶天数',
        hint: '连签额外积分最多累计到第几天为止。',
        min: 0,
        max: 60,
        unit: '天',
      },
    ],
  },
  {
    name: '发帖回帖',
    fields: [
      {
        key: 'postXp',
        label: '发帖经验',
        hint: '发布一篇新帖子获得的经验值。',
        min: 0,
        max: 1000,
        unit: 'XP',
      },
      {
        key: 'postDailyXpLimit',
        label: '发帖每日计入经验条数上限',
        hint: '每天最多有几篇发帖会计入经验，0 表示关闭。',
        min: 0,
        max: 100,
        unit: '篇',
      },
      {
        key: 'replyXp',
        label: '回帖经验',
        hint: '发布一条回复获得的经验值。',
        min: 0,
        max: 1000,
        unit: 'XP',
      },
      {
        key: 'replyDailyXpLimit',
        label: '回帖每日计入经验条数上限',
        hint: '每天最多有几条回复会计入经验，0 表示关闭。',
        min: 0,
        max: 200,
        unit: '条',
      },
    ],
  },
  {
    name: '翻倍卡',
    fields: [
      {
        key: 'xpBoostMultiplier',
        label: '经验倍率',
        hint: '生效期间签到、发帖、回帖经验的乘数。',
        min: 1,
        max: 10,
        unit: '倍',
      },
      {
        key: 'xpBoostHours',
        label: '单张卡时长',
        hint: '购买或兑换一张卡增加的时长，重复购买顺延。',
        min: 1,
        max: 720,
        unit: '小时',
      },
      {
        key: 'xpBoostPrice',
        label: '翻倍卡售价',
        hint: '积分商店中经验翻倍卡的价格。',
        min: 0,
        max: 1_000_000,
        unit: '积分',
      },
    ],
  },
  {
    name: '披风与 Banner',
    fields: [
      {
        key: 'capeUnlockPrice',
        label: '披风解锁价格',
        hint: '一次性解锁披风上传能力的积分价格。',
        min: 0,
        max: 1_000_000,
        unit: '积分',
      },
      {
        key: 'bannerPrice',
        label: 'Banner 购买价格',
        hint: '提交一条首页 Banner 需要支付的积分，驳回时自动退还。',
        min: 0,
        max: 1_000_000,
        unit: '积分',
      },
      {
        key: 'bannerDays',
        label: 'Banner 展示天数',
        hint: '审核通过后 Banner 在首页展示的时长。',
        min: 1,
        max: 365,
        unit: '天',
      },
      {
        key: 'bannerMaxActive',
        label: '首页同时展示上限',
        hint: '首页一次最多轮播的 Banner 数量。',
        min: 1,
        max: 20,
        unit: '条',
      },
    ],
  },
  {
    name: '打赏',
    fields: [
      {
        key: 'tipMin',
        label: '单次打赏下限',
        hint: '一笔打赏最少要转出多少积分。',
        min: 1,
        max: 1_000_000,
        unit: '积分',
      },
      {
        key: 'tipMax',
        label: '单次打赏上限',
        hint: '一笔打赏最多可转出多少积分。',
        min: 1,
        max: 10_000_000,
        unit: '积分',
      },
    ],
  },
  {
    name: '称号申请',
    fields: [
      {
        key: 'titleApplicationLevel',
        label: '可申请专属称号的等级',
        hint: '达到该等级才会出现称号申请入口。',
        min: 1,
        max: 100,
        unit: '级',
      },
    ],
  },
];

const ALL_FIELDS: RuleField[] = RULE_GROUPS.flatMap((group) => group.fields);

function validate(field: RuleField, raw: string): string | null {
  if (raw.trim() === '') {
    return '请填写数值。';
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return '必须是整数。';
  }
  if (value < field.min || value > field.max) {
    return `取值范围 ${field.min}–${field.max}。`;
  }
  return null;
}

/** Editor for the growth economy knobs (`site.manage`). */
export default function AdminRules() {
  const toast = useToast();
  const [view, setView] = useState<GrowthRulesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Record<keyof GrowthRules, string>>>({});
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setView(await adminGrowthRules());
      setDraft({});
    } catch (error) {
      setLoadError(describeApiError(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const errors: Partial<Record<keyof GrowthRules, string>> = {};
  const changed: Array<[keyof GrowthRules, number]> = [];
  if (view !== null) {
    for (const field of ALL_FIELDS) {
      const raw = draft[field.key];
      if (raw === undefined) {
        continue;
      }
      const message = validate(field, raw);
      if (message !== null) {
        errors[field.key] = message;
        continue;
      }
      if (Number(raw) !== view.rules[field.key]) {
        changed.push([field.key, Number(raw)]);
      }
    }
  }
  const invalidCount = Object.keys(errors).length;

  async function save(): Promise<void> {
    if (view === null) {
      return;
    }
    if (invalidCount > 0) {
      toast.error('请先修正标红的数值再保存。');
      return;
    }
    if (changed.length === 0) {
      toast.info('没有需要保存的改动。');
      return;
    }
    setBusy(true);
    try {
      const patch: GrowthRulesPatch = {};
      for (const [key, value] of changed) {
        patch[key] = value;
      }
      const next = await adminUpdateGrowthRules(patch);
      setView(next);
      setDraft({});
      toast.success(`已保存 ${changed.length} 项规则改动，即时生效。`);
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  async function reset(): Promise<void> {
    setBusy(true);
    try {
      const next = await adminResetGrowthRules();
      setView(next);
      setDraft({});
      toast.success('已恢复全部默认规则。');
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
      setResetOpen(false);
    }
  }

  return (
    <section className="card">
      <div className="section-heading">
        <h2>成长规则</h2>
        <div className="inline-form">
          <button className="button secondary" type="button" onClick={() => void load()}>
            重新读取
          </button>
        </div>
      </div>
      <p className="muted">改动即时生效，影响全站经验与积分的发放、商店价格与 Banner 展示时长。</p>

      {loadError !== null ? (
        <>
          <p className="bad" role="alert">
            {loadError}
          </p>
          <div className="actions">
            <button className="button" type="button" onClick={() => void load()}>
              重试
            </button>
          </div>
        </>
      ) : null}

      {view === null ? <p className="muted">加载中…</p> : null}

      {view !== null ? (
        <>
          <div className="actions">
            <span className={`mg-badge${view.customized ? ' custom' : ''}`}>
              {view.customized ? '本站已自定义部分规则' : '全部使用出厂默认值'}
            </span>
            <span className="muted small">
              待保存改动 {changed.length} 项
              {invalidCount > 0 ? ` · ${invalidCount} 项数值不合法` : ''}
            </span>
          </div>

          {RULE_GROUPS.map((group) => (
            <div className="mg-group" key={group.name}>
              <h3>{group.name}</h3>
              {group.fields.map((field) => {
                const currentValue = draft[field.key] ?? String(view.rules[field.key]);
                const shippedDefault = view.defaults[field.key];
                const isCustomized = view.rules[field.key] !== shippedDefault;
                const message = errors[field.key];
                const inputId = `rule-${field.key}`;
                return (
                  <div className="mg-rule" key={field.key}>
                    <div className="field">
                      <label htmlFor={inputId}>
                        {field.label}（{field.min}–{field.max} {field.unit}）
                      </label>
                      <input
                        id={inputId}
                        type="number"
                        step={1}
                        min={field.min}
                        max={field.max}
                        value={currentValue}
                        disabled={busy}
                        aria-invalid={message !== undefined}
                        aria-describedby={`${inputId}-hint`}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                      <p className="field-hint" id={`${inputId}-hint`}>
                        {field.hint}
                      </p>
                      <div className="mg-rule-base">
                        <span>默认值 {String(shippedDefault)}</span>
                        {isCustomized ? <span className="mg-badge custom">已自定义</span> : null}
                        {message !== undefined ? (
                          <span className="bad" role="alert">
                            {message}
                          </span>
                        ) : null}
                        {currentValue !== String(shippedDefault) ? (
                          <button
                            className="button tiny ghost"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                [field.key]: String(shippedDefault),
                              }))
                            }
                          >
                            用默认值
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="actions">
            <button
              className="button"
              type="button"
              disabled={busy || changed.length === 0 || invalidCount > 0}
              aria-busy={busy}
              onClick={() => void save()}
            >
              {busy ? '保存中…' : `保存改动（${changed.length}）`}
            </button>
            <button
              className="button danger"
              type="button"
              disabled={busy || !view.customized}
              onClick={() => setResetOpen(true)}
            >
              恢复默认
            </button>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={resetOpen}
        tone="danger"
        title="恢复全部默认规则？"
        description="将清除本站所有自定义数值，签到、发帖、商店与 Banner 规则立即回退到出厂设置，此操作不可撤销。"
        confirmLabel="确认恢复默认"
        busy={busy}
        onConfirm={() => void reset()}
        onCancel={() => setResetOpen(false)}
      />
    </section>
  );
}
