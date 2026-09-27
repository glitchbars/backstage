'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';
import { formatDateTime, formatShiftLength, formatTime, staffLabel } from '@/lib/format';

interface ShiftRow {
  id: string;
  barId: string;
  employeeId: string;
  scheduledStart: string;
  scheduledEnd: string;
  breakMinutes: number | null;
  role: string | null;
  notes: string | null;
  status: string;
  bar: { name: string };
  employee: { id: string; name: string; email: string; gamertag: string | null };
  createdBy: { id: string; name: string; gamertag: string | null } | null;
}

interface Bar {
  id: string;
  name: string;
}

interface Membership {
  id: string;
  barId: string;
  role: string;
  user: { id: string; name: string; email: string; gamertag: string | null };
}

interface PageResult {
  data: ShiftRow[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const DEFAULT_FORM = {
  barId: '',
  employeeId: '',
  scheduledStart: '',
  scheduledEnd: '',
  breakMinutes: '',
  role: '',
  notes: '',
};

// A date input gives a calendar day; the API compares instants. The day is
// resolved against the browser's clock, which is the one the manager reads.
function startOfDay(day: string) {
  return new Date(`${day}T00:00:00`).toISOString();
}

function endOfDay(day: string) {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

export default function ShiftsPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);
    // The roster is small and staff-only, so one fetch covers both the employee
    // filter and the employee picker in the create form.
    fetch('/api/bar-memberships')
      .then((r) => r.json())
      .then(setMemberships);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchShifts() {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (filterBarId) params.set('barId', filterBarId);
      if (employeeId) params.set('employeeId', employeeId);
      if (status) params.set('status', status);
      if (from) params.set('from', startOfDay(from));
      if (to) params.set('to', endOfDay(to));
      const res = await fetch(`/api/shifts?${params}`);
      const data = await res.json();
      if (cancelled) return;
      setResult(data);
      setLoading(false);
    }
    fetchShifts();
    return () => {
      cancelled = true;
    };
  }, [page, filterBarId, employeeId, status, from, to, reload]);

  // Clearing the bar clears the employee too — otherwise the filter stays
  // pinned to someone the dropdown no longer offers.
  function handleBarFilter(barId: string) {
    setFilterBarId(barId);
    setEmployeeId('');
    setPage(1);
  }

  const filterStaff = useMemo(
    () => (filterBarId ? memberships.filter((m) => m.barId === filterBarId) : memberships),
    [memberships, filterBarId],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCreateError('');

    const res = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        scheduledStart: new Date(form.scheduledStart).toISOString(),
        scheduledEnd: new Date(form.scheduledEnd).toISOString(),
        breakMinutes: form.breakMinutes === '' ? null : Number(form.breakMinutes),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setCreateError(body.error ?? 'Failed to create the shift. Please try again.');
      return;
    }

    setShowCreate(false);
    setForm(DEFAULT_FORM);
    setPage(1);
    setReload((n) => n + 1);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/shifts/${id}`, { method: 'DELETE' });
    setReload((n) => n + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
        <button
          onClick={() => {
            setForm({ ...DEFAULT_FORM, barId: filterBarId });
            setCreateError('');
            setShowCreate(true);
          }}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
        >
          + New Shift
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

        <select
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All staff</option>
          {filterStaff.map((m) => (
            <option key={m.id} value={m.user.id}>
              {staffLabel(m.user)}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <label className="text-sm text-gray-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {(from || to || status || employeeId) && (
          <button
            onClick={() => {
              setFrom('');
              setTo('');
              setStatus('');
              setEmployeeId('');
              setPage(1);
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Starts</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ends</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Employee</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Bar</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Worked</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton columns={8} />
            ) : (
              <tbody className="divide-y divide-gray-100">
                {result?.data.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                      {formatDateTime(s.scheduledStart)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatTime(s.scheduledEnd)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {staffLabel(s.employee)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.bar.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {s.role ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700">
                          {s.role}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatShiftLength(s.scheduledStart, s.scheduledEnd, s.breakMinutes)}
                      {s.breakMinutes ? (
                        <span className="text-gray-400"> · {s.breakMinutes}m break</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_TONE[s.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      <Link href={`/shifts/${s.id}`} className="text-blue-600 hover:underline">
                        Edit
                      </Link>
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            id: s.id,
                            label: `${staffLabel(s.employee)} on ${formatDateTime(
                              s.scheduledStart,
                            )}`,
                          })
                        }
                        className="text-red-600 hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {result?.data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      No shifts found
                    </td>
                  </tr>
                )}
              </tbody>
            )}
          </table>
        </div>
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
        <Modal title="New Shift" onClose={() => setShowCreate(false)}>
          <ShiftForm
            form={form}
            setForm={setForm}
            bars={bars}
            memberships={memberships}
            onSubmit={handleCreate}
            saving={saving}
            error={createError}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Shift"
          message={`Delete the shift for ${confirmDelete.label}? Use the Cancelled status instead if you want to keep the record.`}
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

function ShiftForm({
  form,
  setForm,
  bars,
  memberships,
  onSubmit,
  saving,
  error,
  onCancel,
}: {
  form: typeof DEFAULT_FORM;
  setForm: (f: typeof DEFAULT_FORM) => void;
  bars: Bar[];
  memberships: Membership[];
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string;
  onCancel: () => void;
}) {
  const staff = memberships.filter((m) => m.barId === form.barId);

  // Picking someone prefills the role from their bar membership: the shift's own
  // role is a free-form String in the schema, and this keeps it to real values.
  function handleEmployee(userId: string) {
    const membership = staff.find((m) => m.user.id === userId);
    setForm({ ...form, employeeId: userId, role: form.role || membership?.role || '' });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bar <span className="text-red-500">*</span>
        </label>
        <select
          required
          value={form.barId}
          onChange={(e) => setForm({ ...form, barId: e.target.value, employeeId: '', role: '' })}
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
          Employee <span className="text-red-500">*</span>
        </label>
        <select
          required
          value={form.employeeId}
          onChange={(e) => handleEmployee(e.target.value)}
          disabled={!form.barId}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">Select an employee</option>
          {staff.map((m) => (
            <option key={m.id} value={m.user.id}>
              {staffLabel(m.user)} — {m.role}
            </option>
          ))}
        </select>
        {form.barId && staff.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">
            This bar has no staff yet. Add them on the bar&apos;s own page first.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Starts <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            required
            value={form.scheduledStart}
            onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ends <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            required
            value={form.scheduledEnd}
            onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Break (minutes)</label>
          <input
            type="number"
            min={0}
            value={form.breakMinutes}
            onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <input
            type="text"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
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
