'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ShopItem, UserProgressSummary } from '@mcserauth/shared';
import { purchaseGrowthItem } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import ConfirmDialog from '@/components/confirm-dialog';
import { Icon } from '@/components/icons';
import Spinner from '@/components/spinner';
import { useToast } from '@/components/toast';

export default function ShopPanel({
  shop,
  progress,
  onProgress,
}: {
  shop: ShopItem[];
  progress: UserProgressSummary;
  onProgress: (next: UserProgressSummary) => void;
}) {
  const toast = useToast();
  const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerDescription, setBannerDescription] = useState('');
  const [bannerHref, setBannerHref] = useState('');
  const [busy, setBusy] = useState(false);

  function isOwned(item: ShopItem): boolean {
    return item.key === 'cape_unlock' && progress.capeUnlocked;
  }

  async function runPurchase(body: Parameters<typeof purchaseGrowthItem>[0]): Promise<boolean> {
    setBusy(true);
    try {
      const result = await purchaseGrowthItem(body);
      onProgress(result.progress);
      toast.success(result.message);
      return true;
    } catch (error) {
      toast.error(describeApiError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmPurchase(): Promise<void> {
    if (confirmItem === null) {
      return;
    }
    const ok = await runPurchase({ item: confirmItem.key });
    if (ok) {
      setConfirmItem(null);
    }
  }

  async function submitBanner(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const title = bannerTitle.trim();
    if (title === '') {
      toast.error('请填写 Banner 标题。');
      return;
    }
    const ok = await runPurchase({
      item: 'banner',
      bannerTitle: title,
      bannerDescription: bannerDescription.trim() === '' ? undefined : bannerDescription.trim(),
      bannerHref: bannerHref.trim() === '' ? undefined : bannerHref.trim(),
    });
    if (ok) {
      setBannerOpen(false);
      setBannerTitle('');
      setBannerDescription('');
      setBannerHref('');
    }
  }

  return (
    <section className="card" aria-labelledby="growth-shop-title">
      <div className="panel-head">
        <h2 id="growth-shop-title">积分商店</h2>
        <span className="panel-meta">余额 {progress.points} 积分</span>
      </div>

      {shop.length === 0 ? (
        <p className="growth-section-note">商店暂未开放。</p>
      ) : (
        <div className="shop-grid">
          {shop.map((item) => {
            const owned = isOwned(item);
            const affordable = progress.points >= item.price;
            const bannerIsThis = item.key === 'banner';
            return (
              <div className="shop-item" key={item.key}>
                <div className="shop-item-head">
                  <span className="shop-item-name">{item.name}</span>
                  <span className="shop-item-price">{item.price} 积分</span>
                </div>
                <p className="shop-item-desc">{item.description}</p>
                <div className="actions">
                  {owned ? (
                    <button className="button ghost small" type="button" disabled>
                      已解锁
                    </button>
                  ) : bannerIsThis ? (
                    <button
                      className="button secondary small"
                      type="button"
                      onClick={() => setBannerOpen((open) => !open)}
                      disabled={busy}
                      aria-expanded={bannerOpen}
                    >
                      <Icon name="plus" width={15} height={15} />
                      {bannerOpen ? '取消' : '购买并填写'}
                    </button>
                  ) : (
                    <button
                      className="button primary small"
                      type="button"
                      onClick={() => setConfirmItem(item)}
                      disabled={busy || !affordable}
                    >
                      {affordable ? '购买' : '积分不足'}
                    </button>
                  )}
                </div>

                {bannerIsThis && bannerOpen ? (
                  <form className="banner-form" onSubmit={submitBanner}>
                    <div className="field">
                      <label htmlFor="banner-title">Banner 标题 *</label>
                      <input
                        id="banner-title"
                        value={bannerTitle}
                        maxLength={80}
                        onChange={(e) => setBannerTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="banner-desc">描述（选填）</label>
                      <textarea
                        id="banner-desc"
                        value={bannerDescription}
                        rows={2}
                        maxLength={200}
                        onChange={(e) => setBannerDescription(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="banner-href">链接（选填，https://…）</label>
                      <input
                        id="banner-href"
                        type="url"
                        value={bannerHref}
                        maxLength={500}
                        placeholder="https://example.com"
                        onChange={(e) => setBannerHref(e.target.value)}
                      />
                    </div>
                    <div className="actions">
                      <button
                        className="button primary small"
                        type="submit"
                        disabled={busy}
                        aria-busy={busy}
                      >
                        {busy ? <Spinner /> : <Icon name="check" width={15} height={15} />}
                        {busy ? '提交中…' : `确认购买（${item.price} 积分）`}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {confirmItem !== null ? (
        <ConfirmDialog
          open
          title={`花费 ${confirmItem.price} 积分购买「${confirmItem.name}」？`}
          description={confirmItem.description}
          confirmLabel="确认购买"
          busy={busy}
          onConfirm={() => void confirmPurchase()}
          onCancel={() => setConfirmItem(null)}
        />
      ) : null}
    </section>
  );
}
