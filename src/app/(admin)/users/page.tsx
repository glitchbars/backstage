'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';

interface Membership {
  id: string;
  barId: string;
  role: string;
  bar: { name: string };
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  gamertag: string | null;
  role: string;
  barMemberships: Membership[];
}

interface Bar {
  id: string;
  name: string;
}

interface PageResult {
  data: UserItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function UsersPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);
  }, []);

  async function fetchUsers(p = page, barId = filterBarId, q = query) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    // An exact-email search looks up one person regardless of role or bar,
    // so it deliberately overrides the staff filter.
    if (q) params.set('q', q);
    else if (barId) params.set('barId', barId);
    const res = await fetch(`/api/users?${params}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers(page, filterBarId, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterBarId, query]);

  function handleBarFilter(barId: string) {
    setFilterBarId(barId);
    setPage(1);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(search.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearch('');
    setQuery('');
    setPage(1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={filterBarId}
          onChange={(e) => handleBarFilter(e.target.value)}
          disabled={!!query}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">All bars</option>
          {bars.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            type="email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find by exact email…"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
          >
            Search
          </button>
        </form>

        {query && (
          <button
            onClick={clearSearch}
            className="text-sm text-blue-600 hover:underline cursor-pointer"
          >
            Clear search
          </button>
        )}
      </div>

      {!query && (
        <p className="text-sm text-gray-500 mb-4">
          Showing Backstage admins and bar staff. Search by exact email to find anyone else.
        </p>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Gamertag</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Backstage</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Bar access</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton columns={6} />
          ) : (
            <tbody className="divide-y divide-gray-100">
              {result?.data.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500">{u.gamertag ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'ADMIN'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {u.role === 'ADMIN' ? 'Admin' : 'No access'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.barMemberships.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      u.barMemberships.map((m) => (
                        <Link
                          key={m.id}
                          href={`/bars/${m.barId}`}
                          className="inline-flex items-center gap-1.5 text-gray-600 hover:underline"
                        >
                          {m.bar.name}
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700">
                            {m.role}
                          </span>
                        </Link>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/users/${u.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {query
                      ? `No user with the email "${query}". They must sign in to Backstage once before they can be given access.`
                      : 'No users found'}
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
    </div>
  );
}
