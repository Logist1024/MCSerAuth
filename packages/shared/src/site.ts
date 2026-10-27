import { z } from 'zod';
import type { BannerSummary } from './growth.js';
import type { UserRole } from './enums.js';

/**
 * Site configuration contracts.
 *
 * Display fields are public and drive the rendered site (title, footer, banner).
 * Mail fields are only exposed to the key-protected root console.
 */

/** Inline CSS length limit; the editor and the API validator share this value. */
export const SITE_CUSTOM_CSS_MAX_LENGTH = 20_000;

export interface SiteDisplaySettings {
  siteName: string;
  tagline: string;
  description: string;
  footerText: string;
  /** Banner shown above the page content; null hides it. */
  announcement: string | null;
  contactEmail: string | null;
  /** Absolute URL of the uploaded site icon (header brand and favicon); null uses the built-in mark. */
  iconUrl: string | null;
  /** Superadmin stylesheet appended after the built-in theme; null disables it. */
  customCss: string | null;
}

export type MailProvider = 'console' | 'smtp' | 'resend';

export interface SiteSettings extends SiteDisplaySettings {
  mailProvider: MailProvider;
  mailFrom: string;
  smtpHost: string | null;
  smtpPort: number;
  smtpUser: string | null;
  /** Whether a SMTP password is stored. The secret itself is never returned. */
  smtpPassSet: boolean;
}

export interface UpdateSiteSettingsRequest {
  siteName?: string;
  tagline?: string;
  description?: string;
  footerText?: string;
  announcement?: string | null;
  contactEmail?: string | null;
  /** Null or blank clears the custom stylesheet. */
  customCss?: string | null;
  homeContent?: HomeContent;
  mailProvider?: MailProvider;
  mailFrom?: string;
  smtpHost?: string | null;
  smtpPort?: number;
  smtpUser?: string | null;
  /** Empty string clears the stored password. */
  smtpPass?: string | null;
}

/** Editable landing-page blocks managed by superadmins or delegated staff. */
export interface HomeAction {
  label: string;
  href: string;
}

export interface HomeStat {
  label: string;
  value: string;
}

export interface HomeEntry {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}

export interface HomeContent {
  heroEyebrow: string;
  heroTitle: string;
  heroText: string;
  primaryAction: HomeAction;
  secondaryAction: HomeAction;
  /** Hero stat strip (recommended 3 items). */
  stats: HomeStat[];
  /** Short onboarding steps shown beside the community entries. */
  steps: string[];
  entries: HomeEntry[];
}

export const HOME_CONTENT_LIMITS = {
  stats: 4,
  steps: 6,
  entries: 4,
} as const;

const hrefSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^(\/(?!\/)|https?:\/\/)/i, '链接必须以 / 或 http(s):// 开头');

/** Validates admin-submitted landing-page content before it is persisted. */
export const homeContentSchema: z.ZodType<HomeContent> = z.object({
  heroEyebrow: z.string().trim().max(80),
  heroTitle: z.string().trim().min(1).max(60),
  heroText: z.string().trim().max(300),
  primaryAction: z.object({ label: z.string().trim().min(1).max(30), href: hrefSchema }),
  secondaryAction: z.object({ label: z.string().trim().min(1).max(30), href: hrefSchema }),
  stats: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(30),
        value: z.string().trim().min(1).max(40),
      }),
    )
    .max(HOME_CONTENT_LIMITS.stats),
  steps: z.array(z.string().trim().min(1).max(200)).max(HOME_CONTENT_LIMITS.steps),
  entries: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(40),
        description: z.string().trim().max(200),
        href: hrefSchema,
        actionLabel: z.string().trim().min(1).max(30),
      }),
    )
    .max(HOME_CONTENT_LIMITS.entries),
});

export interface PublicHomeResponse {
  content: HomeContent;
  banners: BannerSummary[];
}

export interface ConsoleSessionResponse {
  /** False when CONSOLE_KEY is not configured on the server. */
  enabled: boolean;
  authenticated: boolean;
  expiresAt: string | null;
}

export interface ConsoleLoginRequest {
  key: string;
}

export interface ConsoleStaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface UpdateUserRoleRequest {
  role: UserRole;
}
