/**
 * Single source of truth for the relational model.
 *
 * This file is intentionally dialect-neutral. `pnpm db:generate:schemas`
 * turns it into three concrete Drizzle schemas:
 *
 *   src/db/schema/generated/sqlite.ts
 *   src/db/schema/generated/mysql.ts
 *   src/db/schema/generated/postgres.ts
 *   src/db/schema/index.ts            (runtime facade + canonical types)
 *
 * Rules of thumb:
 *  - `length` is required for every TEXT column that participates in a
 *    PRIMARY KEY, UNIQUE constraint, index or foreign key. MySQL cannot index
 *    an unbounded TEXT column without a prefix length.
 *  - `tsType` carries TypeScript-only narrowing (`$type<...>()`); it has no
 *    effect on the generated SQL.
 *  - `defaultFn` is application-side (`$defaultFn`), not a DB default, so all
 *    dialects behave identically.
 *  - Never add a partial index here. MySQL has no partial indexes; use a
 *    nullable discriminator column + a regular unique index instead.
 */

export type DatabaseDialect = 'sqlite' | 'mysql' | 'postgres';

export type ColumnType = 'text' | 'integer' | 'boolean' | 'timestamp' | 'json';

export type ReferentialAction = 'cascade' | 'restrict' | 'set null' | 'no action';

export interface ColumnModel {
  /** TypeScript property name (camelCase). */
  prop: string;
  /** Database column name (snake_case). */
  column: string;
  type: ColumnType;
  /** VARCHAR length for MySQL/PostgreSQL; ignored by SQLite. */
  length?: number;
  /** TypeScript-only narrowing, e.g. `(typeof USER_ROLES)[number]`. */
  tsType?: string;
  notNull?: boolean;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  /** Literal SQL default. */
  default?: string | number | boolean;
  /** Application-side default; emitted as `$defaultFn`. */
  defaultFn?: 'now' | 'emptyArray';
  references?: {
    table: string;
    column: string;
    onDelete?: ReferentialAction;
  };
}

export interface IndexModel {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface TableModel {
  name: string;
  columns: ColumnModel[];
  /** Composite primary key; omit when a column is marked primaryKey. */
  primaryKey?: string[];
  indexes?: IndexModel[];
}

const now = (prop: string, column: string, extra: Partial<ColumnModel> = {}): ColumnModel => ({
  prop,
  column,
  type: 'timestamp',
  notNull: true,
  defaultFn: 'now',
  ...extra,
});

const text = (prop: string, column: string, extra: Partial<ColumnModel> = {}): ColumnModel => ({
  prop,
  column,
  type: 'text',
  ...extra,
});

const int = (prop: string, column: string, extra: Partial<ColumnModel> = {}): ColumnModel => ({
  prop,
  column,
  type: 'integer',
  ...extra,
});

const bool = (prop: string, column: string, extra: Partial<ColumnModel> = {}): ColumnModel => ({
  prop,
  column,
  type: 'boolean',
  ...extra,
});

const id = (): ColumnModel => ({
  prop: 'id',
  column: 'id',
  type: 'integer',
  primaryKey: true,
  autoIncrement: true,
});

/** A 191-char surrogate key keeps MySQL utf8mb4 indexes within 3072 bytes. */
const userId = (prop = 'userId', column = 'user_id'): ColumnModel =>
  text(prop, column, { length: 191, notNull: true });

const playerUuid = (prop = 'playerUuid', column = 'player_uuid'): ColumnModel =>
  text(prop, column, { length: 64, notNull: true });

/** Enum-typed VARCHAR column. */
const enumText = (
  prop: string,
  column: string,
  tsType: string,
  extra: Partial<ColumnModel> = {},
): ColumnModel => text(prop, column, { length: 32, tsType, ...extra });

export const tables: TableModel[] = [
  // ------------------------------------------------------------------ identity
  {
    name: 'user',
    columns: [
      text('id', 'id', { length: 191, primaryKey: true }),
      text('email', 'email', { length: 255, notNull: true, unique: true }),
      bool('emailVerified', 'email_verified', { notNull: true, default: false }),
      text('name', 'name', { length: 64, notNull: true, unique: true }),
      text('avatarUrl', 'avatar_url'),
      enumText('role', 'role', '(typeof USER_ROLES)[number]', {
        notNull: true,
        default: 'user',
      }),
      bool('banned', 'banned', { notNull: true, default: false }),
      text('mutedUntil', 'muted_until', { type: 'timestamp' }),
      text('signature', 'signature'),
      now('createdAt', 'created_at'),
      now('updatedAt', 'updated_at'),
    ],
  },
  {
    name: 'session',
    columns: [
      text('id', 'id', { length: 191, primaryKey: true }),
      now('expiresAt', 'expires_at', { defaultFn: undefined }),
      text('token', 'token', { length: 255, notNull: true, unique: true }),
      now('createdAt', 'created_at', { defaultFn: undefined }),
      now('updatedAt', 'updated_at', { defaultFn: undefined }),
      text('ipAddress', 'ip_address', { length: 64 }),
      text('userAgent', 'user_agent'),
      userId(),
    ],
    indexes: [{ name: 'session_user_id_idx', columns: ['userId'] }],
  },
  {
    name: 'account',
    columns: [
      text('id', 'id', { length: 191, primaryKey: true }),
      text('accountId', 'account_id', { length: 191, notNull: true }),
      text('providerId', 'provider_id', { length: 64, notNull: true }),
      userId(),
      text('accessToken', 'access_token'),
      text('refreshToken', 'refresh_token'),
      text('idToken', 'id_token'),
      text('accessTokenExpiresAt', 'access_token_expires_at', { type: 'timestamp' }),
      text('refreshTokenExpiresAt', 'refresh_token_expires_at', { type: 'timestamp' }),
      text('scope', 'scope'),
      text('password', 'password'),
      now('createdAt', 'created_at', { defaultFn: undefined }),
      now('updatedAt', 'updated_at', { defaultFn: undefined }),
    ],
    indexes: [{ name: 'account_user_id_idx', columns: ['userId'] }],
  },
  {
    name: 'verification',
    columns: [
      text('id', 'id', { length: 191, primaryKey: true }),
      text('identifier', 'identifier', { length: 191, notNull: true }),
      text('value', 'value', { notNull: true }),
      now('expiresAt', 'expires_at', { defaultFn: undefined }),
      now('createdAt', 'created_at', { defaultFn: undefined, notNull: false }),
      now('updatedAt', 'updated_at', { defaultFn: undefined, notNull: false }),
    ],
    indexes: [{ name: 'verification_identifier_idx', columns: ['identifier'] }],
  },

  // --------------------------------------------------------------- game identity
  {
    name: 'player',
    columns: [
      text('uuid', 'uuid', { length: 64, primaryKey: true }),
      text('userId', 'user_id', { length: 191, notNull: true, unique: true }),
      text('nickname', 'nickname', { length: 64, notNull: true, unique: true }),
      {
        prop: 'nicknameHistory',
        column: 'nickname_history',
        type: 'json',
        tsType: 'string[]',
        notNull: true,
        defaultFn: 'emptyArray',
      },
      text('previousNickname', 'previous_nickname', { length: 64 }),
      text('nameCooldownAt', 'name_cooldown_at', { type: 'timestamp' }),
      bool('banned', 'banned', { notNull: true, default: false }),
      now('createdAt', 'created_at'),
    ],
  },
  {
    name: 'nickname_reservation',
    columns: [
      text('nickname', 'nickname', { length: 64, primaryKey: true }),
      playerUuid(),
      now('reservedUntil', 'reserved_until', { defaultFn: undefined }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'nickname_reservation_player_uuid_idx', columns: ['playerUuid'] },
      { name: 'nickname_reservation_reserved_until_idx', columns: ['reservedUntil'] },
    ],
  },
  {
    name: 'token',
    columns: [
      id(),
      playerUuid(),
      text('accessTokenHash', 'access_token_hash', { length: 128, notNull: true, unique: true }),
      text('refreshTokenHash', 'refresh_token_hash', { length: 128, notNull: true, unique: true }),
      text('clientTokenHash', 'client_token_hash', { length: 128 }),
      text('deviceName', 'device_name', { length: 128 }),
      text('ip', 'ip', { length: 64 }),
      now('expiresAt', 'expires_at', { defaultFn: undefined }),
      text('lastUsedAt', 'last_used_at', { type: 'timestamp' }),
      text('revokedAt', 'revoked_at', { type: 'timestamp' }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'token_player_uuid_idx', columns: ['playerUuid'] },
      { name: 'token_expires_at_idx', columns: ['expiresAt'] },
    ],
  },
  {
    name: 'oauth_code',
    columns: [
      id(),
      text('codeHash', 'code_hash', { length: 128, notNull: true, unique: true }),
      userId(),
      text('clientId', 'client_id', { length: 191 }),
      text('redirectUri', 'redirect_uri', { notNull: true }),
      text('scope', 'scope'),
      text('codeChallenge', 'code_challenge', { length: 128 }),
      enumText('codeChallengeMethod', 'code_challenge_method', "'S256' | 'plain'"),
      now('expiresAt', 'expires_at', { defaultFn: undefined }),
      text('usedAt', 'used_at', { type: 'timestamp' }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'oauth_code_user_id_idx', columns: ['userId'] },
      { name: 'oauth_code_expires_at_idx', columns: ['expiresAt'] },
    ],
  },
  {
    name: 'game_session',
    columns: [
      id(),
      playerUuid(),
      text('serverId', 'server_id', { length: 128, notNull: true }),
      text('ip', 'ip', { length: 64 }),
      now('createdAt', 'created_at'),
      now('expiresAt', 'expires_at', { defaultFn: undefined }),
    ],
    indexes: [
      {
        name: 'game_session_player_server_unique',
        columns: ['playerUuid', 'serverId'],
        unique: true,
      },
      { name: 'game_session_server_id_idx', columns: ['serverId'] },
      { name: 'game_session_expires_at_idx', columns: ['expiresAt'] },
    ],
  },
  {
    name: 'server_entry',
    columns: [
      id(),
      text('serverId', 'server_id', { length: 128, notNull: true, unique: true }),
      text('name', 'name', { length: 128, notNull: true }),
      text('secret', 'secret', { length: 128, notNull: true }),
      bool('enabled', 'enabled', { notNull: true, default: true }),
      now('createdAt', 'created_at'),
    ],
  },
  {
    name: 'skin',
    columns: [
      id(),
      playerUuid(),
      enumText('kind', 'kind', '(typeof SKIN_KINDS)[number]', { notNull: true }),
      enumText('variant', 'variant', '(typeof SKIN_VARIANTS)[number]'),
      text('filePath', 'file_path', { notNull: true }),
      text('sha256', 'sha256', { length: 64, notNull: true }),
      text('textureUrl', 'texture_url'),
      enumText('status', 'status', '(typeof SKIN_STATUSES)[number]', {
        notNull: true,
        default: 'pending',
      }),
      bool('isActive', 'is_active', { notNull: true, default: false }),
      /**
       * MySQL cannot enforce a partial unique index. The application writes
       * `player_uuid:kind` here while the texture is active and NULL otherwise,
       * so the regular unique index below allows many inactive rows but only
       * one active row per (player, kind).
       */
      text('activeSlot', 'active_slot', { length: 128 }),
      now('uploadedAt', 'uploaded_at'),
      text('reviewedBy', 'reviewed_by', { length: 191 }),
    ],
    indexes: [
      { name: 'skin_player_uuid_idx', columns: ['playerUuid'] },
      { name: 'skin_sha256_idx', columns: ['sha256'] },
      { name: 'skin_status_idx', columns: ['status'] },
      { name: 'skin_is_active_idx', columns: ['isActive'] },
      {
        name: 'skin_active_unique_idx',
        columns: ['playerUuid', 'kind', 'activeSlot'],
        unique: true,
      },
      {
        name: 'skin_player_kind_sha_unique',
        columns: ['playerUuid', 'kind', 'sha256'],
        unique: true,
      },
    ],
  },

  // --------------------------------------------------------------------- forum
  {
    name: 'category',
    columns: [
      id(),
      text('name', 'name', { length: 128, notNull: true }),
      text('slug', 'slug', { length: 128, notNull: true, unique: true }),
      text('description', 'description'),
      int('sortOrder', 'sort_order', { notNull: true, default: 0 }),
      {
        prop: 'parentId',
        column: 'parent_id',
        type: 'integer',
        references: { table: 'category', column: 'id', onDelete: 'set null' },
      },
    ],
  },
  {
    name: 'post',
    columns: [
      id(),
      int('categoryId', 'category_id', {
        notNull: true,
        references: { table: 'category', column: 'id', onDelete: 'restrict' },
      }),
      userId('authorId', 'author_id'),
      text('title', 'title', { length: 255, notNull: true }),
      text('contentMd', 'content_md', { notNull: true }),
      enumText('status', 'status', '(typeof POST_STATUSES)[number]', {
        notNull: true,
        default: 'published',
      }),
      bool('pinned', 'pinned', { notNull: true, default: false }),
      bool('featured', 'featured', { notNull: true, default: false }),
      bool('locked', 'locked', { notNull: true, default: false }),
      now('lastActivityAt', 'last_activity_at'),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'post_category_id_idx', columns: ['categoryId'] },
      { name: 'post_author_id_idx', columns: ['authorId'] },
      { name: 'post_status_idx', columns: ['status'] },
      { name: 'post_status_last_activity_idx', columns: ['status', 'lastActivityAt'] },
      {
        name: 'post_category_status_activity_idx',
        columns: ['categoryId', 'status', 'lastActivityAt'],
      },
      { name: 'post_pinned_idx', columns: ['pinned'] },
      { name: 'post_last_activity_at_idx', columns: ['lastActivityAt'] },
    ],
  },
  {
    name: 'reply',
    columns: [
      id(),
      int('postId', 'post_id', {
        notNull: true,
        references: { table: 'post', column: 'id', onDelete: 'cascade' },
      }),
      userId('authorId', 'author_id'),
      text('contentMd', 'content_md', { notNull: true }),
      enumText('status', 'status', '(typeof REPLY_STATUSES)[number]', {
        notNull: true,
        default: 'published',
      }),
      int('floor', 'floor', { notNull: true }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'reply_post_id_idx', columns: ['postId'] },
      { name: 'reply_post_status_floor_idx', columns: ['postId', 'status', 'floor'] },
      { name: 'reply_author_id_idx', columns: ['authorId'] },
      { name: 'reply_post_floor_unique', columns: ['postId', 'floor'], unique: true },
    ],
  },
  {
    name: 'vote',
    columns: [
      id(),
      userId(),
      enumText('targetType', 'target_type', '(typeof VOTE_TARGET_TYPES)[number]', {
        notNull: true,
      }),
      int('targetId', 'target_id', { notNull: true }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      {
        name: 'vote_user_target_unique_idx',
        columns: ['userId', 'targetType', 'targetId'],
        unique: true,
      },
      { name: 'vote_target_idx', columns: ['targetType', 'targetId'] },
    ],
  },
  {
    name: 'report',
    columns: [
      id(),
      enumText('targetType', 'target_type', '(typeof REPORT_TARGET_TYPES)[number]', {
        notNull: true,
      }),
      text('targetId', 'target_id', { length: 191, notNull: true }),
      userId('reporterId', 'reporter_id'),
      text('reason', 'reason', { notNull: true }),
      enumText('status', 'status', '(typeof REPORT_STATUSES)[number]', {
        notNull: true,
        default: 'pending',
      }),
      text('handledBy', 'handled_by', { length: 191 }),
      now('createdAt', 'created_at'),
    ],
    indexes: [{ name: 'report_status_idx', columns: ['status'] }],
  },
  {
    name: 'notification',
    columns: [
      id(),
      userId(),
      enumText('type', 'type', '(typeof NOTIFICATION_TYPES)[number]', { notNull: true }),
      text('actorId', 'actor_id', { length: 191 }),
      text('message', 'message'),
      text('link', 'link', { length: 255 }),
      text('readAt', 'read_at', { type: 'timestamp' }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'notification_user_id_idx', columns: ['userId'] },
      { name: 'notification_read_at_idx', columns: ['readAt'] },
      { name: 'notification_user_read_idx', columns: ['userId', 'readAt'] },
      {
        name: 'notification_user_read_created_idx',
        columns: ['userId', 'readAt', 'createdAt'],
      },
    ],
  },
  {
    name: 'moderation_log',
    columns: [
      id(),
      text('actorId', 'actor_id', { length: 191 }),
      enumText('action', 'action', '(typeof MODERATION_ACTIONS)[number]', { notNull: true }),
      text('targetType', 'target_type', { length: 32, notNull: true }),
      text('targetId', 'target_id', { length: 191, notNull: true }),
      text('reason', 'reason'),
      now('createdAt', 'created_at'),
    ],
  },
  {
    name: 'upload_usage',
    columns: [
      userId(),
      enumText('kind', 'kind', '(typeof UPLOAD_KINDS)[number]', { notNull: true }),
      text('day', 'day', { length: 10, notNull: true }),
      int('count', 'count', { notNull: true, default: 0 }),
    ],
    primaryKey: ['userId', 'kind', 'day'],
  },

  // ---------------------------------------------------------------- site / growth
  {
    name: 'site_setting',
    columns: [
      text('key', 'key', { length: 128, primaryKey: true }),
      text('value', 'value', { notNull: true }),
      now('updatedAt', 'updated_at'),
      text('updatedBy', 'updated_by', { length: 191 }),
    ],
  },
  {
    name: 'user_progress',
    columns: [
      text('userId', 'user_id', { length: 191, primaryKey: true }),
      int('xp', 'xp', { notNull: true, default: 0 }),
      int('level', 'level', { notNull: true, default: 1 }),
      int('points', 'points', { notNull: true, default: 0 }),
      int('checkinStreak', 'checkin_streak', { notNull: true, default: 0 }),
      text('lastCheckinOn', 'last_checkin_on', { length: 10 }),
      int('totalCheckins', 'total_checkins', { notNull: true, default: 0 }),
      text('xpBoostUntil', 'xp_boost_until', { type: 'timestamp' }),
      text('capeUnlockedAt', 'cape_unlocked_at', { type: 'timestamp' }),
      now('createdAt', 'created_at'),
      now('updatedAt', 'updated_at'),
    ],
    indexes: [
      { name: 'user_progress_xp_idx', columns: ['xp'] },
      { name: 'user_progress_points_idx', columns: ['points'] },
    ],
  },
  {
    name: 'daily_checkin',
    columns: [
      id(),
      userId(),
      text('checkinOn', 'checkin_on', { length: 10, notNull: true }),
      int('streak', 'streak', { notNull: true, default: 1 }),
      int('xpAwarded', 'xp_awarded', { notNull: true, default: 0 }),
      int('pointsAwarded', 'points_awarded', { notNull: true, default: 0 }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'daily_checkin_user_day_unique', columns: ['userId', 'checkinOn'], unique: true },
      { name: 'daily_checkin_day_idx', columns: ['checkinOn'] },
    ],
  },
  {
    name: 'point_transaction',
    columns: [
      id(),
      userId(),
      int('amount', 'amount', { notNull: true }),
      int('balanceAfter', 'balance_after', { notNull: true }),
      enumText('reason', 'reason', '(typeof POINT_REASONS)[number]', { notNull: true }),
      text('memo', 'memo'),
      text('refId', 'ref_id', { length: 191 }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'point_transaction_user_idx', columns: ['userId'] },
      { name: 'point_transaction_created_idx', columns: ['createdAt'] },
    ],
  },
  {
    name: 'title',
    columns: [
      id(),
      text('name', 'name', { length: 64, notNull: true, unique: true }),
      enumText('kind', 'kind', '(typeof TITLE_KINDS)[number]', {
        notNull: true,
        default: 'special',
      }),
      text('description', 'description'),
      text('color', 'color', { length: 16, notNull: true, default: '#8b5cf6' }),
      text('createdBy', 'created_by', { length: 191 }),
      now('createdAt', 'created_at'),
    ],
  },
  {
    name: 'user_title',
    columns: [
      id(),
      userId(),
      int('titleId', 'title_id', {
        notNull: true,
        references: { table: 'title', column: 'id', onDelete: 'cascade' },
      }),
      text('grantedBy', 'granted_by', { length: 191 }),
      now('grantedAt', 'granted_at'),
    ],
    indexes: [
      {
        name: 'user_title_user_title_unique',
        columns: ['userId', 'titleId'],
        unique: true,
      },
      { name: 'user_title_user_idx', columns: ['userId'] },
    ],
  },
  {
    name: 'title_application',
    columns: [
      id(),
      userId(),
      text('proposedName', 'proposed_name', { length: 64, notNull: true }),
      text('reason', 'reason', { notNull: true }),
      enumText('status', 'status', '(typeof TITLE_APPLICATION_STATUSES)[number]', {
        notNull: true,
        default: 'pending',
      }),
      int('resultTitleId', 'result_title_id', {
        references: { table: 'title', column: 'id', onDelete: 'set null' },
      }),
      text('reviewedBy', 'reviewed_by', { length: 191 }),
      text('reviewedAt', 'reviewed_at', { type: 'timestamp' }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'title_application_status_idx', columns: ['status'] },
      { name: 'title_application_user_idx', columns: ['userId'] },
    ],
  },
  {
    name: 'banner',
    columns: [
      id(),
      userId(),
      text('title', 'title', { length: 64, notNull: true }),
      text('description', 'description'),
      text('href', 'href', { length: 255 }),
      enumText('status', 'status', '(typeof BANNER_STATUSES)[number]', {
        notNull: true,
        default: 'pending',
      }),
      int('pointsSpent', 'points_spent', { notNull: true, default: 0 }),
      text('startsAt', 'starts_at', { type: 'timestamp' }),
      text('endsAt', 'ends_at', { type: 'timestamp' }),
      text('reviewedBy', 'reviewed_by', { length: 191 }),
      text('reviewedAt', 'reviewed_at', { type: 'timestamp' }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'banner_status_idx', columns: ['status'] },
      { name: 'banner_user_idx', columns: ['userId'] },
      { name: 'banner_window_idx', columns: ['startsAt', 'endsAt'] },
    ],
  },

  // --------------------------------------------------------------- captcha / acl
  {
    name: 'captcha_challenge',
    columns: [
      text('id', 'id', { length: 64, primaryKey: true }),
      text('answerHash', 'answer_hash', { length: 128, notNull: true }),
      text('provider', 'provider', { length: 32, notNull: true, default: 'builtin' }),
      now('expiresAt', 'expires_at', { defaultFn: undefined }),
      int('attempts', 'attempts', { notNull: true, default: 0 }),
      text('verifiedAt', 'verified_at', { type: 'timestamp' }),
      text('tokenUsedAt', 'token_used_at', { type: 'timestamp' }),
      now('createdAt', 'created_at'),
    ],
    indexes: [
      { name: 'captcha_challenge_expires_idx', columns: ['expiresAt'] },
      { name: 'captcha_challenge_token_used_idx', columns: ['tokenUsedAt'] },
    ],
  },
  {
    name: 'user_permission',
    columns: [
      userId(),
      enumText('permission', 'permission', '(typeof ADMIN_PERMISSIONS)[number]', {
        notNull: true,
      }),
      text('grantedBy', 'granted_by', { length: 191 }),
      now('grantedAt', 'granted_at'),
    ],
    primaryKey: ['userId', 'permission'],
    indexes: [{ name: 'user_permission_user_idx', columns: ['userId'] }],
  },
];

/** Tables in foreign-key dependency order (parents before children). */
export const tableOrder: string[] = [
  'user',
  'verification',
  'server_entry',
  'captcha_challenge',
  'session',
  'account',
  'player',
  'oauth_code',
  'category',
  'nickname_reservation',
  'token',
  'game_session',
  'skin',
  'post',
  'reply',
  'vote',
  'report',
  'notification',
  'moderation_log',
  'upload_usage',
  'site_setting',
  'user_progress',
  'daily_checkin',
  'point_transaction',
  'title',
  'user_title',
  'title_application',
  'banner',
  'user_permission',
];

export function tableByName(name: string): TableModel {
  const table = tables.find((candidate) => candidate.name === name);
  if (!table) {
    throw new Error(`Unknown table in schema model: ${name}`);
  }
  return table;
}
