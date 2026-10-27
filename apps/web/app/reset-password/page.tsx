import type { Metadata } from 'next';
import { Suspense } from 'react';
import ResetPasswordForm from '@/components/reset-password-form';

export const metadata: Metadata = { title: '重置密码' };

export default function ResetPasswordPage() {
  return (
    <div className="auth-layout">
      <Suspense
        fallback={
          <div className="auth-card">
            <h2>加载中…</h2>
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
