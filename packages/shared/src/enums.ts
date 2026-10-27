/**
 * Cross-app domain enums.
 *
 * These string unions are the single source of truth for both the Drizzle
 * schema (`text(..., { enum })`) and runtime validation. Do not duplicate them
 * inside apps — import from `@mcserauth/shared`.
 */

/** S3: base privileges are a single role column; delegated grants live in `user_permission`. */
export const USER_ROLES = ['user', 'reviewer', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Delegated staff capabilities. Superadmins implicitly hold every capability;
 * reviewers/admins only get the ones granted per account.
 */
export const ADMIN_PERMISSIONS = [
  'site.manage',
  'forum.categories',
  'forum.announce',
  'users.ban',
  'servers.manage',
  'titles.manage',
  'banners.manage',
  'points.adjust',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  'site.manage': '站点与首页内容',
  'forum.categories': '论坛版块',
  'forum.announce': '全站公告',
  'users.ban': '封禁与解封',
  'servers.manage': '服务器白名单',
  'titles.manage': '称号授予与申请',
  'banners.manage': 'Banner 审核',
  'points.adjust': '积分调整',
};

export function hasAdminPermission(
  role: UserRole | string | null | undefined,
  permissions: readonly AdminPermission[] | null | undefined,
  permission: AdminPermission,
): boolean {
  return normalizeUserRole(role) === 'superadmin' || (permissions ?? []).includes(permission);
}

/** Staff roles ordered from least to most privileged. */
export const STAFF_ROLES = ['reviewer', 'admin', 'superadmin'] as const;

/** Numeric rank used for "at least this role" checks. */
export const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  reviewer: 1,
  admin: 2,
  superadmin: 3,
};

/** Maps legacy rows (`mod`) and unknown values onto the current role set. */
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  if (raw === 'mod') {
    return 'reviewer';
  }
  return (USER_ROLES as readonly string[]).includes(raw ?? '') ? (raw as UserRole) : 'user';
}

/** True when `role` is the same as or more privileged than `minimum`. */
export function roleAtLeast(
  role: UserRole | string | null | undefined,
  minimum: UserRole,
): boolean {
  return ROLE_RANK[normalizeUserRole(role)] >= ROLE_RANK[minimum];
}

/** S2: skins and capes share one table and are distinguished by `kind`. */
export const SKIN_KINDS = ['skin', 'cape'] as const;
export type SkinKind = (typeof SKIN_KINDS)[number];

export const SKIN_VARIANTS = ['classic', 'slim'] as const;
export type SkinVariant = (typeof SKIN_VARIANTS)[number];

export const SKIN_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type SkinStatus = (typeof SKIN_STATUSES)[number];

/** S5: posts/replies are never hard-deleted, `deleted` is a status value. */
export const POST_STATUSES = ['draft', 'pending', 'published', 'hidden', 'deleted'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const REPLY_STATUSES = ['pending', 'published', 'hidden', 'deleted'] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

export const REPORT_STATUSES = ['pending', 'resolved', 'rejected'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_TARGET_TYPES = ['post', 'reply', 'user', 'skin'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const VOTE_TARGET_TYPES = ['post', 'reply'] as const;
export type VoteTargetType = (typeof VOTE_TARGET_TYPES)[number];

export const UPLOAD_KINDS = ['texture', 'forum_image'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const NOTIFICATION_TYPES = ['reply', 'mention', 'system', 'moderation'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Special titles are curated by staff; custom titles come from level-100 applications. */
export const TITLE_KINDS = ['special', 'custom'] as const;
export type TitleKind = (typeof TITLE_KINDS)[number];

export const TITLE_APPLICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type TitleApplicationStatus = (typeof TITLE_APPLICATION_STATUSES)[number];

export const BANNER_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export type BannerStatus = (typeof BANNER_STATUSES)[number];

export const POINT_REASONS = [
  'checkin',
  'xp_boost',
  'cape_unlock',
  'banner',
  'banner_refund',
  'tip_out',
  'tip_in',
  'admin_adjust',
] as const;
export type PointReason = (typeof POINT_REASONS)[number];

export const CAPTCHA_PROVIDERS = ['builtin', 'turnstile', 'hcaptcha'] as const;
export type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number];

export const MODERATION_ACTIONS = [
  'ban_user',
  'unban_user',
  'hide_post',
  'restore_post',
  'delete_post',
  'hide_reply',
  'restore_reply',
  'delete_reply',
  'pin_post',
  'unpin_post',
  'feature_post',
  'unfeature_post',
  'lock_post',
  'unlock_post',
  'resolve_report',
  'reject_report',
  'create_category',
  'update_category',
  'delete_category',
  'approve_skin',
  'reject_skin',
  'announce',
  'mute_user',
  'unmute_user',
  'assign_role',
  'update_site',
  'grant_permission',
  'grant_title',
  'revoke_title',
  'review_title_application',
  'review_banner',
  'adjust_points',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
