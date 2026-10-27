import type { UserSettingsResponse } from '@mcserauth/shared';
import type { Metadata } from 'next';
import TextureStation from '@/components/textures/texture-station';
import { serverApiFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '游戏账号管理',
  description: '管理游戏角色、皮肤与披风，查看外置登录连接指南。',
};

export default async function TexturesPage() {
  const initialSettings = await serverApiFetch<UserSettingsResponse>('/api/user/settings');

  return <TextureStation initialSettings={initialSettings} />;
}
