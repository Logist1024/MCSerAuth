'use client';

import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  type AdminPermission,
  type ConsoleStaffMember,
} from '@mcserauth/shared';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { adminListStaff, adminPermissions, adminReplacePermissions } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { roleLabel } from '@/lib/forum-ui';
import './admin-growth.css';

/** Longer explanations shown next to each delegated capability. */
const PERMISSION_HINTS: Record<AdminPermission, string> = {
  'site.manage': '站点展示设置、首页内容与人机验证配置，以及成长规则数值。',
  'forum.categories': '创建、修改与删除论坛版块。',
  'forum.announce': '向全站或指定频道发布并撤销公告。',
  'users.ban': '封禁与解封账号、禁言与解除禁言。',
  'servers.manage': '维护允许接入的游戏服务器白名单。',
  'titles.manage': '新建特别称号、授予与收回，处理满级称号申请。',
  'banners.manage': '审核玩家购买的首页 Banner，驳回会自动退积分。',
  'points.adjust': '手动增减用户积分并写入积分流水。',
};

/** Superadmin-only matrix that delegates individual capabilities to staff. */
export default function AdminPermissionsPanel() {
  const toast = useToast();
  const [staff, setStaff] = useState<ConsoleStaffMember[] | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<AdminPermission[] | null>(null);
  const [selected, setSelected] = useState<AdminPermission[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadStaff = useCallback(async () => {
    setStaffError(null);
    try {
      setStaff(await adminListStaff());
    } catch (error) {
      setStaffError(describeApiError(error));
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const loadPermissions = useCallback(async (userId: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    setSaved(null);
    setSelected([]);
    try {
      const result = await adminPermissions(userId);
      setSaved(result.permissions);
      setSelected(result.permissions);
    } catch (error) {
      setDetailError(describeApiError(error));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId !== null) {
      void loadPermissions(selectedId);
    }
  }, [selectedId, loadPermissions]);

  const selectedMember = staff?.find((member) => member.id === selectedId) ?? null;
  const dirty =
    selected.length !== (saved?.length ?? 0) ||
    ADMIN_PERMISSIONS.filter((item) => selected.includes(item) !== (saved?.includes(item) ?? false))
      .length > 0;

  async function save(): Promise<void> {
    if (selectedId === null) {
      return;
    }
    setBusy(true);
    setDetailError(null);
    try {
      const result = await adminReplacePermissions(selectedId, selected);
      setSaved(result.permissions);
      setSelected(result.permissions);
      toast.success(
        result.permissions.length === 0
          ? '已清空该员工的下放能力。'
          : `已保存 ${result.permissions.length} 项能力。`,
      );
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  function toggle(permission: AdminPermission): void {
    setSelected((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission].sort(
            (a, b) => ADMIN_PERMISSIONS.indexOf(a) - ADMIN_PERMISSIONS.indexOf(b),
          ),
    );
  }

  return (
    <section className="card">
      <div className="section-heading">
        <h2>权限下放</h2>
        <span className="muted small">仅超级管理员可见</span>
      </div>
      <p className="muted">
        超级管理员隐式拥有全部能力，无需勾选；这里只为审核员与管理员逐项放开能力。
        勾选保存后对方立即可进入对应管理分区。
      </p>

      {staffError !== null ? (
        <p className="bad" role="alert">
          {staffError}
        </p>
      ) : null}
      {staff === null ? (
        <p className="muted">加载中…</p>
      ) : staff.length === 0 ? (
        <p className="mg-empty">站点还没有审核员或管理员账号。</p>
      ) : (
        <>
          <ul className="mg-list">
            {staff.map((member) => {
              const isSuperadmin = member.role === 'superadmin';
              return (
                <li className="mg-row" key={member.id}>
                  <div className="mg-row-body">
                    <p className="mg-row-title">
                      {member.name}
                      <span className={`mg-badge${isSuperadmin ? ' on' : ''}`}>
                        {roleLabel(member.role)}
                      </span>
                    </p>
                    <p className="mg-row-meta">
                      {member.email} · ID {member.id}
                      {isSuperadmin ? ' · 超级管理员默认拥有全部能力' : ''}
                    </p>
                  </div>
                  <div className="mg-row-actions">
                    <button
                      className={`button tiny${selectedId === member.id ? '' : ' secondary'}`}
                      type="button"
                      disabled={isSuperadmin || busy}
                      aria-pressed={selectedId === member.id}
                      onClick={() => setSelectedId(member.id)}
                    >
                      {selectedId === member.id ? '已选择' : '选择'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {selectedId !== null ? (
            <div className="mg-group">
              <h3>
                {selectedMember === null ? selectedId : selectedMember.name} 的下放能力
                {selectedMember === null ? '' : `（当前：${roleLabel(selectedMember.role)}）`}
              </h3>

              {loadingDetail ? <p className="muted">读取中…</p> : null}
              {!loadingDetail && detailError !== null ? (
                <>
                  <p className="bad" role="alert">
                    {detailError}
                  </p>
                  <div className="actions">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => void loadPermissions(selectedId)}
                    >
                      重试
                    </button>
                  </div>
                </>
              ) : null}

              {!loadingDetail && detailError === null && saved !== null ? (
                <>
                  <fieldset className="mg-perm-list">
                    <legend className="muted small">可下放的能力（共 8 项）</legend>
                    {ADMIN_PERMISSIONS.map((permission) => {
                      const inputId = `perm-${permission.replace('.', '-')}`;
                      return (
                        <div className="mg-perm" key={permission}>
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={selected.includes(permission)}
                            disabled={busy}
                            onChange={() => toggle(permission)}
                          />
                          <label className="mg-perm-text" htmlFor={inputId}>
                            <strong>
                              {ADMIN_PERMISSION_LABELS[permission]}
                              <span className="muted small mono"> {permission}</span>
                            </strong>
                            <span>{PERMISSION_HINTS[permission]}</span>
                          </label>
                        </div>
                      );
                    })}
                  </fieldset>

                  <div className="actions">
                    <button
                      className="button"
                      type="button"
                      disabled={busy || !dirty}
                      aria-busy={busy}
                      onClick={() => void save()}
                    >
                      {busy ? '保存中…' : '保存能力设置'}
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      disabled={busy || saved.length === 0}
                      onClick={() => setSelected([])}
                    >
                      清空全部
                    </button>
                    <span className="muted small">
                      已选 {selected.length} 项{dirty ? ' · 有未保存改动' : ''}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <p className="mg-empty">从上方选择一位员工后可编辑其能力。</p>
          )}
        </>
      )}
    </section>
  );
}
