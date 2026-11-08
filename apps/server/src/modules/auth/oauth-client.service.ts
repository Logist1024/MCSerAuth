import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OAUTH_DEFAULT_SCOPES,
  OAUTH_SCOPES,
  parseOAuthScopes,
  type AdminOauthClientListResponse,
  type AdminOauthClientView,
  type CreateOauthClientRequest,
  type OAuthScope,
  type UpdateOauthClientRequest,
  type UserAuthorizationView,
} from '@mcserauth/shared';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import {
  oauthClient,
  oauthConsent,
  player as playerTable,
  token as tokenTable,
} from '../../db/schema/index.js';
import { generateOpaqueToken, isAllowedRedirectUri, sha256, verifySha256 } from './oauth.util.js';

export type OauthClientRow = typeof oauthClient.$inferSelect;
type OauthConsentRow = typeof oauthConsent.$inferSelect;

/**
 * Registry and consent store for registered OAuth clients (sibling services).
 *
 * Registered clients get strict validation — exact redirect_uri matching and
 * a scope allow-list — while the launcher flow without a `client_id` keeps
 * its legacy behaviour. Secrets are generated server-side and only their
 * SHA-256 hashes are persisted; the plaintext is returned exactly once.
 */
@Injectable()
export class OAuthClientService {
  constructor(private readonly db: DbService) {}

  async findClient(clientId: string): Promise<OauthClientRow | null> {
    return (
      (await this.db.db.select().from(oauthClient).where(eq(oauthClient.clientId, clientId)))[0] ??
      null
    );
  }

  async findEnabledClient(clientId: string): Promise<OauthClientRow | null> {
    const row = await this.findClient(clientId);
    return row?.enabled ? row : null;
  }

  /** Registered clients must replay one of their registered callbacks verbatim. */
  assertRedirectAllowed(client: OauthClientRow, redirectUri: string): void {
    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException('redirect_uri 与该客户端注册的回调地址不匹配');
    }
    if (!isAllowedRedirectUri(redirectUri)) {
      throw new BadRequestException(
        'redirect_uri 不合法：仅允许 HTTPS 或本机（localhost/127.0.0.1）HTTP 地址',
      );
    }
  }

  /**
   * Resolves the effective scope set for an authorization request: the
   * requested scopes clamped to the client's allow-list. `basic` is always
   * granted; omitting `scope` falls back to the default set.
   */
  resolveRequestedScopes(client: OauthClientRow, rawScope: string | undefined): OAuthScope[] {
    if (rawScope === undefined || rawScope === '') {
      return [...OAUTH_DEFAULT_SCOPES];
    }
    const tokens = rawScope
      .split(/[\s+]+/)
      .map((token) => token.trim())
      .filter((token) => token !== '');
    const unknown = tokens.filter((token) => !(OAUTH_SCOPES as readonly string[]).includes(token));
    if (unknown.length > 0) {
      throw new BadRequestException(`不支持的 scope：${unknown.join(', ')}`);
    }
    const requested = [...new Set(tokens)] as OAuthScope[];
    const disallowed = requested.filter((scope) => !client.allowedScopes.includes(scope));
    if (disallowed.length > 0) {
      throw new BadRequestException(`该客户端未被授权使用 scope：${disallowed.join(', ')}`);
    }
    return [...new Set(['basic' as const, ...requested])];
  }

  verifyClientSecret(client: OauthClientRow, clientSecret: string | undefined): void {
    if (client.clientSecretHash === null) {
      return;
    }
    if (clientSecret === undefined) {
      throw new BadRequestException('该客户端为机密客户端，需要提供 client_secret');
    }
    if (!verifySha256(clientSecret, client.clientSecretHash)) {
      throw new UnauthorizedException('client_secret 不正确');
    }
  }

  // --------------------------------------------------------------- consent

  async findConsent(userId: string, clientId: string): Promise<OauthConsentRow | null> {
    return (
      (
        await this.db.db
          .select()
          .from(oauthConsent)
          .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
      )[0] ?? null
    );
  }

  /** True when an existing remembered grant covers every requested scope. */
  consentCovers(consent: OauthConsentRow, scopes: OAuthScope[]): boolean {
    const granted = parseOAuthScopes(consent.scope);
    return scopes.every((scope) => granted.includes(scope));
  }

  /**
   * Stores (or widens) the remembered grant. The union keeps earlier approvals
   * valid so a client asking for a subset never triggers a re-confirm.
   */
  async saveConsent(userId: string, clientId: string, scopes: OAuthScope[]): Promise<void> {
    const existing = await this.findConsent(userId, clientId);
    if (existing) {
      await this.widenConsent(existing.id, existing.scope, scopes);
      return;
    }
    try {
      await this.db.db.insert(oauthConsent).values({ userId, clientId, scope: scopes.join(' ') });
    } catch (error) {
      // Lost an insert race against a concurrent first approval (unique index
      // on userId + clientId): merge into the winning row instead of failing.
      const raced = await this.findConsent(userId, clientId);
      if (!raced) {
        throw error;
      }
      await this.widenConsent(raced.id, raced.scope, scopes);
    }
  }

  private async widenConsent(
    id: number,
    currentScope: string,
    scopes: OAuthScope[],
  ): Promise<void> {
    const merged = [...new Set([...parseOAuthScopes(currentScope), ...scopes])].join(' ');
    await this.db.db
      .update(oauthConsent)
      .set({ scope: merged, grantedAt: new Date() })
      .where(eq(oauthConsent.id, id));
  }

  async listConsentsForUser(userId: string): Promise<UserAuthorizationView[]> {
    const rows = await this.db.db
      .select({ consent: oauthConsent, client: oauthClient })
      .from(oauthConsent)
      .innerJoin(oauthClient, eq(oauthConsent.clientId, oauthClient.clientId))
      .where(eq(oauthConsent.userId, userId))
      .orderBy(asc(oauthConsent.grantedAt));
    const counts = await this.countActiveTokensByClient(
      rows.map((row) => row.consent.clientId),
      userId,
    );
    return rows.map((row) => ({
      clientId: row.consent.clientId,
      clientName: row.client.name,
      scopes: parseOAuthScopes(row.consent.scope),
      grantedAt: row.consent.grantedAt.toISOString(),
      activeTokens: counts.get(row.consent.clientId) ?? 0,
    }));
  }

  /** Removes the remembered grant; `revokeTokens` also kills live tokens. */
  async revokeConsent(userId: string, clientId: string, revokeTokens: boolean): Promise<boolean> {
    const existing = await this.findConsent(userId, clientId);
    if (!existing) {
      return false;
    }
    await this.db.db.delete(oauthConsent).where(eq(oauthConsent.id, existing.id));
    if (revokeTokens) {
      await this.revokeClientTokens(clientId, userId);
    }
    return true;
  }

  /** Revokes every live token pair issued for a client (optionally one user only). */
  async revokeClientTokens(clientId: string, userId?: string): Promise<number> {
    const conditions = [eq(tokenTable.clientId, clientId), isNull(tokenTable.revokedAt)];
    if (userId !== undefined) {
      const players = await this.db.db
        .select({ uuid: playerTable.uuid })
        .from(playerTable)
        .where(eq(playerTable.userId, userId));
      if (players.length === 0) {
        return 0;
      }
      conditions.push(
        inArray(
          tokenTable.playerUuid,
          players.map((player) => player.uuid),
        ),
      );
    }
    const updated = await this.db.updateReturning(
      tokenTable,
      { revokedAt: new Date() },
      and(...conditions),
    );
    return updated.length;
  }

  private async countActiveTokensByClient(
    clientIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    if (clientIds.length === 0) {
      return new Map();
    }
    const rows = await this.db.db
      .select({ clientId: tokenTable.clientId, total: count() })
      .from(tokenTable)
      .innerJoin(
        playerTable,
        and(eq(tokenTable.playerUuid, playerTable.uuid), eq(playerTable.userId, userId)),
      )
      .where(and(inArray(tokenTable.clientId, clientIds), isNull(tokenTable.revokedAt)))
      .groupBy(tokenTable.clientId);
    return new Map(rows.map((row) => [row.clientId ?? '', Number(row.total)]));
  }

  // ----------------------------------------------------------- admin CRUD

  async listClients(page: number, pageSize: number): Promise<AdminOauthClientListResponse> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const totals = await this.db.db.select({ total: count() }).from(oauthClient);
    const total = totals[0]?.total ?? 0;
    const rows = await this.db.db
      .select()
      .from(oauthClient)
      .orderBy(asc(oauthClient.id))
      .limit(safeSize)
      .offset((safePage - 1) * safeSize);
    return {
      items: rows.map((row) => this.toView(row)),
      total: Number(total),
      page: safePage,
      pageSize: safeSize,
    };
  }

  async createClient(input: CreateOauthClientRequest): Promise<AdminOauthClientView> {
    const clientId = input.clientId ?? generateOpaqueToken('mcs_cli_');
    const existing = await this.findClient(clientId);
    if (existing) {
      throw new BadRequestException('client_id 已存在');
    }
    this.assertRedirectUrisValid(input.redirectUris);
    // Omitting the secret creates a public (PKCE-only) client.
    const clientSecret = input.clientSecret ?? null;
    await this.db.db.insert(oauthClient).values({
      clientId,
      clientSecretHash: clientSecret !== null ? sha256(clientSecret) : null,
      name: input.name,
      description: input.description ?? null,
      redirectUris: input.redirectUris,
      allowedScopes: this.normalizeScopes(input.allowedScopes),
      enabled: input.enabled ?? true,
      updatedAt: new Date(),
    });
    const row = (await this.findClient(clientId))!;
    return clientSecret !== null ? { ...this.toView(row), clientSecret } : this.toView(row);
  }

  async updateClient(
    clientId: string,
    input: UpdateOauthClientRequest,
  ): Promise<AdminOauthClientView> {
    const row = await this.findClient(clientId);
    if (!row) {
      throw new NotFoundException('客户端不存在');
    }
    if (input.redirectUris !== undefined) {
      this.assertRedirectUrisValid(input.redirectUris);
    }
    await this.db.db
      .update(oauthClient)
      .set({
        name: input.name ?? row.name,
        description: input.description !== undefined ? input.description : row.description,
        redirectUris: input.redirectUris ?? row.redirectUris,
        allowedScopes: input.allowedScopes
          ? this.normalizeScopes(input.allowedScopes)
          : row.allowedScopes,
        enabled: input.enabled ?? row.enabled,
        updatedAt: new Date(),
      })
      .where(eq(oauthClient.id, row.id));
    return this.toView((await this.findClient(clientId))!);
  }

  /** Rotates the secret; the new plaintext is returned exactly once. */
  async resetClientSecret(clientId: string): Promise<AdminOauthClientView> {
    const row = await this.findClient(clientId);
    if (!row) {
      throw new NotFoundException('客户端不存在');
    }
    const clientSecret = generateOpaqueToken('mcs_cs_');
    await this.db.db
      .update(oauthClient)
      .set({ clientSecretHash: sha256(clientSecret), updatedAt: new Date() })
      .where(eq(oauthClient.id, row.id));
    return { ...this.toView((await this.findClient(clientId))!), clientSecret };
  }

  /** Deletes the client together with its remembered consents; tokens are revoked first. */
  async deleteClient(clientId: string): Promise<number> {
    const row = await this.findClient(clientId);
    if (!row) {
      throw new NotFoundException('客户端不存在');
    }
    const revokedTokens = await this.revokeClientTokens(clientId);
    await this.db.db.delete(oauthConsent).where(eq(oauthConsent.clientId, clientId));
    await this.db.db.delete(oauthClient).where(eq(oauthClient.id, row.id));
    return revokedTokens;
  }

  private toView(row: OauthClientRow): AdminOauthClientView {
    return {
      id: row.id,
      clientId: row.clientId,
      name: row.name,
      description: row.description,
      redirectUris: row.redirectUris,
      allowedScopes: parseOAuthScopes(row.allowedScopes.join(' ')),
      enabled: row.enabled,
      confidential: row.clientSecretHash !== null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private normalizeScopes(scopes: OAuthScope[] | undefined): OAuthScope[] {
    const effective = scopes ?? (['basic', 'player'] as OAuthScope[]);
    const unknown = effective.filter(
      (scope) => !(OAUTH_SCOPES as readonly string[]).includes(scope),
    );
    if (unknown.length > 0) {
      throw new BadRequestException(`不支持的 scope：${unknown.join(', ')}`);
    }
    return [...new Set(['basic' as const, ...effective])];
  }

  private assertRedirectUrisValid(uris: string[]): void {
    if (uris.length === 0) {
      throw new BadRequestException('至少需要一个 redirect_uri');
    }
    for (const uri of uris) {
      if (!isAllowedRedirectUri(uri)) {
        throw new BadRequestException(
          `redirect_uri 不合法：仅允许 HTTPS 或本机（localhost/127.0.0.1）HTTP 地址（${uri}）`,
        );
      }
    }
  }
}
