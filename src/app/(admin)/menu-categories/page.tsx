'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';

interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  barId: string;
  bar: { name: string };
  createdAt: string;
}

interface Bar {
  id: string;
  name: string;
}

interface PageResult {
  data: MenuCategory[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_FORM = {
  barId: '',
  name: '',
  sortOrder: '0',
};

export default function MenuCategoriesPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then((data: Bar[]) => {
        setBars(data);
        if (data.length > 0) setForm((f) => ({ ...f, barId: f.barId || data[0].id }));
      });
  }, []);

  async function fetchCategories(p = page, barId = filterBarId) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (barId) params.set('barId', barId);
    const res = await fetch(`/api/menu-categories?${params}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchCategories(page, filterBarId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterBarId]);

  function handleBarFilter(barId: string) {
    setFilterBarId(barId);
    setPage(1);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/menu-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, sortOrder: Number(form.sortOrder) }),
    });
    setSaving(false);
    setShowCreate(false);
    setForm(DEFAULT_FORM);
    fetchCategories(1, filterBarId);
    setPage(1);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/menu-categories/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status === 409) {
      const data = await res.json();
      alert(data.error);
    }
    setDeletingId(null);
    fetchCategories(page, filterBarId);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Menu Categories</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
        >
          + New Category
        </button>
      </div>

      <div className="mb-4">
        <select
          value={filterBarId}
          onChange={(e) => handleBarFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All bars</option>
          {bars.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Bar</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Sort Order</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton columns={5} />
          ) : (
            <tbody className="divide-y divide-gray-100">
              {result?.data.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.bar.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.sortOrder}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link
                      href={`/menu-categories/${c.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => setConfirmDelete({ id: c.id, name: c.name })}
                      disabled={deletingId === c.id}
                      className="text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No categories found
                  </td>
                </tr>
              )}
            </tbody>
          )}
        </table>
        {result && (
          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onPageChange={setPage}
          />
        )}
      </div>

      {showCreate && (
        <Modal title="New Category" onClose={() => setShowCreate(false)}>
          <CategoryForm
            form={form}
            setForm={setForm}
            bars={bars}
            onSubmit={handleCreate}
            saving={saving}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Category"
          message={`Delete category "${confirmDelete.name}"? This will fail if the category has menu items.`}
          onConfirm={() => {
            handleDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function CategoryForm({
  form,
  setForm,
  bars,
  onSubmit,
  saving,
  onCancel,
}: {
  form: typeof DEFAULT_FORM;
  setForm: (f: typeof DEFAULT_FORM) => void;
  bars: Bar[];
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bar <span className="text-red-500">*</span>
        </label>
        <select
          required
          value={form.barId}
          onChange={(e) => setForm({ ...form, barId: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Select a bar</option>
          {bars.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
        <input
          type="number"
          min="0"
          step="1"
          value={form.sortOrder}
          onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Create'}
        </button>
      </div>
    </form>
  );
}
