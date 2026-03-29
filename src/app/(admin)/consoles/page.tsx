'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';

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

interface ConsoleItem {
  id: string;
  name: string;
  platform: string;
  active: boolean;
  barId: string;
  mesaId: string | null;
  bar: { name: string };
  mesa: { name: string } | null;
}

interface Bar {
  id: string;
  name: string;
}

interface Mesa {
  id: string;
  name: string;
  barId: string;
}

interface PageResult {
  data: ConsoleItem[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_FORM = {
  barId: '',
  mesaId: '',
  name: '',
  platform: 'PS4',
  active: true,
};

export default function ConsolesPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
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
      fetch(`/api/mesas/all?barId=${form.barId}`)
        .then((r) => r.json())
        .then(setMesas);
    } else {
      setMesas([]);
    }
  }, [form.barId]);

  async function fetchConsoles(p = page, barId = filterBarId) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (barId) params.set('barId', barId);
    const res = await fetch(`/api/consoles?${params}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchConsoles(page, filterBarId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterBarId]);

  function handleBarFilter(barId: string) {
    setFilterBarId(barId);
    setPage(1);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/consoles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, mesaId: form.mesaId || null }),
    });
    setSaving(false);
    setShowCreate(false);
    setForm(DEFAULT_FORM);
    fetchConsoles(1, filterBarId);
    setPage(1);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/consoles/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    fetchConsoles(page, filterBarId);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Consoles</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
        >
          + New Console
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">Platform</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Bar</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Table</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton columns={6} />
          ) : (
            <tbody className="divide-y divide-gray-100">
              {result?.data.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700">
                      {c.platform.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.bar.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.mesa?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link href={`/consoles/${c.id}`} className="text-blue-600 hover:underline">
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
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No consoles found
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
        <Modal title="New Console" onClose={() => setShowCreate(false)}>
          <ConsoleForm
            form={form}
            setForm={setForm}
            bars={bars}
            mesas={mesas}
            onSubmit={handleCreate}
            saving={saving}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Console"
          message={`Delete console "${confirmDelete.name}"?`}
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

function ConsoleForm({
  form,
  setForm,
  bars,
  mesas,
  onSubmit,
  saving,
  onCancel,
}: {
  form: typeof DEFAULT_FORM;
  setForm: (f: typeof DEFAULT_FORM) => void;
  bars: Bar[];
  mesas: Mesa[];
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
          onChange={(e) => setForm({ ...form, barId: e.target.value, mesaId: '' })}
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
          disabled={!form.barId}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
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
