'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BannerSummary } from '@mcserauth/shared';
import { Icon } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { isSafeExternalHref, isSafeInternalHref } from '@/lib/href-safety';

const AUTOPLAY_INTERVAL_MS = 6000;

function formatBannerWindow(startsAt: string | null, endsAt: string | null): string | null {
  if (startsAt === null && endsAt === null) {
    return null;
  }
  const start = startsAt === null ? '即刻' : formatDate(startsAt);
  const end = endsAt === null ? '长期' : formatDate(endsAt);
  return `展示时间：${start} — ${end}`;
}

/** Renders the banner title as an internal link, an external link, or plain text. */
function BannerLink({ banner, active }: { banner: BannerSummary; active: boolean }) {
  const href = banner.href;
  const tabProps = active ? {} : { tabIndex: -1 };
  if (href !== null && isSafeInternalHref(href)) {
    return (
      <Link href={href} {...tabProps}>
        {banner.title}
      </Link>
    );
  }
  if (href !== null && isSafeExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...tabProps}>
        {banner.title}
      </a>
    );
  }
  return <span>{banner.title}</span>;
}

export default function HomeBannerCarousel({ banners }: { banners: BannerSummary[] }) {
  const [index, setIndex] = useState(0);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [pausedByHover, setPausedByHover] = useState(false);
  const count = banners.length;

  // 尊重系统“减少动态效果”设置：默认暂停自动轮播。
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPausedByUser(true);
    }
  }, []);

  const autoPlaying = count > 1 && !pausedByUser && !pausedByHover;

  useEffect(() => {
    if (!autoPlaying) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoPlaying, count]);

  if (count === 0) {
    return null;
  }

  const safeIndex = index < count ? index : 0;
  const goPrev = () => setIndex((current) => (current - 1 + count) % count);
  const goNext = () => setIndex((current) => (current + 1) % count);

  return (
    <section
      className="home-banner-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="首页 Banner 轮播"
      onMouseEnter={() => setPausedByHover(true)}
      onMouseLeave={() => setPausedByHover(false)}
      onFocusCapture={() => setPausedByHover(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPausedByHover(false);
        }
      }}
    >
      <div
        className="home-banner-viewport"
        aria-live={autoPlaying ? 'off' : 'polite'}
        aria-atomic="false"
      >
        <div
          className="home-banner-track"
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {banners.map((banner, slideIndex) => {
            const active = slideIndex === safeIndex;
            const windowText = formatBannerWindow(banner.startsAt, banner.endsAt);
            return (
              <div
                key={banner.id}
                className="home-banner-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`第 ${slideIndex + 1} 张，共 ${count} 张`}
                aria-hidden={!active}
              >
                <article className="home-banner-card">
                  <h2 className="home-banner-title">
                    <BannerLink banner={banner} active={active} />
                  </h2>
                  {banner.description !== null && banner.description !== '' ? (
                    <p className="home-banner-description">{banner.description}</p>
                  ) : null}
                  <p className="home-banner-meta">
                    <span>由 {banner.ownerName} 投放</span>
                    {windowText !== null ? <span>{windowText}</span> : null}
                  </p>
                </article>
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 ? (
        <div className="home-banner-controls">
          <button type="button" className="icon-button" onClick={goPrev} aria-label="上一条 Banner">
            <Icon name="chevronLeft" width={16} height={16} />
          </button>
          <div className="home-banner-dots">
            {banners.map((banner, dotIndex) => (
              <button
                key={banner.id}
                type="button"
                className={`home-banner-dot${dotIndex === safeIndex ? ' active' : ''}`}
                onClick={() => setIndex(dotIndex)}
                aria-label={`切换到第 ${dotIndex + 1} 张 Banner`}
                aria-current={dotIndex === safeIndex ? 'true' : undefined}
              >
                <span aria-hidden="true">{dotIndex + 1}</span>
              </button>
            ))}
          </div>
          <button type="button" className="icon-button" onClick={goNext} aria-label="下一条 Banner">
            <Icon name="chevronRight" width={16} height={16} />
          </button>
          <button
            type="button"
            className="button ghost home-banner-toggle"
            onClick={() => setPausedByUser((value) => !value)}
            aria-label={pausedByUser ? '继续自动轮播' : '暂停自动轮播'}
            aria-pressed={pausedByUser}
          >
            {pausedByUser ? '播放' : '暂停'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
