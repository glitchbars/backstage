'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBarFilter } from '@/components/BarFilterContext';
import { formatMoney } from '@/lib/money';
import { formatDateTime, staffLabel } from '@/lib/format';

interface Staff {
  id: string;
  name: string;
  gamertag: string | null;
}

interface CashMovement {
  id: string;
  total: number;
  reason: string;
  extraInfo: string | null;
  createdAt: string;
  createdBy: Staff | null;
  cashTotal: { bar: { name: string } };
}

interface Till {
  id: string;
  open?: boolean;
  totalCash: number;
  totalCard: number;
  createdAt: string;
  updatedAt: string;
  bar: { name: string };
  _count: { closedOrders: number };
}

interface Summary {
  currency: string | null;
  cash: { totalMinor: number; updatedAt: string | null; barCount: number };
  cashHistory: CashMovement[];
  openTills: Till[];
  recentTills: Till[];
  last24h: {
    orders: number;
    items: number;
    grossMinor: number;
    costMinor: number;
    paidMinor: number;
  };
  openOrders: number;
  topItems: { name: string; quantity: number; grossMinor: number }[];
  counts: { bars: number; menuItems: number; mesas: number; consoles: number; staff: number };
}

interface Bar {
  id: string;
  name: string;
}

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </>
  );

  const className = 'bg-white rounded-lg border border-gray-200 shadow-sm p-5';
  return href ? (
    <Link href={href} className={`${className} block hover:border-gray-300 transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const REASON_TONE: Record<string, string> = {
  CASH_IN: 'bg-green-100 text-green-700',
  CASH_OUT: 'bg-red-100 text-red-700',
  ADJUSTMENT: 'bg-gray-100 text-gray-600',
};

function TillRows({ tills, currency }: { tills: Till[]; currency: string | null }) {
  return (
    <tbody className="divide-y divide-gray-100">
      {tills.map((till) => (
        <tr key={till.id} className="hover:bg-gray-50">
          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
            {formatDateTime(till.createdAt)}
            {till.open !== undefined && (
              <span
                className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  till.open ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {till.open ? 'Open' : 'Closed'}
              </span>
            )}
          </td>
          <td className="px-4 py-3 text-gray-600">{till.bar.name}</td>
          <td className="px-4 py-3 text-right text-gray-600">
            {formatMoney(till.totalCash, currency)}
          </td>
          <td className="px-4 py-3 text-right text-gray-600">
            {formatMoney(till.totalCard, currency)}
          </td>
          <td className="px-4 py-3 text-right font-medium text-gray-900">
            {formatMoney(till.totalCash + till.totalCard, currency)}
          </td>
          <td className="px-4 py-3 text-right text-gray-600">{till._count.closedOrders}</td>
        </tr>
      ))}
      {tills.length === 0 && (
        <tr>
          <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
            No tills recorded
          </td>
        </tr>
      )}
    </tbody>
  );
}

function TillHead() {
  return (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-4 py-3 text-left font-medium text-gray-600">Opened</th>
        <th className="px-4 py-3 text-left font-medium text-gray-600">Bar</th>
        <th className="px-4 py-3 text-right font-medium text-gray-600">Cash</th>
        <th className="px-4 py-3 text-right font-medium text-gray-600">Card</th>
        <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
        <th className="px-4 py-3 text-right font-medium text-gray-600">Orders</th>
      </tr>
    </thead>
  );
}

export default function SummaryPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError('');
    const params = filterBarId ? `?barId=${filterBarId}` : '';
    fetch(`/api/summary${params}`).then(async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError('Failed to load the summary.');
        return;
      }
      setSummary(await res.json());
    });
    return () => {
      cancelled = true;
    };
  }, [filterBarId]);

  const currency = summary?.currency ?? null;
  const openTillTotal =
    summary?.openTills.reduce((sum, t) => sum + t.totalCash + t.totalCard, 0) ?? 0;
  const outstanding = summary ? summary.last24h.grossMinor - summary.last24h.paidMinor : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Summary</h1>
        <select
          value={filterBarId}
          onChange={(e) => setFilterBarId(e.target.value)}
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!summary && !error && <p className="text-sm text-gray-500">Loading…</p>}

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Cash on hand"
              value={formatMoney(summary.cash.totalMinor, currency)}
              hint={
                summary.cash.updatedAt
                  ? `Updated ${formatDateTime(summary.cash.updatedAt)}`
                  : 'Never updated'
              }
            />
            <Stat
              label="Open tills"
              value={formatMoney(openTillTotal, currency)}
              hint={
                summary.openTills.length === 0
                  ? 'No till currently open'
                  : `${summary.openTills.length} open · ${summary.openTills.reduce((n, t) => n + t._count.closedOrders, 0)} orders closed into ${summary.openTills.length === 1 ? 'it' : 'them'}`
              }
            />
            <Stat
              label="Sales, last 24h"
              value={formatMoney(summary.last24h.grossMinor, currency)}
              hint={
                <>
                  {summary.last24h.items} items over {summary.last24h.orders} orders
                  {outstanding > 0 && (
                    <span className="text-amber-600">
                      {' '}
                      · {formatMoney(outstanding, currency)} unpaid
                    </span>
                  )}
                </>
              }
            />
            <Stat
              label="Open orders"
              value={String(summary.openOrders)}
              hint="Sessions still on the floor"
              href="/orders?status=OPEN"
            />
          </div>

          <Card
            title="Cash movements"
            subtitle="Latest entries in the cash total history."
            action={
              <span className="text-xs text-gray-400">
                {summary.cash.barCount} drawer{summary.cash.barCount === 1 ? '' : 's'}
              </span>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">When</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Reason</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Note</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.cashHistory.map((movement) => (
                    <tr key={movement.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDateTime(movement.createdAt)}
                        <span className="block text-xs text-gray-400">
                          {movement.cashTotal.bar.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            REASON_TONE[movement.reason] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {movement.reason.replace('_', ' ')}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          movement.total < 0 ? 'text-red-600' : 'text-gray-900'
                        }`}
                      >
                        {movement.total > 0 ? '+' : ''}
                        {formatMoney(movement.total, currency)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{movement.extraInfo || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{staffLabel(movement.createdBy)}</td>
                    </tr>
                  ))}
                  {summary.cashHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        No cash movements recorded
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {summary.openTills.length > 0 && (
            <Card title="Tills open now" subtitle="Takings recorded against the current session.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <TillHead />
                  <TillRows tills={summary.openTills} currency={currency} />
                </table>
              </div>
            </Card>
          )}

          <Card title="Recent tills" subtitle="The last six daily tills, newest first.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TillHead />
                <TillRows tills={summary.recentTills} currency={currency} />
              </table>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Top sellers" subtitle="By units sold over the last 30 days.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Item</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Sold</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.topItems.map((item) => (
                      <tr key={item.name} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {formatMoney(item.grossMinor, currency)}
                        </td>
                      </tr>
                    ))}
                    {summary.topItems.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                          Nothing sold in the last 30 days
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Catalogue" subtitle="What this view currently covers.">
              <dl className="divide-y divide-gray-100">
                {[
                  { label: 'Bars', value: summary.counts.bars, href: '/bars' },
                  { label: 'Menu items', value: summary.counts.menuItems, href: '/menu-items' },
                  { label: 'Tables', value: summary.counts.mesas, href: '/mesas' },
                  { label: 'Consoles', value: summary.counts.consoles, href: '/consoles' },
                  { label: 'Bar staff', value: summary.counts.staff, href: '/users' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-3">
                    <dt>
                      <Link href={row.href} className="text-blue-600 hover:underline text-sm">
                        {row.label}
                      </Link>
                    </dt>
                    <dd className="text-sm font-medium text-gray-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
