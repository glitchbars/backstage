'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { useBarFilter } from '@/components/BarFilterContext';
import {
  CASH_MOVEMENT_REASONS,
  CashMovementsTable,
  formatSignedMoney,
  type CashMovement,
} from '@/components/CashMovementsTable';

interface Bar {
  id: string;
  name: string;
}

interface PageResult {
  data: CashMovement[];
  total: number;
  page: number;
  pageSize: number;
  netMinor: number;
  currency: string | null;
}

const INPUT_CLASS =
  'px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900';

/**
 * The table shows times in the browser's timezone, so a picked day is that
 * same local day: midnight of the date, shifted by `addDays` whole days.
 */
function localDayStart(date: string, addDays = 0): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + addDays).toISOString();
}

export default function CashMovementsPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [bars, setBars] = useState<Bar[]>([]);
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (filterBarId) params.set('barId', filterBarId);
    if (reason) params.set('reason', reason);
    if (fromDate) params.set('from', localDayStart(fromDate));
    // The end date is inclusive in the UI, so the exclusive bound is the next day.
    if (toDate) params.set('to', localDayStart(toDate, 1));

    setLoading(true);
    setError('');
    fetch(`/api/cash-movements?${params}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!cancelled) setResult(body);
      })
      .catch(() => {
        if (cancelled) return;
        setResult(null);
        setError('Failed to load cash movements.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, filterBarId, reason, fromDate, toDate]);

  const hasFilters = Boolean(reason || fromDate || toDate);

  return (
    <div>
      <Link href="/summary" className="text-sm text-blue-600 hover:underline">
        ← Summary
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-6">Cash movements</h1>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <select
          aria-label="Bar"
          value={filterBarId}
          onChange={(e) => {
            setFilterBarId(e.target.value);
            setPage(1);
          }}
          className={INPUT_CLASS}
        >
          <option value="">All bars</option>
          {bars.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setPage(1);
          }}
          className={INPUT_CLASS}
        >
          <option value="">All reasons</option>
          {CASH_MOVEMENT_REASONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="grid gap-1 text-xs font-medium text-gray-600">
          From
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-gray-600">
          To
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setReason('');
              setFromDate('');
              setToDate('');
              setPage(1);
            }}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {result && !loading && (
        <p className="mb-3 text-sm text-gray-600">
          {result.total.toLocaleString()} movement{result.total === 1 ? '' : 's'}
          {result.total > 0 && (
            <>
              {' · '}net{' '}
              <span
                className={`font-medium ${result.netMinor < 0 ? 'text-red-600' : 'text-gray-900'}`}
              >
                {formatSignedMoney(result.netMinor, result.currency)}
              </span>
            </>
          )}
        </p>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <CashMovementsTable
          movements={result?.data ?? []}
          currency={result?.currency ?? null}
          loading={loading}
          emptyMessage={hasFilters ? 'No cash movements match these filters' : undefined}
        />
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
