'use client';

import { HOME_CONTENT_LIMITS, type BannerSummary, type HomeContent } from '@mcserauth/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useToast } from '@/components/toast';
import { adminUpdateSiteSettings, fetchPublicHome } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import './admin-growth.css';

/**
 * Field length mirror of `homeContentSchema` (packages/shared/src/site.ts);
 * the schema itself does not expose the numbers as runtime values.
 */
const LENGTHS = {
  heroEyebrow: 80,
  heroTitle: 60,
  heroText: 300,
  actionLabel: 30,
  href: 300,
  statLabel: 30,
  statValue: 40,
  step: 200,
  entryTitle: 40,
  entryDescription: 200,
  entryActionLabel: 30,
} as const;

const HREF_PATTERN = /^(\/(?!\/)|https?:\/\/)/i;

const BLANK_TEMPLATE: HomeContent = {
  heroEyebrow: '',
  heroTitle: '',
  heroText: '',
  primaryAction: { label: '', href: '/' },
  secondaryAction: { label: '', href: '/' },
  stats: [],
  steps: [],
  entries: [],
};

type Errors = Record<string, string>;

function checkText(errors: Errors, path: string, value: string, max: number, label: string): void {
  const trimmed = value.trim();
  if (trimmed === '') {
    errors[path] = `${label}不能为空。`;
    return;
  }
  if (trimmed.length > max) {
    errors[path] = `${label}不能超过 ${max} 个字符。`;
  }
}

function checkHref(errors: Errors, path: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed === '') {
    errors[path] = '链接不能为空。';
    return;
  }
  if (trimmed.length > LENGTHS.href) {
    errors[path] = `链接不能超过 ${LENGTHS.href} 个字符。`;
    return;
  }
  if (!HREF_PATTERN.test(trimmed)) {
    errors[path] = '链接必须以 / 或 http(s):// 开头（不支持 // 开头的协议相对地址）。';
  }
}

function validate(content: HomeContent): Errors {
  const errors: Errors = {};
  if (content.heroEyebrow.trim().length > LENGTHS.heroEyebrow) {
    errors['heroEyebrow'] = `眉标不能超过 ${LENGTHS.heroEyebrow} 个字符。`;
  }
  checkText(errors, 'heroTitle', content.heroTitle, LENGTHS.heroTitle, '主标题');
  if (content.heroText.trim().length > LENGTHS.heroText) {
    errors['heroText'] = `副标题文案不能超过 ${LENGTHS.heroText} 个字符。`;
  }
  checkText(
    errors,
    'primaryAction.label',
    content.primaryAction.label,
    LENGTHS.actionLabel,
    '主按钮文案',
  );
  checkHref(errors, 'primaryAction.href', content.primaryAction.href);
  checkText(
    errors,
    'secondaryAction.label',
    content.secondaryAction.label,
    LENGTHS.actionLabel,
    '次按钮文案',
  );
  checkHref(errors, 'secondaryAction.href', content.secondaryAction.href);

  if (content.stats.length > HOME_CONTENT_LIMITS.stats) {
    errors.stats = `数据条最多 ${HOME_CONTENT_LIMITS.stats} 项。`;
  }
  content.stats.forEach((item, index) => {
    checkText(errors, `stats.${index}.label`, item.label, LENGTHS.statLabel, '数据条名称');
    checkText(errors, `stats.${index}.value`, item.value, LENGTHS.statValue, '数据条数值');
  });

  if (content.steps.length > HOME_CONTENT_LIMITS.steps) {
    errors.steps = `接入步骤最多 ${HOME_CONTENT_LIMITS.steps} 条。`;
  }
  content.steps.forEach((item, index) => {
    checkText(errors, `steps.${index}`, item, LENGTHS.step, '步骤文案');
  });

  if (content.entries.length > HOME_CONTENT_LIMITS.entries) {
    errors.entries = `入口卡片最多 ${HOME_CONTENT_LIMITS.entries} 项。`;
  }
  content.entries.forEach((item, index) => {
    checkText(errors, `entries.${index}.title`, item.title, LENGTHS.entryTitle, '入口标题');
    if (item.description.trim().length > LENGTHS.entryDescription) {
      errors[`entries.${index}.description`] =
        `入口简介不能超过 ${LENGTHS.entryDescription} 个字符。`;
    }
    checkHref(errors, `entries.${index}.href`, item.href);
    checkText(
      errors,
      `entries.${index}.actionLabel`,
      item.actionLabel,
      LENGTHS.entryActionLabel,
      '入口按钮文案',
    );
  });

  return errors;
}

function TextField({
  id,
  label,
  value,
  maxLength,
  error,
  disabled,
  textarea = false,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  error?: string;
  disabled: boolean;
  textarea?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {textarea ? (
        <textarea
          id={id}
          value={value}
          rows={3}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error !== undefined}
          aria-describedby={error !== undefined ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error !== undefined}
          aria-describedby={error !== undefined ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error !== undefined ? (
        <span className="bad small" id={hintId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** A repeatable block: heading, item count, add / remove controls. */
function Block({
  title,
  limit,
  count,
  disabled,
  onAdd,
  children,
}: {
  title: string;
  limit: number;
  count: number;
  disabled: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mg-group">
      <div className="mg-section-head">
        <h3>{title}</h3>
        <div className="mg-row-actions">
          <span className="muted small">
            {count} / {limit}
          </span>
          <button
            className="button tiny secondary"
            type="button"
            disabled={disabled || count >= limit}
            onClick={onAdd}
          >
            添加一项
          </button>
        </div>
      </div>
      {count === 0 ? <p className="mg-empty">该区块暂无内容，前台会隐藏这一块。</p> : null}
      {children}
    </div>
  );
}

function ItemShell({
  index,
  disabled,
  onRemove,
  children,
}: {
  index: number;
  disabled: boolean;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mg-item">
      <div className="mg-item-head">
        <span>第 {index + 1} 项</span>
        <button className="button tiny danger" type="button" disabled={disabled} onClick={onRemove}>
          删除
        </button>
      </div>
      {children}
    </div>
  );
}

/** Landing page content editor (`site.manage`). */
export default function AdminHome() {
  const toast = useToast();
  const [content, setContent] = useState<HomeContent | null>(null);
  const [banners, setBanners] = useState<BannerSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const home = await fetchPublicHome();
      setContent(home.content);
      setBanners(home.banners);
      setErrors({});
    } catch (error) {
      setLoadError(describeApiError(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(next: Partial<HomeContent>): void {
    setContent((current) => (current === null ? current : { ...current, ...next }));
  }

  async function save(): Promise<void> {
    if (content === null) {
      return;
    }
    const normalized: HomeContent = {
      ...content,
      heroEyebrow: content.heroEyebrow.trim(),
      heroTitle: content.heroTitle.trim(),
      heroText: content.heroText.trim(),
      primaryAction: {
        label: content.primaryAction.label.trim(),
        href: content.primaryAction.href.trim(),
      },
      secondaryAction: {
        label: content.secondaryAction.label.trim(),
        href: content.secondaryAction.href.trim(),
      },
      stats: content.stats.map((item) => ({
        label: item.label.trim(),
        value: item.value.trim(),
      })),
      steps: content.steps.map((item) => item.trim()),
      entries: content.entries.map((item) => ({
        title: item.title.trim(),
        description: item.description.trim(),
        href: item.href.trim(),
        actionLabel: item.actionLabel.trim(),
      })),
    };
    const nextErrors = validate(normalized);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error('首页内容有校验未通过项，请检查标红的字段。');
      return;
    }
    setBusy(true);
    try {
      await adminUpdateSiteSettings({ homeContent: normalized });
      setContent(normalized);
      toast.success('首页内容已保存，前台约 15 秒内生效。');
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  if (loadError !== null) {
    return (
      <section className="card">
        <h2>首页内容</h2>
        <p className="bad" role="alert">
          {loadError}
        </p>
        <div className="actions">
          <button className="button" type="button" onClick={() => void load()}>
            重试
          </button>
        </div>
      </section>
    );
  }

  if (content === null) {
    return (
      <section className="card">
        <h2>首页内容</h2>
        <p className="muted">加载中…</p>
      </section>
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <section className="card">
      <div className="section-heading">
        <h2>首页内容</h2>
        <div className="inline-form">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void load()}
          >
            放弃改动并重新读取
          </button>
        </div>
      </div>
      <p className="muted">
        编辑首页首屏、数据条、加入步骤与入口卡片；留空的区块会被前台隐藏。链接必须以 / 或 http(s)://
        开头，条数受各区块上限约束。当前首页展示中的 Banner：{banners.length} 条。
      </p>

      {errorCount > 0 ? (
        <p className="bad" role="alert">
          有 {errorCount} 处内容不符合要求，已在对应字段下方标出。
        </p>
      ) : null}

      <div className="mg-group">
        <h3>首屏 Hero</h3>
        <div className="mg-grid-2">
          <TextField
            id="home-hero-eyebrow"
            label={`眉标（最多 ${LENGTHS.heroEyebrow} 字）`}
            value={content.heroEyebrow}
            maxLength={LENGTHS.heroEyebrow}
            error={errors.heroEyebrow}
            disabled={busy}
            onChange={(value) => patch({ heroEyebrow: value })}
          />
          <TextField
            id="home-hero-title"
            label={`主标题（必填，最多 ${LENGTHS.heroTitle} 字）`}
            value={content.heroTitle}
            maxLength={LENGTHS.heroTitle}
            error={errors.heroTitle}
            disabled={busy}
            onChange={(value) => patch({ heroTitle: value })}
          />
        </div>
        <TextField
          id="home-hero-text"
          label={`说明文案（最多 ${LENGTHS.heroText} 字）`}
          value={content.heroText}
          maxLength={LENGTHS.heroText}
          error={errors.heroText}
          disabled={busy}
          textarea
          onChange={(value) => patch({ heroText: value })}
        />
      </div>

      <div className="mg-group">
        <h3>行动按钮</h3>
        <div className="mg-grid-2">
          <TextField
            id="home-primary-label"
            label="主按钮文案"
            value={content.primaryAction.label}
            maxLength={LENGTHS.actionLabel}
            error={errors['primaryAction.label']}
            disabled={busy}
            onChange={(value) =>
              patch({ primaryAction: { ...content.primaryAction, label: value } })
            }
          />
          <TextField
            id="home-primary-href"
            label="主按钮链接"
            value={content.primaryAction.href}
            maxLength={LENGTHS.href}
            error={errors['primaryAction.href']}
            disabled={busy}
            placeholder="/forum 或 https://example.com"
            onChange={(value) =>
              patch({ primaryAction: { ...content.primaryAction, href: value } })
            }
          />
          <TextField
            id="home-secondary-label"
            label="次按钮文案"
            value={content.secondaryAction.label}
            maxLength={LENGTHS.actionLabel}
            error={errors['secondaryAction.label']}
            disabled={busy}
            onChange={(value) =>
              patch({ secondaryAction: { ...content.secondaryAction, label: value } })
            }
          />
          <TextField
            id="home-secondary-href"
            label="次按钮链接"
            value={content.secondaryAction.href}
            maxLength={LENGTHS.href}
            error={errors['secondaryAction.href']}
            disabled={busy}
            placeholder="/textures"
            onChange={(value) =>
              patch({ secondaryAction: { ...content.secondaryAction, href: value } })
            }
          />
        </div>
      </div>

      <Block
        title="数据条 stats"
        limit={HOME_CONTENT_LIMITS.stats}
        count={content.stats.length}
        disabled={busy}
        onAdd={() => patch({ stats: [...content.stats, { label: '', value: '' }] })}
      >
        {content.stats.map((item, index) => (
          <ItemShell
            key={`stat-${index}`}
            index={index}
            disabled={busy}
            onRemove={() => patch({ stats: content.stats.filter((_, i) => i !== index) })}
          >
            <div className="mg-grid-2">
              <TextField
                id={`home-stat-${index}-label`}
                label="名称"
                value={item.label}
                maxLength={LENGTHS.statLabel}
                error={errors[`stats.${index}.label`]}
                disabled={busy}
                onChange={(value) =>
                  patch({
                    stats: content.stats.map((row, i) =>
                      i === index ? { ...row, label: value } : row,
                    ),
                  })
                }
              />
              <TextField
                id={`home-stat-${index}-value`}
                label="数值"
                value={item.value}
                maxLength={LENGTHS.statValue}
                error={errors[`stats.${index}.value`]}
                disabled={busy}
                onChange={(value) =>
                  patch({
                    stats: content.stats.map((row, i) => (i === index ? { ...row, value } : row)),
                  })
                }
              />
            </div>
          </ItemShell>
        ))}
      </Block>

      <Block
        title="接入步骤 steps"
        limit={HOME_CONTENT_LIMITS.steps}
        count={content.steps.length}
        disabled={busy}
        onAdd={() => patch({ steps: [...content.steps, ''] })}
      >
        {content.steps.map((item, index) => (
          <ItemShell
            key={`step-${index}`}
            index={index}
            disabled={busy}
            onRemove={() => patch({ steps: content.steps.filter((_, i) => i !== index) })}
          >
            <TextField
              id={`home-step-${index}`}
              label="步骤文案"
              value={item}
              maxLength={LENGTHS.step}
              error={errors[`steps.${index}`]}
              disabled={busy}
              onChange={(value) =>
                patch({ steps: content.steps.map((row, i) => (i === index ? value : row)) })
              }
            />
          </ItemShell>
        ))}
      </Block>

      <Block
        title="入口卡片 entries"
        limit={HOME_CONTENT_LIMITS.entries}
        count={content.entries.length}
        disabled={busy}
        onAdd={() =>
          patch({
            entries: [
              ...content.entries,
              { title: '', description: '', href: '/', actionLabel: '' },
            ],
          })
        }
      >
        {content.entries.map((item, index) => (
          <ItemShell
            key={`entry-${index}`}
            index={index}
            disabled={busy}
            onRemove={() => patch({ entries: content.entries.filter((_, i) => i !== index) })}
          >
            <div className="mg-grid-2">
              <TextField
                id={`home-entry-${index}-title`}
                label="入口标题"
                value={item.title}
                maxLength={LENGTHS.entryTitle}
                error={errors[`entries.${index}.title`]}
                disabled={busy}
                onChange={(value) =>
                  patch({
                    entries: content.entries.map((row, i) =>
                      i === index ? { ...row, title: value } : row,
                    ),
                  })
                }
              />
              <TextField
                id={`home-entry-${index}-action`}
                label="按钮文案"
                value={item.actionLabel}
                maxLength={LENGTHS.entryActionLabel}
                error={errors[`entries.${index}.actionLabel`]}
                disabled={busy}
                onChange={(value) =>
                  patch({
                    entries: content.entries.map((row, i) =>
                      i === index ? { ...row, actionLabel: value } : row,
                    ),
                  })
                }
              />
              <TextField
                id={`home-entry-${index}-href`}
                label="链接"
                value={item.href}
                maxLength={LENGTHS.href}
                error={errors[`entries.${index}.href`]}
                disabled={busy}
                placeholder="/forum 或 https://example.com"
                onChange={(value) =>
                  patch({
                    entries: content.entries.map((row, i) =>
                      i === index ? { ...row, href: value } : row,
                    ),
                  })
                }
              />
            </div>
            <TextField
              id={`home-entry-${index}-description`}
              label="简介（可留空）"
              value={item.description}
              maxLength={LENGTHS.entryDescription}
              error={errors[`entries.${index}.description`]}
              disabled={busy}
              textarea
              onChange={(value) =>
                patch({
                  entries: content.entries.map((row, i) =>
                    i === index ? { ...row, description: value } : row,
                  ),
                })
              }
            />
          </ItemShell>
        ))}
      </Block>

      <div className="actions">
        <button
          className="button"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void save()}
        >
          {busy ? '保存中…' : '保存首页内容'}
        </button>
        <button
          className="button ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            setContent(BLANK_TEMPLATE);
            setErrors({});
            toast.info('已填入空白模板，保存前请补全必填项。');
          }}
        >
          使用空白模板
        </button>
      </div>
    </section>
  );
}
