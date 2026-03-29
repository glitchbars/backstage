'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';
import { FloorMap } from '@/components/FloorMap';
import { ConfirmModal } from '@/components/ConfirmModal';

interface Mesa {
  id: string;
  name: string;
  posX: number | null;
  posY: number | null;
  taken: boolean;
  barId: string;
  bar: { name: string };
  createdAt: string;
}

interface Bar {
  id: string;
  name: string;
}

interface PageResult {
  data: Mesa[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_FORM = {
  barId: '',
  name: '',
  posX: '',
  posY: '',
  taken: false,
};

interface FloorMapMesa {
  id: string;
  name: string;
  posX: number | null;
  posY: number | null;
  taken: boolean;
}

export default function MesasPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'list' | 'map'>('list');
  const [allMesas, setAllMesas] = useState<FloorMapMesa[]>([]);
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
    if (filterBarId) {
      fetch(`/api/mesas/all?barId=${filterBarId}`)
        .then((r) => r.json())
        .then(setAllMesas);
    } else {
      setAllMesas([]);
    }
  }, [filterBarId]);

  async function fetchMesas(p = page, barId = filterBarId) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (barId) params.set('barId', barId);
    const res = await fetch(`/api/mesas?${params}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchMesas(page, filterBarId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterBarId]);

  function handleBarFilter(barId: string) {
    setFilterBarId(barId);
    setPage(1);
  }

  function refetchMapMesas() {
    if (filterBarId) {
      fetch(`/api/mesas/all?barId=${filterBarId}`)
        .then((r) => r.json())
        .then(setAllMesas);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/mesas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        posX: form.posX !== '' ? Number(form.posX) : null,
        posY: form.posY !== '' ? Number(form.posY) : null,
      }),
    });
    setSaving(false);
    setShowCreate(false);
    setForm(DEFAULT_FORM);
    fetchMesas(1, filterBarId);
    refetchMapMesas();
    setPage(1);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/mesas/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    fetchMesas(page, filterBarId);
    refetchMapMesas();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tables</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
        >
          + New Table
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4">
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

        <div className="flex border border-gray-300 rounded-md overflow-hidden text-sm">
          <button
            onClick={() => setTab('list')}
            className={`px-4 py-2 cursor-pointer transition-colors ${
              tab === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setTab('map')}
            className={`px-4 py-2 cursor-pointer transition-colors ${
              tab === 'map' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Floor Map
          </button>
        </div>
      </div>

      {tab === 'map' ? (
        filterBarId ? (
          <FloorMap mesas={allMesas} />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
            Select a bar to view the floor map
          </div>
        )
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Bar</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Position</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton columns={5} />
            ) : (
              <tbody className="divide-y divide-gray-100">
                {result?.data.map((mesa) => (
                  <tr key={mesa.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{mesa.name}</td>
                    <td className="px-4 py-3 text-gray-600">{mesa.bar.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {mesa.posX != null && mesa.posY != null
                        ? `(${mesa.posX}, ${mesa.posY})`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          mesa.taken ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {mesa.taken ? 'Taken' : 'Free'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link href={`/mesas/${mesa.id}`} className="text-blue-600 hover:underline">
                        Edit
                      </Link>
                      <button
                        onClick={() => setConfirmDelete({ id: mesa.id, name: mesa.name })}
                        disabled={deletingId === mesa.id}
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
                      No tables found
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
      )}

      {showCreate && (
        <Modal title="New Table" onClose={() => setShowCreate(false)}>
          <MesaForm
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
          title="Delete Table"
          message={`Delete table "${confirmDelete.name}"?`}
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

function MesaForm({
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
      <div className="grid grid-cols-2 gap-3">
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
