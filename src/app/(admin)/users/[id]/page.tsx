'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Membership {
  id: string;
  barId: string;
  role: string;
  bar: { name: string };
}

interface UserDetail {
  id: string;
  name: string;
  email: string;
  gamertag: string | null;
  role: string;
  barMemberships: Membership[];
}

export default function EditUserPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [role, setRole] = useState('USER');
  const [gamertag, setGamertag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then((r) => r.json())
      .then((u: UserDetail) => {
        setUser(u);
        setRole(u.role);
        setGamertag(u.gamertag ?? '');
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, gamertag }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to save. Please try again.');
      setSaving(false);
      return;
    }

    router.push('/users');
  }

  if (!user) {
    return <div className="text-gray-500 text-sm">Loading…</div>;
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/users" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Users
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit User</h1>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <p className="text-sm text-gray-900">{user.name}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <p className="text-sm text-gray-900">{user.email}</p>
            <p className="text-xs text-gray-400 mt-1">
              Email is the sign-in identity and cannot be changed here.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gamertag</label>
            <input
              type="text"
              value={gamertag}
              onChange={(e) => setGamertag(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">Must be unique. Leave empty to remove it.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Backstage access</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="USER">No access</option>
              <option value="ADMIN">Admin</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Admins can see and edit every bar. Removing access also signs the user out everywhere.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bar access</label>
            {user.barMemberships.length === 0 ? (
              <p className="text-sm text-gray-400">None</p>
            ) : (
              user.barMemberships.map((m) => (
                <p key={m.id} className="text-sm text-gray-900">
                  <Link href={`/bars/${m.barId}`} className="text-blue-600 hover:underline">
                    {m.bar.name}
                  </Link>{' '}
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700">
                    {m.role}
                  </span>
                </p>
              ))
            )}
            <p className="text-xs text-gray-400 mt-1">
              Bar roles are managed on the bar&apos;s own page.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/users"
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
