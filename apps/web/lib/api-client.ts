/**
 * Typed API client for the unified `{ code, data }` envelope.
 *
 * Commons-Designs protocol endpoints deliberately bypass this envelope (their
 * native error shape is `{ error, errorMessage }`) — use `protocolFetch` for
 * those so callers keep the protocol contract intact.
 */
import {
  type ActivateTextureResponse,
  type AdminBannerOverview,
  type AdminCategory,
  type AdminCategoryInput,
  type AdminPermission,
  type AdminReport,
  type AdminServerEntry,
  type AdminStats,
  type AdminTextureView,
  type AdminTitleOverview,
  type AdminUserSummary,
  type AdjustPointsRequest,
  type AdjustPointsResponse,
  type BanUserRequest,
  type BannerStatus,
  type BannerSummary,
  type CaptchaChallengeResponse,
  type CaptchaPublicConfig,
  type CaptchaSettings,
  type CaptchaVerifyRequest,
  type CaptchaVerifyResponse,
  type ChangeEmailRequest,
  type CheckinResponse,
  type CreateAnnouncementRequest,
  type CreateAnnouncementResponse,
  type CreatePostRequest,
  type CreateReplyRequest,
  type CreateReportRequest,
  type CreateServerRequest,
  type CreateTitleRequest,
  type DeleteTextureResponse,
  type ForumCategory,
  type ForumPostDetail,
  type ForumPostSummary,
  type ForumReply,
  type ForumUploadResponse,
  type GrowthOverviewResponse,
  type GrowthRulesPatch,
  type GrowthRulesResponse,
  type HandleReportRequest,
  type HealthData,
  type LeaderboardEntry,
  type MinecraftProfileResponse,
  type ModeratePostRequest,
  type ModeratePostResponse,
  type ModerateReplyRequest,
  type ModerateReplyResponse,
  type MuteUserRequest,
  type NotificationListResponse,
  type OAuthAuthenticateRequest,
  type OAuthAvailabilityResponse,
  type OAuthEntryQuery,
  type OAuthRefreshRequest,
  type OAuthTokenResponse,
  type Paginated,
  type PointTransactionPage,
  type PublicHomeResponse,
  type PublicUserProfile,
  type PurchaseRequest,
  type PurchaseResponse,
  type RenamePlayerResponse,
  type SkinVariant,
  type SiteDisplaySettings,
  type SiteSettings,
  type SubmitTitleApplicationRequest,
  type TextureUploadResponse,
  type TipRequest,
  type TipResponse,
  type TitleApplicationSummary,
  type UnbanUserRequest,
  type UnmuteUserRequest,
  type UpdateCaptchaSettingsRequest,
  type UpdateProfileRequest,
  type UpdateServerRequest,
  type UpdateSiteSettingsRequest,
  type UpdateUserRoleRequest,
  type UserTitleSummary,
  type ConsoleSessionResponse,
  type ConsoleStaffMember,
  type UserProfilesMeResponse,
  type UserSettingsResponse,
  type VoteResponse,
} from '@mcserauth/shared';

import {
  API_BASE_URL,
  ApiError,
  ProtocolApiError,
  requestEnvelope,
  requestProtocol,
  type ApiFetchOptions,
} from './http';
export { API_BASE_URL, ApiError, ProtocolApiError };
export type { ApiFetchOptions };

/** Calls a unified-envelope endpoint and returns `data` or throws `ApiError`. */
export function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return requestEnvelope<T>(path, options);
}

/** Calls a Commons-Designs endpoint, preserving its native error contract. */
export function protocolFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return requestProtocol<T>(path, options);
}

/** `GET /health` — 服务与 SQLite 探活（统一封装）。 */
export function fetchHealth(): Promise<HealthData> {
  return apiFetch<HealthData>('/health');
}

/** `GET /api/oauth/availability` — 授权页连通性检查。 */
export function fetchOAuthAvailability(): Promise<OAuthAvailabilityResponse> {
  return protocolFetch<OAuthAvailabilityResponse>('/api/oauth/availability');
}

/** `POST /api/oauth/authenticate` — 一次性授权码换取启动器令牌。 */
export function authenticateOAuth(body: OAuthAuthenticateRequest): Promise<OAuthTokenResponse> {
  return protocolFetch<OAuthTokenResponse>('/api/oauth/authenticate', {
    method: 'POST',
    body,
  });
}

/** `POST /api/oauth/refresh` — 刷新令牌轮换。 */
export function refreshOAuth(body: OAuthRefreshRequest): Promise<OAuthTokenResponse> {
  return protocolFetch<OAuthTokenResponse>('/api/oauth/refresh', {
    method: 'POST',
    body,
  });
}

/**
 * `GET /api/user/profiles/me` — 当前账号与 player 摘要。
 * Without `accessToken` the browser's better-auth cookie is used.
 */
export function fetchMyProfile(
  options: { accessToken?: string } = {},
): Promise<UserProfilesMeResponse> {
  const headers: Record<string, string> = {};
  if (options.accessToken !== undefined) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  return protocolFetch<UserProfilesMeResponse>('/api/user/profiles/me', {
    credentials: 'include',
    headers,
  });
}

/** Builds the browser-facing consent URL (NestJS-rendered page). */
export function buildOAuthEntryUrl(params: OAuthEntryQuery): string {
  const url = new URL('/api/oauth/entry', API_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/** `GET /api/minecraft/profile/skins` — current player's approved textures (cookie auth). */
export function fetchMyTextures(): Promise<MinecraftProfileResponse> {
  return protocolFetch<MinecraftProfileResponse>('/api/minecraft/profile/skins', {
    credentials: 'include',
  });
}

/** `POST /api/minecraft/profile/skins` — upload a PNG and activate it immediately. */
export function uploadMySkin(file: File, variant: SkinVariant): Promise<TextureUploadResponse> {
  const form = new FormData();
  form.set('variant', variant);
  form.set('file', file);
  return protocolFetch<TextureUploadResponse>('/api/minecraft/profile/skins', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
}

/** `POST /api/minecraft/profile/capes` — upload a cape PNG and activate it immediately. */
export function uploadMyCape(file: File): Promise<TextureUploadResponse> {
  const form = new FormData();
  form.set('file', file);
  return protocolFetch<TextureUploadResponse>('/api/minecraft/profile/capes', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
}

/** `GET /api/site` — public display settings (site name, banner, footer). */
export function fetchSiteDisplaySettings(): Promise<SiteDisplaySettings> {
  return apiFetch<SiteDisplaySettings>('/api/site');
}

// ------------------------------------------------------------- captcha (人机验证)

/** `GET /api/captcha/config` — 登录/注册表单据此决定是否渲染验证组件。 */
export function fetchCaptchaConfig(): Promise<CaptchaPublicConfig> {
  return apiFetch<CaptchaPublicConfig>('/api/captcha/config');
}

/** `GET /api/captcha/challenge` — 内置 SVG 算术题（仅 builtin 提供商）。 */
export function fetchCaptchaChallenge(): Promise<CaptchaChallengeResponse> {
  return apiFetch<CaptchaChallengeResponse>('/api/captcha/challenge');
}

/** `POST /api/captcha/verify` — 换取一次性 `x-captcha-token`。 */
export function verifyCaptcha(body: CaptchaVerifyRequest): Promise<CaptchaVerifyResponse> {
  return apiFetch<CaptchaVerifyResponse>('/api/captcha/verify', { method: 'POST', body });
}

// ---------------------------------------------------------------- forum reads

export interface ForumPostQuery {
  page?: number;
  pageSize?: number;
  categorySlug?: string;
}

export function fetchForumCategories(): Promise<ForumCategory[]> {
  return apiFetch<ForumCategory[]>('/api/forum/categories');
}

export function fetchForumPosts(query: ForumPostQuery = {}): Promise<Paginated<ForumPostSummary>> {
  const params = new URLSearchParams();
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined) {
    params.set('pageSize', String(query.pageSize));
  }
  if (query.categorySlug !== undefined) {
    params.set('categorySlug', query.categorySlug);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiFetch<Paginated<ForumPostSummary>>(`/api/forum/posts${suffix}`, {
    credentials: 'include',
  });
}

export function fetchForumPost(
  id: number | string,
  query: { replyPage?: number; replyPageSize?: number } = {},
): Promise<ForumPostDetail> {
  const params = new URLSearchParams();
  if (query.replyPage !== undefined) {
    params.set('replyPage', String(query.replyPage));
  }
  if (query.replyPageSize !== undefined) {
    params.set('replyPageSize', String(query.replyPageSize));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiFetch<ForumPostDetail>(`/api/forum/posts/${id}${suffix}`, { credentials: 'include' });
}

export function fetchPublicUser(id: string): Promise<PublicUserProfile> {
  return apiFetch<PublicUserProfile>(`/api/users/${encodeURIComponent(id)}`);
}

// --------------------------------------------------------------- forum writes

export function createForumPost(body: CreatePostRequest): Promise<ForumPostDetail> {
  return apiFetch<ForumPostDetail>('/api/forum/posts', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function updateForumPost(
  id: number,
  body: { title?: string; contentMd?: string },
): Promise<ForumPostDetail> {
  return apiFetch<ForumPostDetail>(`/api/forum/posts/${id}`, {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function deleteForumPost(id: number): Promise<{ deleted: true }> {
  return apiFetch<{ deleted: true }>(`/api/forum/posts/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export function createForumReply(postId: number, contentMd: string): Promise<ForumReply> {
  return apiFetch<ForumReply>(`/api/forum/posts/${postId}/replies`, {
    method: 'POST',
    body: { contentMd } satisfies CreateReplyRequest,
    credentials: 'include',
  });
}

export function updateForumReply(id: number, contentMd: string): Promise<unknown> {
  return apiFetch(`/api/forum/replies/${id}`, {
    method: 'PATCH',
    body: { contentMd } satisfies CreateReplyRequest,
    credentials: 'include',
  });
}

export function deleteForumReply(id: number): Promise<{ deleted: true }> {
  return apiFetch<{ deleted: true }>(`/api/forum/replies/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export function voteForumPost(id: number): Promise<VoteResponse> {
  return apiFetch<VoteResponse>(`/api/forum/posts/${id}/vote`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function voteForumReply(id: number): Promise<VoteResponse> {
  return apiFetch<VoteResponse>(`/api/forum/replies/${id}/vote`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function createReport(body: CreateReportRequest): Promise<{ id: number }> {
  return apiFetch<{ id: number }>('/api/forum/reports', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function uploadForumImage(file: File): Promise<ForumUploadResponse> {
  const form = new FormData();
  form.set('file', file);
  return apiFetch<ForumUploadResponse>('/api/forum/uploads', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
}

// --------------------------------------------------------------- notifications

export function fetchNotifications(
  query: { page?: number; pageSize?: number } = {},
): Promise<NotificationListResponse> {
  const params = new URLSearchParams();
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined) {
    params.set('pageSize', String(query.pageSize));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiFetch<NotificationListResponse>(`/api/forum/notifications${suffix}`, {
    credentials: 'include',
  });
}

export function fetchUnreadCount(): Promise<{ unreadCount: number }> {
  return apiFetch<{ unreadCount: number }>('/api/forum/notifications/unread-count', {
    credentials: 'include',
  });
}

export function markNotificationRead(id: number): Promise<{ read: boolean }> {
  return apiFetch<{ read: boolean }>(`/api/forum/notifications/${id}/read`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>('/api/forum/notifications/read-all', {
    method: 'POST',
    credentials: 'include',
  });
}

// ---------------------------------------------------------------- user settings

export function fetchUserSettings(): Promise<UserSettingsResponse> {
  return apiFetch<UserSettingsResponse>('/api/user/settings', { credentials: 'include' });
}

export function updateUserSettings(body: UpdateProfileRequest): Promise<UserSettingsResponse> {
  return apiFetch<UserSettingsResponse>('/api/user/settings', {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function renamePlayer(nickname: string): Promise<RenamePlayerResponse> {
  return apiFetch<RenamePlayerResponse>('/api/user/player/rename', {
    method: 'POST',
    body: { nickname },
    credentials: 'include',
  });
}

/** `POST /api/user/email` — 凭当前密码改绑邮箱。 */
export function changeAccountEmail(body: ChangeEmailRequest): Promise<UserSettingsResponse> {
  return apiFetch<UserSettingsResponse>('/api/user/email', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function activateTexture(id: number): Promise<ActivateTextureResponse> {
  return apiFetch<ActivateTextureResponse>(`/api/user/textures/${id}/activate`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function deleteMyTexture(id: number): Promise<DeleteTextureResponse> {
  return apiFetch<DeleteTextureResponse>(`/api/user/textures/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

// ---------------------------------------------------------------------- admin

export function adminFetchStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>('/api/admin/forum/stats', { credentials: 'include' });
}

export function adminListUsers(
  query: { search?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<AdminUserSummary>> {
  const params = new URLSearchParams();
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined) {
    params.set('pageSize', String(query.pageSize));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiFetch<Paginated<AdminUserSummary>>(`/api/admin/forum/users${suffix}`, {
    credentials: 'include',
  });
}

export function adminBanUser(id: string, body: BanUserRequest): Promise<AdminUserSummary> {
  return apiFetch<AdminUserSummary>(`/api/admin/forum/users/${id}/ban`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminUnbanUser(id: string, body: UnbanUserRequest): Promise<AdminUserSummary> {
  return apiFetch<AdminUserSummary>(`/api/admin/forum/users/${id}/unban`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminMuteUser(id: string, body: MuteUserRequest): Promise<AdminUserSummary> {
  return apiFetch<AdminUserSummary>(`/api/admin/forum/users/${id}/mute`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminUnmuteUser(id: string, body: UnmuteUserRequest): Promise<AdminUserSummary> {
  return apiFetch<AdminUserSummary>(`/api/admin/forum/users/${id}/unmute`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminListReports(
  query: { status?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<AdminReport>> {
  const params = new URLSearchParams();
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined) {
    params.set('pageSize', String(query.pageSize));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiFetch<Paginated<AdminReport>>(`/api/admin/forum/reports${suffix}`, {
    credentials: 'include',
  });
}

export function adminResolveReport(
  id: number,
  body: HandleReportRequest = {},
): Promise<AdminReport> {
  return apiFetch<AdminReport>(`/api/admin/forum/reports/${id}/resolve`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminRejectReport(
  id: number,
  body: HandleReportRequest = {},
): Promise<AdminReport> {
  return apiFetch<AdminReport>(`/api/admin/forum/reports/${id}/reject`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminModeratePost(
  id: number,
  body: ModeratePostRequest,
): Promise<ModeratePostResponse> {
  return apiFetch<ModeratePostResponse>(`/api/admin/forum/posts/${id}`, {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function adminModerateReply(
  id: number,
  body: ModerateReplyRequest,
): Promise<ModerateReplyResponse> {
  return apiFetch<ModerateReplyResponse>(`/api/admin/forum/replies/${id}`, {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function adminListCategories(): Promise<AdminCategory[]> {
  return apiFetch<AdminCategory[]>('/api/admin/forum/categories', { credentials: 'include' });
}

export function adminCreateCategory(body: AdminCategoryInput): Promise<AdminCategory> {
  return apiFetch<AdminCategory>('/api/admin/forum/categories', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminUpdateCategory(
  id: number,
  body: Partial<AdminCategoryInput>,
): Promise<AdminCategory> {
  return apiFetch<AdminCategory>(`/api/admin/forum/categories/${id}`, {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function adminDeleteCategory(id: number): Promise<{ deleted: true }> {
  return apiFetch<{ deleted: true }>(`/api/admin/forum/categories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export function adminAnnounce(
  body: CreateAnnouncementRequest,
): Promise<CreateAnnouncementResponse> {
  return apiFetch<CreateAnnouncementResponse>('/api/admin/forum/announcements', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminListTextures(status?: string): Promise<AdminTextureView[]> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch<AdminTextureView[]>(`/api/admin/textures${suffix}`, { credentials: 'include' });
}

export function adminApproveTexture(id: number, reason?: string): Promise<AdminTextureView> {
  return apiFetch<AdminTextureView>(`/api/admin/textures/${id}/approve`, {
    method: 'POST',
    body: { reason },
    credentials: 'include',
  });
}

export function adminRejectTexture(id: number, reason?: string): Promise<AdminTextureView> {
  return apiFetch<AdminTextureView>(`/api/admin/textures/${id}/reject`, {
    method: 'POST',
    body: { reason },
    credentials: 'include',
  });
}

export function adminListServers(): Promise<AdminServerEntry[]> {
  return apiFetch<AdminServerEntry[]>('/api/admin/servers', { credentials: 'include' });
}

export function adminGetSiteSettings(): Promise<SiteDisplaySettings> {
  return apiFetch<SiteDisplaySettings>('/api/admin/site', { credentials: 'include' });
}

export function adminUpdateSiteSettings(
  body: UpdateSiteSettingsRequest,
): Promise<SiteDisplaySettings> {
  return apiFetch<SiteDisplaySettings>('/api/admin/site', {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function adminUploadSiteIcon(file: File): Promise<SiteDisplaySettings> {
  const form = new FormData();
  form.set('file', file);
  return apiFetch<SiteDisplaySettings>('/api/admin/site/icon', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
}

export function adminRemoveSiteIcon(): Promise<SiteDisplaySettings> {
  return apiFetch<SiteDisplaySettings>('/api/admin/site/icon', {
    method: 'DELETE',
    credentials: 'include',
  });
}

export function adminListStaff(): Promise<ConsoleStaffMember[]> {
  return apiFetch<ConsoleStaffMember[]>('/api/admin/site/staff', { credentials: 'include' });
}

export function adminUpdateUserRole(
  id: string,
  body: UpdateUserRoleRequest,
): Promise<ConsoleStaffMember> {
  return apiFetch<ConsoleStaffMember>(`/api/admin/site/staff/${id}/role`, {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

// ------------------------------------------------------------ root console

export function fetchConsoleSession(): Promise<ConsoleSessionResponse> {
  return apiFetch<ConsoleSessionResponse>('/api/console/session', { credentials: 'include' });
}

export function consoleLogin(key: string): Promise<{ expiresAt: string }> {
  return apiFetch<{ expiresAt: string }>('/api/console/login', {
    method: 'POST',
    body: { key },
    credentials: 'include',
  });
}

export function consoleLogout(): Promise<{ loggedOut: true }> {
  return apiFetch<{ loggedOut: true }>('/api/console/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

export function consoleGetSettings(): Promise<SiteSettings> {
  return apiFetch<SiteSettings>('/api/console/settings', { credentials: 'include' });
}

export function consoleUpdateSettings(body: UpdateSiteSettingsRequest): Promise<SiteSettings> {
  return apiFetch<SiteSettings>('/api/console/settings', {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function consoleListStaff(): Promise<ConsoleStaffMember[]> {
  return apiFetch<ConsoleStaffMember[]>('/api/console/staff', { credentials: 'include' });
}

export function consoleSearchUsers(search: string): Promise<ConsoleStaffMember[]> {
  const suffix = search.trim() === '' ? '' : `?search=${encodeURIComponent(search.trim())}`;
  return apiFetch<ConsoleStaffMember[]>(`/api/console/users${suffix}`, {
    credentials: 'include',
  });
}

export function consoleUpdateUserRole(
  id: string,
  body: UpdateUserRoleRequest,
): Promise<ConsoleStaffMember> {
  return apiFetch<ConsoleStaffMember>(`/api/console/staff/${id}/role`, {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function adminCreateServer(body: CreateServerRequest): Promise<AdminServerEntry> {
  return apiFetch<AdminServerEntry>('/api/admin/servers', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminUpdateServer(
  id: number,
  body: UpdateServerRequest,
): Promise<AdminServerEntry> {
  return apiFetch<AdminServerEntry>(`/api/admin/servers/${id}`, {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

// ------------------------------------------------------------------ site home

/** `GET /api/site/home` — 首页可编辑内容与正在展示的 Banner。 */
export function fetchPublicHome(): Promise<PublicHomeResponse> {
  return apiFetch<PublicHomeResponse>('/api/site/home');
}

// ------------------------------------------------------------------- growth

/** `GET /api/growth/overview` — 我的等级、积分、商店、榜单与称号。 */
export function fetchGrowthOverview(): Promise<GrowthOverviewResponse> {
  return apiFetch<GrowthOverviewResponse>('/api/growth/overview', { credentials: 'include' });
}

/** `GET /api/growth/transactions` — 积分流水分页。 */
export function fetchPointTransactions(page = 1, pageSize = 20): Promise<PointTransactionPage> {
  return apiFetch<PointTransactionPage>(
    `/api/growth/transactions?page=${page}&pageSize=${pageSize}`,
    { credentials: 'include' },
  );
}

/** `POST /api/growth/checkin` — 每日签到。 */
export function checkinToday(): Promise<CheckinResponse> {
  return apiFetch<CheckinResponse>('/api/growth/checkin', {
    method: 'POST',
    credentials: 'include',
  });
}

/** `POST /api/growth/purchase` — 积分商店下单。 */
export function purchaseGrowthItem(body: PurchaseRequest): Promise<PurchaseResponse> {
  return apiFetch<PurchaseResponse>('/api/growth/purchase', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

/** `POST /api/growth/tips` — 打赏其他用户。 */
export function tipUser(body: TipRequest): Promise<TipResponse> {
  return apiFetch<TipResponse>('/api/growth/tips', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

/** `POST /api/growth/title-applications` — 满级专属称号申请。 */
export function submitTitleApplication(
  body: SubmitTitleApplicationRequest,
): Promise<TitleApplicationSummary> {
  return apiFetch<TitleApplicationSummary>('/api/growth/title-applications', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

/** `GET /api/growth/leaderboard` — 等级排行榜（公开）。 */
export function fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  return apiFetch<LeaderboardEntry[]>(`/api/growth/leaderboard?limit=${limit}`);
}

/** `GET /api/growth/titles` — 称号目录（公开）。 */
export function fetchTitleCatalog(): Promise<UserTitleSummary[]> {
  return apiFetch<UserTitleSummary[]>('/api/growth/titles');
}

/** `GET /api/growth/banners` — 首页展示中的 Banner（公开）。 */
export function fetchActiveBanners(): Promise<BannerSummary[]> {
  return apiFetch<BannerSummary[]>('/api/growth/banners');
}

// -------------------------------------------------------- admin: growth desk

export function adminGrowthTitles(): Promise<AdminTitleOverview> {
  return apiFetch<AdminTitleOverview>('/api/admin/growth/titles', { credentials: 'include' });
}

export function adminCreateTitle(body: CreateTitleRequest): Promise<UserTitleSummary> {
  return apiFetch<UserTitleSummary>('/api/admin/growth/titles', {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminGrantTitle(titleId: number, userId: string): Promise<{ granted: true }> {
  return apiFetch<{ granted: true }>(`/api/admin/growth/titles/${titleId}/grant`, {
    method: 'POST',
    body: { userId },
    credentials: 'include',
  });
}

export function adminRevokeTitle(titleId: number, userId: string): Promise<{ revoked: true }> {
  return apiFetch<{ revoked: true }>(`/api/admin/growth/titles/${titleId}/revoke`, {
    method: 'POST',
    body: { userId },
    credentials: 'include',
  });
}

export function adminReviewTitleApplication(
  id: number,
  approve: boolean,
): Promise<TitleApplicationSummary> {
  return apiFetch<TitleApplicationSummary>(
    `/api/admin/growth/title-applications/${id}/${approve ? 'approve' : 'reject'}`,
    { method: 'POST', credentials: 'include' },
  );
}

export function adminGrowthBanners(status?: BannerStatus): Promise<AdminBannerOverview> {
  const suffix = status === undefined ? '' : `?status=${status}`;
  return apiFetch<AdminBannerOverview>(`/api/admin/growth/banners${suffix}`, {
    credentials: 'include',
  });
}

export function adminReviewBanner(id: number, approve: boolean): Promise<BannerSummary> {
  return apiFetch<BannerSummary>(
    `/api/admin/growth/banners/${id}/${approve ? 'approve' : 'reject'}`,
    { method: 'POST', credentials: 'include' },
  );
}

export function adminAdjustPoints(
  userId: string,
  body: AdjustPointsRequest,
): Promise<AdjustPointsResponse> {
  return apiFetch<AdjustPointsResponse>(`/api/admin/growth/users/${userId}/points`, {
    method: 'POST',
    body,
    credentials: 'include',
  });
}

export function adminGrowthRules(): Promise<GrowthRulesResponse> {
  return apiFetch<GrowthRulesResponse>('/api/admin/growth/rules', { credentials: 'include' });
}

export function adminUpdateGrowthRules(body: GrowthRulesPatch): Promise<GrowthRulesResponse> {
  return apiFetch<GrowthRulesResponse>('/api/admin/growth/rules', {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export function adminResetGrowthRules(): Promise<GrowthRulesResponse> {
  return apiFetch<GrowthRulesResponse>('/api/admin/growth/rules/reset', {
    method: 'POST',
    credentials: 'include',
  });
}

// ------------------------------------------------- admin: permissions & captcha

export function adminPermissions(
  userId: string,
): Promise<{ userId: string; permissions: AdminPermission[] }> {
  return apiFetch<{ userId: string; permissions: AdminPermission[] }>(
    `/api/admin/site/permissions/${userId}`,
    { credentials: 'include' },
  );
}

export function adminReplacePermissions(
  userId: string,
  permissions: AdminPermission[],
): Promise<{ userId: string; permissions: AdminPermission[] }> {
  return apiFetch<{ userId: string; permissions: AdminPermission[] }>(
    `/api/admin/site/permissions/${userId}`,
    { method: 'PUT', body: { permissions }, credentials: 'include' },
  );
}

export function adminCaptchaSettings(): Promise<CaptchaSettings> {
  return apiFetch<CaptchaSettings>('/api/admin/site/captcha', { credentials: 'include' });
}

export function adminUpdateCaptchaSettings(
  body: UpdateCaptchaSettingsRequest,
): Promise<CaptchaSettings> {
  return apiFetch<CaptchaSettings>('/api/admin/site/captcha', {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}
