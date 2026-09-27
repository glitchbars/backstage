'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';
import { DEVICE_PROVIDERS, DEVICE_TYPES } from '@/app/api/devices/validation';

interface DeviceItem {
  id: string;
  name: string;
  provider: string;
  deviceType: string;
  externalDeviceId: string;
  channel: number;
  enabled: boolean;
  barId: string;
  bar: { name: string };
}

interface Bar {
  id: string;
  name: string;
}

interface PageResult {
  data: DeviceItem[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_FORM = {
  barId: '',
  name: '',
  provider: 'SHELLY',
  deviceType: 'SWITCH',
  externalDeviceId: '',
  channel: '0',
  enabled: true,
};

export default function DevicesPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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

  async function fetchDevices(p = page, barId = filterBarId) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (barId) params.set('barId', barId);
    const res = await fetch(`/api/devices?${params}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchDevices(page, filterBarId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterBarId]);

  function handleBarFilter(barId: string) {
    setFilterBarId(barId);
    setPage(1);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, channel: Number(form.channel) }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? 'Failed to create device.');
      return;
    }

    setShowCreate(false);
    setForm({ ...DEFAULT_FORM, barId: form.barId });
    fetchDevices(1, filterBarId);
    setPage(1);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    fetchDevices(page, filterBarId);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <button
          onClick={() => {
            setError('');
            setShowCreate(true);
          }}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
        >
          + New Device
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">External ID</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Channel</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton columns={8} />
          ) : (
            <tbody className="divide-y divide-gray-100">
              {result?.data.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-gray-600">{d.bar.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700">
                      {d.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.deviceType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {d.externalDeviceId}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{d.channel}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {d.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link href={`/devices/${d.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                    <button
                      onClick={() => setConfirmDelete({ id: d.id, name: d.name })}
                      disabled={deletingId === d.id}
                      className="text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No devices found
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
        <Modal title="New Device" onClose={() => setShowCreate(false)}>
          <DeviceForm
            form={form}
            setForm={setForm}
            bars={bars}
            onSubmit={handleCreate}
            saving={saving}
            error={error}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Device"
          message={`Delete device "${confirmDelete.name}"?`}
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

function DeviceForm({
  form,
  setForm,
  bars,
  onSubmit,
  saving,
  error,
  onCancel,
}: {
  form: typeof DEFAULT_FORM;
  setForm: (f: typeof DEFAULT_FORM) => void;
  bars: Bar[];
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string;
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Provider <span className="text-red-500">*</span>
        </label>
        <select
          required
          value={form.provider}
          onChange={(e) => setForm({ ...form, provider: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {DEVICE_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Device type <span className="text-red-500">*</span>
        </label>
        <select
          required
          value={form.deviceType}
          onChange={(e) => setForm({ ...form, deviceType: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {DEVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          External device ID <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          maxLength={255}
          value={form.externalDeviceId}
          onChange={(e) => setForm({ ...form, externalDeviceId: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
        <input
          type="number"
          min={0}
          step={1}
          value={form.channel}
          onChange={(e) => setForm({ ...form, channel: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          className="h-4 w-4"
        />
        <label htmlFor="enabled" className="text-sm text-gray-700">
          Enabled
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
