'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';

const BAR_ROLES = ['BARBACK', 'MIXOLOGIST', 'OWNER', 'SUPERADMIN'] as const;

interface Membership {
  id: string;
  barId: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string; gamertag: string | null; role: string };
}

interface LookupMembership {
  id: string;
  barId: string;
  role: string;
  bar: { name: string };
}

interface LookupUser {
  id: string;
  name: string;
  email: string;
  barMemberships: LookupMembership[];
}

export function BarStaffRoster({ barId, barName }: { barId: string; barName: string }) {
  const [members, setMembers] = useState<Membership[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [lookup, setLookup] = useState<LookupUser | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [searching, setSearching] = useState(false);
  const [role, setRole] = useState<string>('BARBACK');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);
  const [confirmMove, setConfirmMove] = useState<LookupMembership | null>(null);

  const fetchMembers = useCallback(async () => {
    const res = await fetch(`/api/bar-memberships?barId=${barId}`);
    setMembers(await res.json());
  }, [barId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  function resetAddForm() {
    setShowAdd(false);
    setEmail('');
    setLookup(null);
    setLookupError('');
    setRole('BARBACK');
    setError('');
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setLookup(null);
    setLookupError('');
    const res = await fetch(`/api/users?q=${encodeURIComponent(email.trim())}`);
    const body = await res.json();
    setSearching(false);
    if (!body.data?.length) {
      setLookupError(
        'No account with that email. They need to sign in to Backstage once before they can be added.',
      );
      return;
    }
    setLookup(body.data[0]);
  }

  async function handleAdd() {
    if (!lookup) return;
    setSaving(true);
    setError('');
    const res = await fetch('/api/bar-memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barId, userId: lookup.id, role }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to add staff. Please try again.');
      return;
    }
    resetAddForm();
    fetchMembers();
  }

  function handleSubmitAdd() {
    if (!lookup) return;
    // One membership per user, so assigning them here removes them from any other
    // bar. Never do that silently.
    const elsewhere = lookup.barMemberships.find((m) => m.barId !== barId);
    if (elsewhere) {
      setConfirmMove(elsewhere);
      return;
    }
    handleAdd();
  }

  async function handleRoleChange(membershipId: string, nextRole: string) {
    await fetch(`/api/bar-memberships/${membershipId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    });
    fetchMembers();
  }

  async function handleRemove(membershipId: string) {
    await fetch(`/api/bar-memberships/${membershipId}`, { method: 'DELETE' });
    fetchMembers();
  }

  const alreadyHere = lookup?.barMemberships.some((m) => m.barId === barId);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Staff</h2>
          <p className="text-sm text-gray-500">Who can operate this bar in the POS app.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
        >
          + Add Staff
        </button>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {members?.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{m.user.name}</td>
              <td className="px-4 py-3 text-gray-600">{m.user.email}</td>
              <td className="px-4 py-3">
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {BAR_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => setConfirmRemove({ id: m.id, name: m.user.name })}
                  className="text-red-600 hover:underline cursor-pointer"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {members?.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                No staff assigned to this bar
              </td>
            </tr>
          )}
          {members === null && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                Loading…
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showAdd && (
        <Modal title="Add Staff" onClose={resetAddForm}>
          <form onSubmit={handleLookup} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLookup(null);
                    setLookupError('');
                  }}
                  placeholder="nina@glitchbars.com"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                >
                  {searching ? 'Finding…' : 'Find'}
                </button>
              </div>
              {lookupError && <p className="text-sm text-red-600 mt-2">{lookupError}</p>}
            </div>
          </form>

          {lookup && (
            <div className="mt-4 space-y-3">
              <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                <p className="text-sm font-medium text-gray-900">{lookup.name}</p>
                <p className="text-sm text-gray-500">{lookup.email}</p>
              </div>

              {alreadyHere ? (
                <p className="text-sm text-gray-600">
                  Already staff at {barName}. Change their role in the table instead.
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      {BAR_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    {role === 'SUPERADMIN' && (
                      <p className="text-xs text-gray-400 mt-1">
                        SUPERADMIN currently grants nothing beyond OWNER in the POS app.
                      </p>
                    )}
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={resetAddForm}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitAdd}
                      disabled={saving}
                      className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? 'Adding…' : 'Add to bar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </Modal>
      )}

      {confirmMove && lookup && (
        <ConfirmModal
          title="Move staff between bars"
          message={`${lookup.name} is currently ${confirmMove.role} at ${confirmMove.bar.name}. A user can only belong to one bar, so adding them here removes that access. Move them to ${barName}?`}
          confirmLabel="Move"
          destructive={false}
          onConfirm={() => {
            setConfirmMove(null);
            handleAdd();
          }}
          onCancel={() => setConfirmMove(null)}
        />
      )}

      {confirmRemove && (
        <ConfirmModal
          title="Remove Staff"
          message={`Remove ${confirmRemove.name} from ${barName}? They will lose POS access to this bar.`}
          confirmLabel="Remove"
          onConfirm={() => {
            handleRemove(confirmRemove.id);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}
