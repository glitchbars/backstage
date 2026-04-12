'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const CURRENCIES = ['USD', 'MXN', 'EUR', 'GBP', 'CAD', 'ARS', 'CLP', 'COP', 'PEN', 'BRL'];

interface Bar {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  barId: string;
}

export default function EditMenuItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bars, setBars] = useState<Bar[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<{
    barId: string;
    categoryId: string;
    name: string;
    description: string;
    price: string;
    cost: string;
    currency: string;
    taxRate: string;
    taxIncluded: boolean;
    active: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);

    fetch(`/api/menu-items/${id}`)
      .then((r) => r.json())
      .then((item) => {
        setForm({
          barId: item.barId,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description ?? '',
          price: (item.priceAmountMinor / 100).toFixed(2),
          cost: (item.costAmountMinor / 100).toFixed(2),
          currency: item.currency,
          taxRate: (item.taxRateBps / 100).toFixed(2),
          taxIncluded: item.taxIncluded,
          active: item.active,
        });
      });
  }, [id]);

  useEffect(() => {
    if (form?.barId) {
      fetch(`/api/menu-categories/all?barId=${form.barId}`)
        .then((r) => r.json())
        .then(setCategories);
    } else {
      setCategories([]);
    }
  }, [form?.barId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');

    const res = await fetch(`/api/menu-items/${id}`, {
      method: 'PUT',
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

    if (!res.ok) {
      setError('Failed to save. Please try again.');
      setSaving(false);
      return;
    }

    router.push('/menu-items');
  }

  if (!form) return <div className="text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/menu-items" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Menu Items
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Menu Item</h1>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Select a category</option>
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/menu-items"
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
