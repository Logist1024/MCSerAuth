import type { HomeAction } from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';
import HomeBannerCarousel from '@/components/home-banner-carousel';
import { loadHome } from '@/lib/home-content';
import { isSafeExternalHref, isSafeInternalHref } from '@/lib/href-safety';
import { loadSiteDisplay } from '@/lib/site-settings';
import './home.css';

export async function generateMetadata(): Promise<Metadata> {
  const [site, home] = await Promise.all([loadSiteDisplay(), loadHome()]);
  const heroTitle = home.content.heroTitle.trim();
  const heroText = home.content.heroText.trim();
  return {
    title: heroTitle === '' ? '服务器' : heroTitle,
    description: heroText === '' ? site.description : heroText,
  };
}

/** CTA link: internal paths use next/link, http(s) links open safely in a new tab. */
function ActionLink({ action, className }: { action: HomeAction; className: string }) {
  if (isSafeInternalHref(action.href)) {
    return (
      <Link className={className} href={action.href}>
        {action.label}
      </Link>
    );
  }
  if (isSafeExternalHref(action.href)) {
    return (
      <a className={className} href={action.href} target="_blank" rel="noopener noreferrer">
        {action.label}
      </a>
    );
  }
  return <span className={className}>{action.label}</span>;
}

/** Pick a distinguishable glyph for the community entry cards. */
function entryIcon(href: string): IconName {
  if (href.startsWith('/forum')) {
    return 'message';
  }
  if (href.startsWith('/textures')) {
    return 'gamepad';
  }
  return 'link';
}

export default async function HomePage() {
  const { content, banners } = await loadHome();

  return (
    <>
      <HomeBannerCarousel banners={banners} />

      <section className="community-hero">
        <div className="hero-copy">
          <p className="hero-eyebrow">
            <Icon name="gamepad" width={15} height={15} />
            {content.heroEyebrow}
          </p>
          <h1 className="hero-title">{content.heroTitle}</h1>
          {content.heroText !== '' ? <p className="hero-text">{content.heroText}</p> : null}
          <div className="hero-actions">
            <ActionLink action={content.primaryAction} className="button primary" />
            <ActionLink action={content.secondaryAction} className="button ghost" />
          </div>
        </div>
        {content.stats.length > 0 ? (
          <div className="hero-stats">
            {content.stats.map((stat) => (
              <div className="hero-stat" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="home-columns">
        {content.steps.length > 0 ? (
          <section className="panel">
            <div className="home-section-head">
              <h2>三步开始</h2>
            </div>
            <div className="panel-body">
              <ol className="server-steps">
                {content.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {content.entries.length > 0 ? (
          <section className="panel">
            <div className="home-section-head">
              <h2>社区入口</h2>
            </div>
            <div className="panel-body">
              <div className="home-entry-list">
                {content.entries.map((entry) => {
                  const card = (
                    <>
                      <span className="server-entry-icon">
                        <Icon name={entryIcon(entry.href)} width={20} height={20} />
                      </span>
                      <span className="server-entry-copy">
                        <strong className="server-entry-title">{entry.title}</strong>
                        {entry.description !== '' ? <p>{entry.description}</p> : null}
                      </span>
                      <span className="server-entry-action">{entry.actionLabel}</span>
                    </>
                  );
                  if (isSafeInternalHref(entry.href)) {
                    return (
                      <Link className="server-entry" href={entry.href} key={entry.title}>
                        {card}
                      </Link>
                    );
                  }
                  if (isSafeExternalHref(entry.href)) {
                    return (
                      <a
                        className="server-entry"
                        href={entry.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        key={entry.title}
                      >
                        {card}
                      </a>
                    );
                  }
                  return (
                    <div className="server-entry" key={entry.title}>
                      {card}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
