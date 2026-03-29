'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Bar {
  id: string;
  name: string;
}

export default function EditMesaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bars, setBars] = useState<Bar[]>([]);
  const [form, setForm] = useState<{
    barId: string;
    name: string;
    posX: string;
    posY: string;
    taken: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);

    fetch(`/api/mesas/${id}`)
      .then((r) => r.json())
      .then((mesa) => {
        setForm({
          barId: mesa.barId,
          name: mesa.name,
          posX: mesa.posX != null ? String(mesa.posX) : '',
          posY: mesa.posY != null ? String(mesa.posY) : '',
          taken: mesa.taken,
        });
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');

    const res = await fetch(`/api/mesas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        posX: form.posX !== '' ? Number(form.posX) : null,
        posY: form.posY !== '' ? Number(form.posY) : null,
      }),
    });

    if (!res.ok) {
      setError('Failed to save. Please try again.');
      setSaving(false);
      return;
    }

    router.push('/mesas');
  }

  if (!form) return <div className="text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/mesas" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Tables
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Table</h1>
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
              onChange={(e) => setForm({ ...form, barId: e.target.value })}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pos X</label>
              <input
                type="number"
                value={form.posX}
                onChange={(e) => setForm({ ...form, posX: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pos Y</label>
              <input
                type="number"
                value={form.posY}
                onChange={(e) => setForm({ ...form, posY: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="taken"
              checked={form.taken}
              onChange={(e) => setForm({ ...form, taken: e.target.checked })}
              className="h-4 w-4"
            />
            <label htmlFor="taken" className="text-sm text-gray-700">
              Taken
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/mesas"
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
