'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const PLATFORMS = [
  'PS2',
  'PS3',
  'PS4',
  'PS5',
  'XBOX_360',
  'XBOX_ONE',
  'XBOX_SERIES_X',
  'NINTENDO_SWITCH',
  'NINTENDO_64',
  'EMULATOR',
  'GAMECUBE',
];

interface Bar {
  id: string;
  name: string;
}
interface Mesa {
  id: string;
  name: string;
  barId: string;
}

export default function EditConsolePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bars, setBars] = useState<Bar[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [form, setForm] = useState<{
    barId: string;
    mesaId: string;
    name: string;
    platform: string;
    active: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);

    fetch(`/api/consoles/${id}`)
      .then((r) => r.json())
      .then((c) => {
        setForm({
          barId: c.barId,
          mesaId: c.mesaId ?? '',
          name: c.name,
          platform: c.platform,
          active: c.active,
        });
      });
  }, [id]);

  useEffect(() => {
    if (form?.barId) {
      fetch(`/api/mesas/all?barId=${form.barId}`)
        .then((r) => r.json())
        .then(setMesas);
    } else {
      setMesas([]);
    }
  }, [form?.barId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');

    const res = await fetch(`/api/consoles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, mesaId: form.mesaId || null }),
    });

    if (!res.ok) {
      setError('Failed to save. Please try again.');
      setSaving(false);
      return;
    }

    router.push('/consoles');
  }

  if (!form) return <div className="text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/consoles" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Consoles
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Console</h1>
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
              onChange={(e) => setForm({ ...form, barId: e.target.value, mesaId: '' })}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Platform <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table (optional)</label>
            <select
              value={form.mesaId}
              onChange={(e) => setForm({ ...form, mesaId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">None</option>
              {mesas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/consoles"
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
