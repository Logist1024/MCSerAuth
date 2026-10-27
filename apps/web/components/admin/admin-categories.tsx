'use client';

import type { AdminCategory } from '@mcserauth/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  adminCreateCategory,
  adminDeleteCategory,
  adminListCategories,
  adminUpdateCategory,
} from '@/lib/api-client';
import ConfirmDialog from '@/components/confirm-dialog';
import { describeApiError } from '@/lib/errors';

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  parentId: string;
}

const EMPTY_FORM: CategoryForm = {
  name: '',
  slug: '',
  description: '',
  sortOrder: '0',
  parentId: '',
};

export default function AdminCategories() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminCategory | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCategories(await adminListCategories());
    } catch (fetchError) {
      setError(describeApiError(fetchError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() === '' ? null : form.description.trim(),
      sortOrder: Number(form.sortOrder) || 0,
      parentId: form.parentId === '' ? null : Number(form.parentId),
    };
    try {
      if (editingId === null) {
        await adminCreateCategory(payload);
        setNotice('版块已创建。');
      } else {
        await adminUpdateCategory(editingId, payload);
        setNotice('版块已更新。');
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load();
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setBusy(false);
    }
  }

  function edit(category: AdminCategory): void {
    setEditingId(category.id);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      sortOrder: String(category.sortOrder),
      parentId: category.parentId === null ? '' : String(category.parentId),
    });
  }

  async function remove(): Promise<void> {
    if (deleteTarget === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminDeleteCategory(deleteTarget.id);
      setNotice(`版块「${deleteTarget.name}」已删除。`);
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setError(describeApiError(deleteError));
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>版块管理</h2>
      {notice !== null ? <p className="ok">{notice}</p> : null}
      {error !== null ? <p className="bad">{error}</p> : null}

      <form className="stack" onSubmit={submit}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="category-name">名称</label>
            <input
              id="category-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="category-slug">slug</label>
            <input
              id="category-slug"
              value={form.slug}
              pattern="[a-z0-9-]{2,40}"
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="category-description">简介</label>
          <input
            id="category-description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="category-sort">排序</label>
            <input
              id="category-sort"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({ ...current, sortOrder: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="category-parent">父版块</label>
            <select
              id="category-parent"
              value={form.parentId}
              onChange={(event) =>
                setForm((current) => ({ ...current, parentId: event.target.value }))
              }
            >
              <option value="">无（顶级版块）</option>
              {(categories ?? [])
                .filter((category) => category.id !== editingId)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="actions">
          <button className="button" type="submit" disabled={busy}>
            {editingId === null ? '创建版块' : '保存修改'}
          </button>
          {editingId !== null ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
            >
              取消编辑
            </button>
          ) : null}
        </div>
      </form>

      <ul className="admin-list">
        {(categories ?? []).map((category) => (
          <li className="admin-list-item" key={category.id}>
            <div>
              <strong>{category.name}</strong>
              <span className="muted small"> /{category.slug}</span>
              <p className="muted small">
                {category.description ?? '无简介'} · 排序 {category.sortOrder} · 帖子{' '}
                {category.postCount}
                {category.parentId ? ` · 父级 #${category.parentId}` : ''}
              </p>
            </div>
            <div className="actions">
              <button
                className="button tiny secondary"
                type="button"
                onClick={() => edit(category)}
              >
                编辑
              </button>
              <button
                className="button tiny danger"
                type="button"
                disabled={busy}
                onClick={() => setDeleteTarget(category)}
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title={`删除版块「${deleteTarget?.name ?? ''}」？`}
        description="仅空版块可删除；该操作不可恢复。"
        confirmLabel="确认删除"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
