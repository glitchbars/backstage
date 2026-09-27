'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';
import { formatMoney } from '@/lib/money';
import { formatDateTime, staffLabel } from '@/lib/format';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';

interface OrderRow {
  id: string;
  name: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  reversedAt: string | null;
  bar: { name: string };
  mesa: { name: string } | null;
  console: { name: string } | null;
  createdBy: { id: string; name: string; gamertag: string | null } | null;
  itemCount: number;
  currency: string | null;
  grossMinor: number;
  paidMinor: number;
  paymentCount: number;
  correctionCount: number;
}

interface Bar {
  id: string;
  name: string;
}

interface PageResult {
  data: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
];

export default function OrdersPage() {
  const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/bars/all')
      .then((r) => r.json())
      .then(setBars);
  }, []);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (filterBarId) params.set('barId', filterBarId);
      if (status) params.set('status', status);
      const res = await fetch(`/api/orders?${params}`);
      setResult(await res.json());
      setLoading(false);
    }
    fetchOrders();
  }, [page, filterBarId, status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filterBarId}
          onChange={(e) => {
            setFilterBarId(e.target.value);
            setPage(1);
          }}
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
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Opened</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Order</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Bar</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Server</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Items</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Paid</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton columns={9} />
            ) : (
              <tbody className="divide-y divide-gray-100">
                {result?.data.map((order) => {
                  const where = order.mesa?.name ?? order.console?.name ?? null;
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDateTime(order.openedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          {order.name || 'Untitled'}
                        </span>
                        {where && <span className="block text-xs text-gray-500">{where}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{order.bar.name}</td>
                      <td className="px-4 py-3 text-gray-600">{staffLabel(order.createdBy)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{order.itemCount}</td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {formatMoney(order.grossMinor, order.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatMoney(order.paidMinor, order.currency)}
                        {order.paidMinor < order.grossMinor && (
                          <span className="block text-xs text-amber-600">
                            {formatMoney(order.grossMinor - order.paidMinor, order.currency)} due
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} reversedAt={order.reversedAt} />
                        {order.correctionCount > 0 && (
                          <span className="block mt-1 text-xs text-gray-500">
                            {order.correctionCount} correction
                            {order.correctionCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/orders/${order.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {result?.data.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      No orders found
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
    </div>
  );
}
