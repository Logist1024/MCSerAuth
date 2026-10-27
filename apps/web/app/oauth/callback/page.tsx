import { Suspense } from 'react';
import OAuthCallbackClient from './callback-client';

export const metadata = {
  title: 'OAuth 回调',
};

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<section className="card">正在读取授权结果…</section>}>
      <OAuthCallbackClient />
    </Suspense>
  );
}
