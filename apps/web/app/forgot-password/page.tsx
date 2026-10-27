import type { Metadata } from 'next';
import { Suspense } from 'react';
import ForgotPasswordForm from '@/components/forgot-password-form';

export const metadata: Metadata = { title: '忘记密码' };

export default function ForgotPasswordPage() {
  return (
    <div className="auth-layout">
      <Suspense
        fallback={
          <div className="auth-card">
            <h2>加载中…</h2>
          </div>
        }
      >
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
