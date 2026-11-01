import type {
  AdminPermission,
  NotificationType,
  PostStatus,
  ReplyStatus,
  ReportStatus,
  ReportTargetType,
  SkinKind,
  SkinStatus,
  SkinVariant,
  UserRole,
} from './enums.js';

/**
 * Forum / account / admin API contracts (unified `{ code, data }` envelope).
 * These endpoints are not part of the Commons-Designs authentication protocol.
 */

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ForumPlayerBadge {
  uuid: string;
  nickname: string;
}

export interface ForumAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  player: ForumPlayerBadge | null;
  /** Level badge; hidden when the author holds a special title. */
  level: number | null;
  levelTier: string | null;
  title: { name: string; color: string } | null;
}

export interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  parentId: number | null;
  postCount: number;
  lastActivityAt: string | null;
  children: ForumCategory[];
}

export interface ForumCategoryRef {
  id: number;
  name: string;
  slug: string;
}

export interface ForumPostSummary {
  id: number;
  title: string;
  excerpt: string;
  category: ForumCategoryRef;
  author: ForumAuthor;
  status: PostStatus;
  pinned: boolean;
  featured: boolean;
  locked: boolean;
  voteCount: number;
  replyCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface ForumReply {
  id: number;
  postId: number;
  floor: number;
  contentMd: string;
  author: ForumAuthor;
  status: ReplyStatus;
  voteCount: number;
  viewerVoted: boolean;
  createdAt: string;
}

export interface ForumPostDetail extends ForumPostSummary {
  contentMd: string;
  viewerVoted: boolean;
  replies: ForumReply[];
  /** Total replies visible to the current viewer (drives pagination). */
  replyTotal: number;
  replyPage: number;
  replyPageSize: number;
}

export const POST_SORT_OPTIONS = ['activity', 'created', 'hot'] as const;
export type PostSortOption = (typeof POST_SORT_OPTIONS)[number];

export interface ForumPostListQuery {
  page?: number;
  pageSize?: number;
  categorySlug?: string;
  /** 排序：activity=最新回复（默认）、created=最新发布、hot=最热。 */
  sort?: PostSortOption;
  /** 标题关键词搜索（不区分大小写，1–50 字符）。 */
  search?: string;
}

export interface CreatePostRequest {
  categoryId: number;
  title: string;
  contentMd: string;
}

export interface UpdatePostRequest {
  title?: string;
  contentMd?: string;
}

export interface CreateReplyRequest {
  contentMd: string;
}

export interface VoteResponse {
  targetType: 'post' | 'reply';
  targetId: number;
  voted: boolean;
  voteCount: number;
}

export interface CreateReportRequest {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
}

export interface NotificationActor {
  id: string;
  name: string;
}

export interface ForumNotification {
  id: number;
  type: NotificationType;
  actor: NotificationActor | null;
  message: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: ForumNotification[];
  unreadCount: number;
  page: number;
  pageSize: number;
  total: number;
}

export interface UpdateProfileRequest {
  signature?: string | null;
  avatarUrl?: string | null;
}

/** Change-password flows through better-auth directly; email change is ours. */
export interface ChangeEmailRequest {
  newEmail: string;
  /** The account password: email changes must re-prove possession. */
  currentPassword: string;
}

export interface UserSettingsResponse {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    signature: string | null;
    role: UserRole;
    banned: boolean;
    /** Capabilities delegated by a superadmin (superadmins implicitly hold all). */
    permissions: AdminPermission[];
    /** Forum mute expiry; null means not muted. */
    mutedUntil: string | null;
    createdAt: string;
  };
  player: {
    uuid: string;
    nickname: string;
    previousNickname: string | null;
    nicknameHistory: string[];
    nameCooldownAt: string | null;
    /** When the 30-day rename cool-down ends; null means renaming is available. */
    renameAvailableAt: string | null;
    banned: boolean;
    createdAt: string;
  } | null;
}

export interface RenamePlayerRequest {
  nickname: string;
}

export interface RenamePlayerResponse {
  uuid: string;
  nickname: string;
  previousNickname: string | null;
  cooldownUntil: string;
  nicknameHistory: string[];
}

export interface ActivateTextureResponse {
  id: number;
  kind: 'skin' | 'cape';
  active: boolean;
}

export interface DeleteTextureResponse {
  deleted: true;
}

export interface PublicUserProfile {
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
    signature: string | null;
    role: UserRole;
    createdAt: string;
  };
  player: {
    uuid: string;
    nickname: string;
    banned: boolean;
  } | null;
  stats: {
    posts: number;
    replies: number;
  };
  /** Level/points/title summary; special title holders show the title instead of a level. */
  progress: {
    level: number;
    xp: number;
    points: number;
    tierName: string;
    title: { name: string; color: string } | null;
    checkinStreak: number;
  };
  recentPosts: ForumPostSummary[];
}

export interface ForumUploadResponse {
  url: string;
  markdown: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  banned: boolean;
  mutedUntil: string | null;
  createdAt: string;
  player: {
    uuid: string;
    nickname: string;
    banned: boolean;
  } | null;
  postCount: number;
  level: number;
  points: number;
  title: { name: string; color: string } | null;
  permissions: AdminPermission[];
}

export interface BanUserRequest {
  reason?: string;
  banForum?: boolean;
  banGame?: boolean;
}

export interface UnbanUserRequest {
  reason?: string;
  unbanForum?: boolean;
  unbanGame?: boolean;
}

export interface MuteUserRequest {
  /** Mute duration in hours (1–720). */
  durationHours: number;
  reason?: string;
}

export interface UnmuteUserRequest {
  reason?: string;
}

export interface ModeratePostRequest {
  status?: PostStatus;
  pinned?: boolean;
  featured?: boolean;
  locked?: boolean;
  reason?: string;
}

export interface ModerateReplyRequest {
  status?: ReplyStatus;
  reason?: string;
}

export interface ModeratePostResponse {
  id: number;
  status: PostStatus;
  pinned: boolean;
  featured: boolean;
  locked: boolean;
}

export interface ModerateReplyResponse {
  id: number;
  status: ReplyStatus;
}

export interface AdminReport {
  id: number;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: ReportStatus;
  reporter: { id: string; name: string };
  handledBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface HandleReportRequest {
  reason?: string;
}

export interface AdminCategoryInput {
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
  parentId?: number | null;
}

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  parentId: number | null;
  postCount: number;
}

export interface AdminStats {
  users: { total: number; banned: number };
  players: { total: number; banned: number };
  posts: { total: number; published: number; pending: number; hidden: number };
  replies: { total: number; published: number };
  reports: { pending: number; resolved: number; rejected: number };
  skins: { pending: number; approved: number; rejected: number };
  tokens: { active: number };
  categories: number;
}

export interface CreateAnnouncementRequest {
  message: string;
  link?: string | null;
}

export interface CreateAnnouncementResponse {
  recipients: number;
}

export interface AdminTextureView {
  id: number;
  playerUuid: string;
  nickname: string;
  kind: SkinKind;
  variant: SkinVariant | null;
  status: SkinStatus;
  isActive: boolean;
  uploadedAt: string;
  url: string;
}

export interface AdminServerEntry {
  id: number;
  serverId: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  secret?: string;
}

export interface CreateServerRequest {
  serverId: string;
  name: string;
  secret?: string;
}

export interface UpdateServerRequest {
  name?: string;
  enabled?: boolean;
}
