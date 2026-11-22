import type {
  GrowthOverviewResponse,
  MinecraftProfileResponse,
  UserSettingsResponse,
} from '@mcserauth/shared';
import type { Metadata } from 'next';
import TextureStation from '@/components/textures/texture-station';
import { serverApiFetchResult, serverProtocolFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '游戏账号管理',
  description: '管理游戏角色、皮肤与披风，查看外置登录连接指南。',
};

export default async function TexturesPage() {
  const settings = await serverApiFetchResult<UserSettingsResponse>('/api/user/settings');
  if (!settings.ok && settings.status !== 401) {
    // Distinguish an outage from "not signed in": a 5xx must not render the
    // anonymous call-to-action as if the visitor had no account.
    throw new Error('账号资料暂时无法加载，请稍后重试');
  }
  if (!settings.ok) {
    return (
      <TextureStation initialSettings={null} initialTextures={null} initialCapeUnlocked={null} />
    );
  }

  // Signed in: fetch the profile textures (protocol shape) and cape unlock in
  // parallel on the server, so the client renders the first paint complete.
  const [textures, growth] = await Promise.all([
    serverProtocolFetch<MinecraftProfileResponse>('/api/minecraft/profile/skins'),
    serverApiFetchResult<GrowthOverviewResponse>('/api/growth/overview'),
  ]);

  return (
    <TextureStation
      initialSettings={settings.data}
      initialTextures={textures}
      initialCapeUnlocked={growth.ok ? growth.data.progress.capeUnlocked : null}
    />
  );
}
