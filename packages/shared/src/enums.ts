/**
 * Cross-app domain enums.
 *
 * These string unions are the single source of truth for both the Drizzle
 * schema (`text(..., { enum })`) and runtime validation. Do not duplicate them
 * inside apps — import from `@mcserauth/shared`.
 */

/** S3: permissions are a single role column, no RBAC tables. */
export const USER_ROLES = ['user', 'mod', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

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

export const NOTIFICATION_TYPES = ['reply', 'mention', 'system', 'moderation'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const MODERATION_ACTIONS = [
  'ban_user',
  'unban_user',
  'hide_post',
  'restore_post',
  'delete_post',
  'hide_reply',
  'restore_reply',
  'approve_skin',
  'reject_skin',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
