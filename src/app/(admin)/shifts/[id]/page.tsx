'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDateTime, staffLabel, toDateTimeLocalValue } from '@/lib/format';

interface Employee {
  id: string;
  name: string;
  email: string;
  gamertag: string | null;
}

interface ShiftDetail {
  id: string;
  barId: string;
  employeeId: string;
  scheduledStart: string;
  scheduledEnd: string;
  breakMinutes: number | null;
  role: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  employee: Employee;
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
  user: Employee;
}

const STATUSES = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function EditShiftPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [form, setForm] = useState({
    barId: '',
    employeeId: '',
    scheduledStart: '',
    scheduledEnd: '',
    breakMinutes: '',
    role: '',
    notes: '',
    status: 'SCHEDULED',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);
    fetch('/api/bar-memberships')
      .then((r) => r.json())
      .then(setMemberships);
  }, []);

  useEffect(() => {
    fetch(`/api/shifts/${id}`)
      .then((r) => r.json())
      .then((s: ShiftDetail) => {
        setShift(s);
        setForm({
          barId: s.barId,
          employeeId: s.employeeId,
          scheduledStart: toDateTimeLocalValue(s.scheduledStart),
          scheduledEnd: toDateTimeLocalValue(s.scheduledEnd),
          breakMinutes: s.breakMinutes === null ? '' : String(s.breakMinutes),
          role: s.role ?? '',
          notes: s.notes ?? '',
          status: s.status,
        });
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const res = await fetch(`/api/shifts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        scheduledStart: new Date(form.scheduledStart).toISOString(),
        scheduledEnd: new Date(form.scheduledEnd).toISOString(),
        breakMinutes: form.breakMinutes === '' ? null : Number(form.breakMinutes),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to save. Please try again.');
      setSaving(false);
      return;
    }

    router.push('/shifts');
  }

  if (!shift) {
    return <div className="text-gray-500 text-sm">Loading…</div>;
  }

  // Staff hold at most one bar membership, so someone who has since been moved
  // to another bar would drop out of the list and silently reassign the shift on
  // save. Their own row is kept in the options to stop that.
  const staff = memberships.filter((m) => m.barId === form.barId);
  const options = staff.some((m) => m.user.id === shift.employeeId)
    ? staff.map((m) => ({ id: m.user.id, label: `${staffLabel(m.user)} — ${m.role}` }))
    : [
        { id: shift.employeeId, label: `${staffLabel(shift.employee)} — not on this bar` },
        ...staff.map((m) => ({ id: m.user.id, label: `${staffLabel(m.user)} — ${m.role}` })),
      ];

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/shifts" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Shifts
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Shift</h1>
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
              Employee <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">{shift.employee.email}</p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Break (minutes)
              </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              A cancelled shift stays on the record but stops blocking the employee&apos;s hours.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <p className="text-xs text-gray-400">
            Created {formatDateTime(shift.createdAt)}
            {shift.createdBy ? ` by ${staffLabel(shift.createdBy)}` : ''}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/shifts"
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
