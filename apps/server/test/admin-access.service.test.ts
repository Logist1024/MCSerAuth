import { ForbiddenException } from '@nestjs/common';
import type { AdminPermission, UserRole } from '@mcserauth/shared';
import { ADMIN_PERMISSIONS } from '@mcserauth/shared';
import { AdminAccessService } from '../src/modules/admin/admin-access.service.js';
import { user as userTable } from '../src/db/schema/index.js';
import type {
  AccountAccessService,
  AccountUser,
} from '../src/modules/auth/account-access.service.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
const STAFF_ID = 'staff-1';
interface StubOptions {
  role: UserRole;
  banned?: boolean;
}
/**
 * The capability matrix lives entirely inside AdminAccessService; the session
 * lookup is stubbed so the test pins the delegation rules only.
 */
function makeAccess(
  db: TestContext['db'],
  { role, banned = false }: StubOptions,
): AdminAccessService {
  const account = {
    id: STAFF_ID,
    email: 'staff@example.com',
    name: 'Staff',
    role,
    banned,
  } as unknown as AccountUser;
  const accounts = {
    requireUser: async () => account,
    requireAtLeast: async () => account,
    requireRole: async () => account,
  } as unknown as AccountAccessService;
  return new AdminAccessService(accounts, db);
}
const request = {} as never;
describe('AdminAccessService capability delegation', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await createTestContext();
    await ctx.db.db.insert(userTable).values([
      { id: STAFF_ID, email: 'staff@example.com', name: 'Staff' },
      { id: 'boss', email: 'boss@example.com', name: 'Boss' },
      { id: 'boss2', email: 'boss2@example.com', name: 'Boss Two' },
      { id: 'boss3', email: 'boss3@example.com', name: 'Boss Three' },
      { id: 'someone-else', email: 'else@example.com', name: 'Someone Else' },
    ]);
  });
  afterEach(async () => {
    await ctx.cleanup();
  });
  it('starts with no delegated capabilities', async () => {
    const access = makeAccess(ctx.db, { role: 'admin' });
    expect(await access.permissionsFor(STAFF_ID)).toEqual([]);
  });
  it('grants every capability implicitly to a superadmin', async () => {
    const access = makeAccess(ctx.db, { role: 'superadmin' });
    for (const permission of ADMIN_PERMISSIONS) {
      await expect(access.requireCapability(request, permission)).resolves.toMatchObject({
        role: 'superadmin',
      });
    }
  });
  it('refuses a staff member with no grant', async () => {
    const access = makeAccess(ctx.db, { role: 'reviewer' });
    await expect(access.requireCapability(request, 'titles.manage')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(access.requireCapability(request, 'titles.manage')).rejects.toThrow(
      '该操作需要超级管理员授权',
    );
  });
  it('admits a reviewer holding the exact capability', async () => {
    const access = makeAccess(ctx.db, { role: 'reviewer' });
    await access.replacePermissions(STAFF_ID, ['forum.categories'], 'boss');
    await expect(access.requireCapability(request, 'forum.categories')).resolves.toMatchObject({
      userId: STAFF_ID,
    });
    await expect(access.requireCapability(request, 'users.ban')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('keeps the role floor above the capability check', async () => {
    const access = makeAccess(ctx.db, { role: 'reviewer' });
    await access.replacePermissions(STAFF_ID, ['site.manage'], 'boss');
    await expect(access.requireCapability(request, 'site.manage', 'admin')).rejects.toThrow(
      '没有权限执行此操作',
    );
  });
  it('requires an explicit grant even from an admin, unlike a superadmin', async () => {
    const access = makeAccess(ctx.db, { role: 'admin' });
    await expect(access.requireCapability(request, 'servers.manage', 'admin')).rejects.toThrow(
      '该操作需要超级管理员授权',
    );
    await access.replacePermissions(STAFF_ID, ['servers.manage'], 'boss');
    await expect(
      access.requireCapability(request, 'servers.manage', 'admin'),
    ).resolves.toMatchObject({ role: 'admin', permissions: ['servers.manage'] });
  });
  it('accepts either the role shortcut or a delegated capability', async () => {
    const byRole = makeAccess(ctx.db, { role: 'admin' });
    await expect(
      byRole.requireCapabilityOrRole(request, 'users.ban', 'admin'),
    ).resolves.toBeTruthy();
    const byGrant = makeAccess(ctx.db, { role: 'reviewer' });
    await byGrant.replacePermissions(STAFF_ID, ['users.ban'], 'boss');
    await expect(
      byGrant.requireCapabilityOrRole(request, 'users.ban', 'admin'),
    ).resolves.toBeTruthy();
    const plain = makeAccess(ctx.db, { role: 'user' });
    await plain.replacePermissions(STAFF_ID, ['users.ban'], 'boss');
    await expect(
      plain.requireCapabilityOrRole(request, 'users.ban', 'admin'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('locks banned staff out of every path', async () => {
    const access = makeAccess(ctx.db, { role: 'superadmin', banned: true });
    await access.replacePermissions(STAFF_ID, ['site.manage'], 'boss');
    await expect(access.requireCapability(request, 'site.manage')).rejects.toThrow(
      '该账号已被封禁',
    );
  });
  it('replaces the whole grant set and de-duplicates entries', async () => {
    const access = makeAccess(ctx.db, { role: 'admin' });
    const permissions: AdminPermission[] = ['forum.announce', 'forum.announce', 'banners.manage'];
    expect(await access.replacePermissions(STAFF_ID, permissions, 'boss')).toEqual([
      'forum.announce',
      'banners.manage',
    ]);
    expect((await access.permissionsFor(STAFF_ID)).sort()).toEqual([
      'banners.manage',
      'forum.announce',
    ]);
    expect(await access.replacePermissions(STAFF_ID, ['points.adjust'], 'boss2')).toEqual([
      'points.adjust',
    ]);
    expect(await access.permissionsFor(STAFF_ID)).toEqual(['points.adjust']);
    expect(await access.replacePermissions(STAFF_ID, [], 'boss3')).toEqual([]);
    expect(await access.permissionsFor(STAFF_ID)).toEqual([]);
  });
  it('scopes grants to one user', async () => {
    const access = makeAccess(ctx.db, { role: 'admin' });
    await access.replacePermissions('someone-else', ['titles.manage'], 'boss');
    await access.replacePermissions(STAFF_ID, ['banners.manage'], 'boss');
    expect(await access.permissionsFor('someone-else')).toEqual(['titles.manage']);
    expect(await access.permissionsFor(STAFF_ID)).toEqual(['banners.manage']);
  });
});
