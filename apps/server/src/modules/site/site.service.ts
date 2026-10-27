import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ROLE_RANK,
  STAFF_ROLES,
  SITE_CUSTOM_CSS_MAX_LENGTH,
  homeContentSchema,
  normalizeUserRole,
  roleAtLeast,
  type ConsoleStaffMember,
  type HomeContent,
  type PublicHomeResponse,
  type SiteDisplaySettings,
  type SiteSettings,
  type UpdateSiteSettingsRequest,
  type UserRole,
} from '@mcserauth/shared';
import { count, desc, eq, inArray, like, or } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { AppConfigService } from '../../config/app-config.service.js';
import { decryptSiteSecret, encryptSiteSecret } from '../../common/crypto/site-secret.js';
import { DbService } from '../../db/db.service.js';
import { moderationLog, siteSetting, user as userTable } from '../../db/schema/index.js';
import { ProgressService } from '../growth/progress.service.js';
import { NotificationsService } from '../forum/notifications.service.js';
const ROLE_LABELS: Record<UserRole, string> = {
  user: '注册用户',
  reviewer: '审核员',
  admin: '管理员',
  superadmin: '超级管理员',
};
export const MAX_SITE_ICON_BYTES = 1024 * 1024;
const ICON_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const ICON_FILENAME_PATTERN = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
const DISPLAY_DEFAULTS = {
  siteName: 'MCSerAuth 社区',
  tagline: 'Minecraft 服务器社区',
  description: 'Minecraft 服务器外置登录认证与玩家社区平台',
  footerText: 'MCSerAuth 社区 · 外置登录与玩家社区',
  announcement: null,
  contactEmail: null,
  iconUrl: null,
  customCss: null,
} satisfies SiteDisplaySettings;
/** Public site configuration plus superadmin/console role management. */
@Injectable()
export class SiteService {
  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationsService,
    private readonly progress: ProgressService,
  ) {}
  async getDisplaySettings(): Promise<SiteDisplaySettings> {
    const values = await this.readValues();
    return {
      siteName: this.stringValue(values, 'siteName', DISPLAY_DEFAULTS.siteName),
      tagline: this.stringValue(values, 'tagline', DISPLAY_DEFAULTS.tagline),
      description: this.stringValue(values, 'description', DISPLAY_DEFAULTS.description),
      footerText: this.stringValue(values, 'footerText', DISPLAY_DEFAULTS.footerText),
      announcement: this.nullableStringValue(values, 'announcement'),
      contactEmail: this.nullableStringValue(values, 'contactEmail'),
      iconUrl: this.iconUrl(values),
      customCss: this.nullableStringValue(values, 'customCss'),
    };
  }
  /** Editable landing-page content with defaults for a fresh deployment. */
  async getHomeContent(): Promise<HomeContent> {
    const stored = (await this.readValues()).get('homeContent');
    const parsed = homeContentSchema.safeParse(stored);
    return parsed.success ? parsed.data : await this.defaultHomeContent();
  }
  /** Public landing page payload: managed content plus active banners. */
  async getHome(): Promise<PublicHomeResponse> {
    return {
      content: await this.getHomeContent(),
      banners: await this.progress.listActiveBanners(),
    };
  }
  async getSettings(): Promise<SiteSettings> {
    const values = await this.readValues();
    return {
      ...(await this.getDisplaySettings()),
      mailProvider: this.mailProviderValue(values),
      mailFrom: this.stringValue(values, 'mailFrom', this.config.mailFrom),
      smtpHost: this.nullableStringValueOrFallback(
        values,
        'smtpHost',
        this.config.smtpHost ?? null,
      ),
      smtpPort: this.numberValue(values, 'smtpPort', this.config.smtpPort),
      smtpUser: this.nullableStringValueOrFallback(
        values,
        'smtpUser',
        this.config.smtpUser ?? null,
      ),
      smtpPassSet:
        this.stringValue(values, 'smtpPass', '') !== '' ||
        (this.config.smtpPass !== undefined && this.config.smtpPass !== ''),
    };
  }
  /** Decrypted mail credentials for future mail delivery. */
  async getMailConfig(): Promise<{
    provider: SiteSettings['mailProvider'];
    from: string;
    host: string | null;
    port: number;
    user: string | null;
    pass: string | null;
  }> {
    const values = await this.readValues();
    const storedPass = this.stringValue(values, 'smtpPass', '');
    return {
      provider: this.mailProviderValue(values),
      from: this.stringValue(values, 'mailFrom', this.config.mailFrom),
      host: this.nullableStringValueOrFallback(values, 'smtpHost', this.config.smtpHost ?? null),
      port: this.numberValue(values, 'smtpPort', this.config.smtpPort),
      user: this.nullableStringValueOrFallback(values, 'smtpUser', this.config.smtpUser ?? null),
      pass: storedPass === '' ? (this.config.smtpPass ?? null) : this.decryptSecret(storedPass),
    };
  }
  async updateSettings(
    input: UpdateSiteSettingsRequest,
    actorId: string | null,
  ): Promise<SiteSettings> {
    const changes = new Map<string, string>();
    if (input.siteName !== undefined) {
      changes.set('siteName', this.validateText(input.siteName, '站点名称', 40));
    }
    if (input.tagline !== undefined) {
      changes.set('tagline', this.validateText(input.tagline, '站点副标题', 80));
    }
    if (input.description !== undefined) {
      changes.set('description', this.validateText(input.description, '站点描述', 200));
    }
    if (input.footerText !== undefined) {
      changes.set('footerText', this.validateText(input.footerText, '页脚文案', 200));
    }
    if (input.announcement !== undefined) {
      changes.set('announcement', this.encodeNullableText(input.announcement, '全站公告', 300));
    }
    if (input.contactEmail !== undefined) {
      changes.set('contactEmail', this.encodeNullableEmail(input.contactEmail, '联系邮箱'));
    }
    if (input.customCss !== undefined) {
      changes.set('customCss', JSON.stringify(this.validateCss(input.customCss)));
    }
    if (input.homeContent !== undefined) {
      const parsed = homeContentSchema.safeParse(input.homeContent);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new BadRequestException(`首页内容不合法：${issue?.message ?? '格式错误'}`);
      }
      changes.set('homeContent', JSON.stringify(parsed.data));
    }
    if (input.mailProvider !== undefined) {
      if (!['console', 'smtp', 'resend'].includes(input.mailProvider)) {
        throw new BadRequestException('发件方式不受支持');
      }
      changes.set('mailProvider', JSON.stringify(input.mailProvider));
    }
    if (input.mailFrom !== undefined) {
      changes.set('mailFrom', JSON.stringify(this.validateEmail(input.mailFrom, '发件邮箱')));
    }
    if (input.smtpHost !== undefined) {
      changes.set('smtpHost', this.encodeNullableText(input.smtpHost, 'SMTP 主机', 255));
    }
    if (input.smtpPort !== undefined) {
      if (!Number.isInteger(input.smtpPort) || input.smtpPort < 1 || input.smtpPort > 65535) {
        throw new BadRequestException('SMTP 端口必须是 1–65535 的整数');
      }
      changes.set('smtpPort', JSON.stringify(input.smtpPort));
    }
    if (input.smtpUser !== undefined) {
      changes.set('smtpUser', this.encodeNullableText(input.smtpUser, 'SMTP 用户名', 255));
    }
    if (input.smtpPass !== undefined) {
      if (input.smtpPass === null || input.smtpPass.trim() === '') {
        changes.set('smtpPass', JSON.stringify(''));
      } else {
        if (input.smtpPass.length > 512) {
          throw new BadRequestException('SMTP 密码过长');
        }
        changes.set('smtpPass', JSON.stringify(this.encryptSecret(input.smtpPass)));
      }
    }
    if (changes.size === 0) {
      throw new BadRequestException('没有需要更新的配置');
    }
    await this.persist(changes, actorId);
    return await this.getSettings();
  }
  /**
   * Replaces the site icon. Files are content-addressed, so the public URL —
   * and therefore the browser favicon — changes as soon as the picture does.
   */
  async setIcon(
    file: Express.Multer.File | undefined,
    actorId: string | null,
  ): Promise<SiteDisplaySettings> {
    const buffer = file?.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('缺少图标文件（multipart 字段 file）');
    }
    if (buffer.length > MAX_SITE_ICON_BYTES) {
      throw new BadRequestException(`图标不得超过 ${MAX_SITE_ICON_BYTES / 1024} KiB`);
    }
    let format: string | undefined;
    try {
      format = (await sharp(buffer, { failOn: 'error', limitInputPixels: 4000000 }).metadata())
        .format;
    } catch {
      throw new BadRequestException('无法解析图标文件');
    }
    if (format !== 'png' && format !== 'jpeg' && format !== 'webp' && format !== 'gif') {
      throw new BadRequestException('仅支持 PNG / JPEG / WebP / GIF 图标');
    }
    const filename = `${createHash('sha256').update(buffer).digest('hex')}.${format === 'jpeg' ? 'jpg' : format}`;
    this.writeIconFile(filename, buffer);
    await this.persist(new Map([['siteIcon', JSON.stringify(filename)]]), actorId);
    return await this.getDisplaySettings();
  }
  async clearIcon(actorId: string | null): Promise<SiteDisplaySettings> {
    await this.persist(new Map([['siteIcon', JSON.stringify(null)]]), actorId);
    return await this.getDisplaySettings();
  }
  /** Icon bytes for the public `GET /site/icon/:filename` route. */
  readIcon(filename: string): {
    data: Buffer;
    contentType: string;
  } {
    if (!ICON_FILENAME_PATTERN.test(filename)) {
      throw new NotFoundException('图标不存在');
    }
    const absolutePath = path.resolve(this.config.uploadDir, 'site', filename);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('图标不存在');
    }
    const extension = filename.slice(filename.lastIndexOf('.') + 1);
    return {
      data: fs.readFileSync(absolutePath),
      contentType: ICON_CONTENT_TYPES[extension] ?? 'application/octet-stream',
    };
  }
  private async persist(changes: Map<string, string>, actorId: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [key, value] of changes) {
        await this.db.upsert(
          siteSetting,
          { key, value, updatedBy: actorId },
          {
            target: siteSetting.key,
            set: { value, updatedAt: new Date(), updatedBy: actorId },
          },
          tx,
        );
      }
      await tx.insert(moderationLog).values({
        actorId,
        action: 'update_site',
        targetType: 'site',
        targetId: 'settings',
        reason: `updated: ${[...changes.keys()].join(', ')}`,
      });
    });
  }
  private writeIconFile(filename: string, buffer: Buffer): void {
    const absolutePath = path.resolve(this.config.uploadDir, 'site', filename);
    if (fs.existsSync(absolutePath)) {
      return;
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, buffer, { flag: 'wx' });
  }
  /** User search for the root console (promoting a regular account). */
  async searchUsers(search: string | undefined, limit = 20): Promise<ConsoleStaffMember[]> {
    const term = search?.trim() ?? '';
    const condition =
      term === ''
        ? undefined
        : or(like(userTable.name, `%${term}%`), like(userTable.email, `%${term}%`));
    return (
      await this.db.db
        .select()
        .from(userTable)
        .where(condition)
        .orderBy(desc(userTable.createdAt))
        .limit(Math.min(50, Math.max(1, limit)))
    ).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: normalizeUserRole(row.role),
      createdAt: row.createdAt.toISOString(),
    }));
  }
  async listStaff(): Promise<ConsoleStaffMember[]> {
    return (
      await this.db.db
        .select()
        .from(userTable)
        .where(inArray(userTable.role, [...STAFF_ROLES]))
    )
      .map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: normalizeUserRole(row.role),
        createdAt: row.createdAt.toISOString(),
      }))
      .sort((left, right) => {
        const byRank = ROLE_RANK[right.role] - ROLE_RANK[left.role];
        return byRank !== 0 ? byRank : left.createdAt.localeCompare(right.createdAt);
      });
  }
  /**
   * Changes a staff role.
   *
   * Web superadmins may assign reviewer/admin only; the root console may assign
   * any role including superadmin, but can never remove the last superadmin.
   */
  async setUserRole(
    targetId: string,
    role: UserRole,
    actor: {
      actorId: string | null;
      actorRole: UserRole | null;
      source: 'web' | 'console';
    },
  ): Promise<ConsoleStaffMember> {
    const target = (await this.db.db.select().from(userTable).where(eq(userTable.id, targetId)))[0];
    if (!target) {
      throw new NotFoundException('用户不存在');
    }
    const currentRole = normalizeUserRole(target.role);
    if (currentRole === role) {
      throw new BadRequestException('该用户已经是此角色');
    }
    if (actor.source === 'web') {
      if (actor.actorRole === null || !roleAtLeast(actor.actorRole, 'superadmin')) {
        throw new ForbiddenException('仅超级管理员可以调整角色');
      }
      if (actor.actorId === targetId) {
        throw new ForbiddenException('不能修改自己的角色');
      }
      if (role === 'superadmin' || currentRole === 'superadmin') {
        throw new ForbiddenException('超级管理员只能在超级后台中调整');
      }
    } else if (currentRole === 'superadmin' && role !== 'superadmin') {
      const superadmins = (
        await this.db.db
          .select({ value: count() })
          .from(userTable)
          .where(eq(userTable.role, 'superadmin'))
      )[0];
      if ((superadmins?.value ?? 0) <= 1) {
        throw new ConflictException('必须至少保留一名超级管理员');
      }
    }
    await this.db.transaction(async (tx) => {
      await tx.update(userTable).set({ role }).where(eq(userTable.id, targetId));
      await tx.insert(moderationLog).values({
        actorId: actor.actorId,
        action: 'assign_role',
        targetType: 'user',
        targetId,
        reason: `${currentRole} -> ${role} (${actor.source})`,
      });
    });
    this.notifications.notifyModeration(targetId, `你的站点角色已调整为${ROLE_LABELS[role]}`);
    return {
      id: target.id,
      name: target.name,
      email: target.email,
      role,
      createdAt: target.createdAt.toISOString(),
    };
  }
  private async defaultHomeContent(): Promise<HomeContent> {
    const display = await this.getDisplaySettings();
    return {
      heroEyebrow: display.tagline,
      heroTitle: display.siteName,
      heroText: '一个账号，论坛与游戏通用。',
      primaryAction: { label: '进入论坛', href: '/forum' },
      secondaryAction: { label: '前往游戏账号管理', href: '/textures' },
      stats: [],
      steps: [
        '注册社区账号。',
        '在启动器中添加本站外置登录地址。',
        '进入服务器，皮肤与披风自动同步。',
      ],
      entries: [
        {
          title: '游戏账号管理',
          description: '管理游戏角色、皮肤与披风，游戏内立即生效。',
          href: '/textures',
          actionLabel: '进入游戏账号管理 →',
        },
        {
          title: '玩家论坛',
          description: '服务器动态、攻略与闲聊。',
          href: '/forum',
          actionLabel: '进入论坛 →',
        },
      ],
    };
  }
  private async readValues(): Promise<Map<string, unknown>> {
    const rows = await this.db.db.select().from(siteSetting);
    const values = new Map<string, unknown>();
    for (const row of rows) {
      try {
        values.set(row.key, JSON.parse(row.value) as unknown);
      } catch {
        values.set(row.key, row.value);
      }
    }
    return values;
  }
  private stringValue(values: Map<string, unknown>, key: string, fallback: string): string {
    const value = values.get(key);
    return typeof value === 'string' && value.trim() !== '' ? value : fallback;
  }
  private nullableStringValue(values: Map<string, unknown>, key: string): string | null {
    const value = values.get(key);
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }
  private iconUrl(values: Map<string, unknown>): string | null {
    const filename = this.nullableStringValue(values, 'siteIcon');
    if (filename === null || !ICON_FILENAME_PATTERN.test(filename)) {
      return null;
    }
    return `${this.config.authUrl.replace(/\/+$/, '')}/api/site/icon/${filename}`;
  }
  private nullableStringValueOrFallback(
    values: Map<string, unknown>,
    key: string,
    fallback: string | null,
  ): string | null {
    return values.has(key) ? this.nullableStringValue(values, key) : fallback;
  }
  private numberValue(values: Map<string, unknown>, key: string, fallback: number): number {
    const value = values.get(key);
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }
  private mailProviderValue(values: Map<string, unknown>): SiteSettings['mailProvider'] {
    const value = values.get('mailProvider');
    if (value === 'smtp' || value === 'resend' || value === 'console') {
      return value;
    }
    return this.config.mailProvider;
  }
  private validateText(value: string, label: string, maxLength: number): string {
    const trimmed = value.trim();
    if (trimmed === '') {
      throw new BadRequestException(`${label}不能为空`);
    }
    if (trimmed.length > maxLength) {
      throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`);
    }
    return JSON.stringify(trimmed);
  }
  private encodeNullableText(value: string | null, label: string, maxLength: number): string {
    const trimmed = value?.trim() ?? '';
    if (trimmed.length > maxLength) {
      throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`);
    }
    return JSON.stringify(trimmed === '' ? null : trimmed);
  }
  private encodeNullableEmail(value: string | null, label: string): string {
    const trimmed = value?.trim() ?? '';
    if (trimmed === '') {
      return JSON.stringify(null);
    }
    return JSON.stringify(this.validateEmail(trimmed, label));
  }
  /**
   * Normalises the superadmin stylesheet. The web layout inlines it inside a
   * `<style>` element, so an end tag there would escape into the document.
   */
  private validateCss(value: string | null): string | null {
    const trimmed = value?.trim() ?? '';
    if (trimmed === '') {
      return null;
    }
    if (trimmed.length > SITE_CUSTOM_CSS_MAX_LENGTH) {
      throw new BadRequestException(`自定义 CSS 不能超过 ${SITE_CUSTOM_CSS_MAX_LENGTH} 个字符`);
    }
    if (/<\/\s*style/i.test(trimmed)) {
      throw new BadRequestException('自定义 CSS 不能包含 </style>');
    }
    return trimmed;
  }
  private validateEmail(value: string, label: string): string {
    const trimmed = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
      throw new BadRequestException(`${label}格式不正确`);
    }
    return trimmed;
  }
  private encryptSecret(plain: string): string {
    return encryptSiteSecret(plain, this.config.betterAuthSecret);
  }
  private decryptSecret(stored: string): string | null {
    return decryptSiteSecret(stored, this.config.betterAuthSecret);
  }
}
