'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';

const CURRENCIES = ['USD', 'MXN', 'EUR', 'GBP', 'CAD', 'ARS', 'CLP', 'COP', 'PEN', 'BRL'];

interface MenuItem {
  id: string;
  name: string;
  priceAmountMinor: number;
  currency: string;
  active: boolean;
  barId: string;
  categoryId: string;
  bar: { name: string };
  category: { name: string };
}

interface Bar {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  barId: string;
}

interface PageResult {
  data: MenuItem[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_FORM = {
  barId: '',
  categoryId: '',
  name: '',
  description: '',
  price: '',
  cost: '',
  currency: 'USD',
  taxRate: '',
  taxIncluded: true,
  active: true,
};

export default function MenuItemsPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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

  useEffect(() => {
    if (form.barId) {
      fetch(`/api/menu-categories/all?barId=${form.barId}`)
        .then((r) => r.json())
        .then(setCategories);
    } else {
      setCategories([]);
    }
  }, [form.barId]);

  async function fetchItems(p = page, barId = filterBarId) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (barId) params.set('barId', barId);
    const res = await fetch(`/api/menu-items?${params}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchItems(page, filterBarId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterBarId]);

  function handleBarFilter(barId: string) {
    setFilterBarId(barId);
    setPage(1);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/menu-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barId: form.barId,
        categoryId: form.categoryId,
        name: form.name,
        description: form.description.trim() || null,
        priceAmountMinor: Math.round(Number(form.price) * 100),
        costAmountMinor: Math.round(Number(form.cost) * 100),
        currency: form.currency,
        taxRateBps: Math.round(Number(form.taxRate) * 100),
        taxIncluded: form.taxIncluded,
        active: form.active,
      }),
    });
    setSaving(false);
    setShowCreate(false);
    setForm(DEFAULT_FORM);
    fetchItems(1, filterBarId);
    setPage(1);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/menu-items/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    fetchItems(page, filterBarId);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Menu Items</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
        >
          + New Item
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Bar</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Price</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton columns={6} />
          ) : (
            <tbody className="divide-y divide-gray-100">
              {result?.data.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.category.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.bar.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    ${(item.priceAmountMinor / 100).toFixed(2)} {item.currency}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link href={`/menu-items/${item.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                    <button
                      onClick={() => setConfirmDelete({ id: item.id, name: item.name })}
                      disabled={deletingId === item.id}
                      className="text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No menu items found
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
        <Modal title="New Menu Item" onClose={() => setShowCreate(false)}>
          <ItemForm
            form={form}
            setForm={setForm}
            bars={bars}
            categories={categories}
            onSubmit={handleCreate}
            saving={saving}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Menu Item"
          message={`Delete menu item "${confirmDelete.name}"?`}
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

function ItemForm({
  form,
  setForm,
  bars,
  categories,
  onSubmit,
  saving,
  onCancel,
}: {
  form: typeof DEFAULT_FORM;
  setForm: (f: typeof DEFAULT_FORM) => void;
  bars: Bar[];
  categories: Category[];
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
          onChange={(e) => setForm({ ...form, barId: e.target.value, categoryId: '' })}
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
          Category <span className="text-red-500">*</span>
        </label>
        <select
          required
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          disabled={!form.barId}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">{form.barId ? 'Select a category' : 'Select a bar first'}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Price <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cost <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Currency <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tax Rate <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              required
              min="0"
              max="100"
              step="0.01"
              placeholder="0.00"
              value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
              className="w-full px-3 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <span className="absolute right-3 top-2 text-gray-500 text-sm">%</span>
          </div>
        </div>
      </div>
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="taxIncluded"
            checked={form.taxIncluded}
            onChange={(e) => setForm({ ...form, taxIncluded: e.target.checked })}
            className="h-4 w-4"
          />
          <label htmlFor="taxIncluded" className="text-sm text-gray-700">
            Tax included in price
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="h-4 w-4"
          />
          <label htmlFor="active" className="text-sm text-gray-700">
            Active
          </label>
        </div>
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
