import type { Metadata } from 'next';
import ConsoleClient from '@/components/console/console-client';

export const metadata: Metadata = {
  title: '超级后台',
  robots: { index: false, follow: false },
};

/**
 * Unlinked root-console entry. The server rejects access unless CONSOLE_KEY is
 * configured and the visitor presents the signed console cookie.
 */
export default function ConsolePage() {
  return <ConsoleClient />;
}
