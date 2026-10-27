import type { GrowthOverviewResponse } from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumbs from '@/components/breadcrumbs';
import GrowthCenter from '@/components/growth/growth-center';
import { serverApiFetchResult } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '成长中心',
  description: '签到攒经验，积分换道具、解锁披风与申请称号。',
};

interface PageProps {
  searchParams: Promise<{ tx?: string }>;
}

export default async function GrowthPage({ searchParams }: PageProps) {
  const [{ tx }, overviewResult] = await Promise.all([
    searchParams,
    serverApiFetchResult<GrowthOverviewResponse>('/api/growth/overview'),
  ]);

  const requested = Number(tx ?? '1');
  const transactionsPage = Number.isInteger(requested) && requested > 0 ? requested : 1;

  if (!overviewResult.ok) {
    const unauthenticated = overviewResult.status === 401 || overviewResult.status === 403;
    return (
      <>
        <Breadcrumbs
          items={[
            { label: '首页', href: '/' },
            { label: '论坛', href: '/forum' },
            { label: '成长中心' },
          ]}
        />
        <section className="card">
          <div className="page-head">
            <div>
              <h1>成长中心</h1>
              <p className="page-description">签到、积分与称号。</p>
            </div>
          </div>
          {unauthenticated ? (
            <>
              <p className="muted">登录后查看等级、积分、商店与排行榜。</p>
              <p>
                <Link className="button primary" href="/login?next=%2Fforum%2Fgrowth">
                  去登录
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="bad" role="alert">
                暂时无法加载成长数据，请稍后重试。
              </p>
              <p>
                <Link className="button ghost" href="/forum/growth">
                  重试
                </Link>
              </p>
            </>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: '首页', href: '/' },
          { label: '论坛', href: '/forum' },
          { label: '成长中心' },
        ]}
      />
      <div className="page-head">
        <div>
          <h1>成长中心</h1>
          <p className="page-description">签到、积分与称号。</p>
        </div>
      </div>
      <GrowthCenter overview={overviewResult.data} transactionsPage={transactionsPage} />
    </>
  );
}
