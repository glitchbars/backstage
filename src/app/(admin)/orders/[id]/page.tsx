'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { formatDateTime, staffLabel } from '@/lib/format';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';

interface Staff {
  id: string;
  name: string;
  gamertag: string | null;
}

interface Line {
  id: string;
  nameAtSale: string;
  categoryNameAtSale: string | null;
  currencyAtSale: string;
  unitPriceAmountMinor: number;
  unitCostAmountMinor: number;
  taxRateBpsAtSale: number;
  taxIncludedAtSale: boolean;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: Staff | null;
  settledAt: string | null;
  settledPaymentMethod: string | null;
  settledBy: Staff | null;
  seenStatus: string;
}

interface Payment {
  id: string;
  amountMinor: number;
  currency: string;
  paymentMethod: string;
  paymentMode: string;
  createdAt: string;
  createdBy: Staff | null;
  lineLinks: { orderLineId: string }[];
}

interface Correction {
  id: string;
  amountMinor: number;
  currency: string;
  previousPaymentMethod: string;
  newPaymentMethod: string;
  createdAt: string;
  createdBy: Staff;
}

interface Order {
  id: string;
  name: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  reversedAt: string | null;
  reverseReason: string | null;
  reopenedFromOrderSessionId: string | null;
  reopenedToOrderSessionId: string | null;
  bar: { id: string; name: string };
  mesa: { name: string } | null;
  console: { name: string } | null;
  createdBy: (Staff & { email: string }) | null;
  lines: Line[];
  payments: Payment[];
  paymentCorrections: Correction[];
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/orders/${id}`).then(async (res) => {
      if (!res.ok) {
        setError(res.status === 404 ? 'Order not found.' : 'Failed to load this order.');
        return;
      }
      setOrder(await res.json());
    });
  }, [id]);

  if (error) {
    return (
      <div>
        <Link href="/orders" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Orders
        </Link>
        <p className="mt-4 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!order) {
    return <div className="text-gray-500 text-sm">Loading…</div>;
  }

  // Totals mirror the POS exactly: voided lines are excluded and the sum is the
  // raw unit price, with no tax adjustment applied on top.
  const liveLines = order.lines.filter((l) => l.voidedAt === null);
  const currency = liveLines[0]?.currencyAtSale ?? null;
  const gross = liveLines.reduce((sum, l) => sum + l.unitPriceAmountMinor, 0);
  const cost = liveLines.reduce((sum, l) => sum + l.unitCostAmountMinor, 0);
  const paid = liveLines
    .filter((l) => l.settledAt !== null)
    .reduce((sum, l) => sum + l.unitPriceAmountMinor, 0);
  const paymentsTotal = order.payments.reduce((sum, p) => sum + p.amountMinor, 0);
  const where = order.mesa?.name ?? order.console?.name ?? '—';

  const lineNames = new Map(order.lines.map((l) => [l.id, l.nameAtSale]));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orders" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Orders
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{order.name || 'Untitled order'}</h1>
        <OrderStatusBadge status={order.status} reversedAt={order.reversedAt} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Summary label="Bar" value={order.bar.name} />
          <Summary label="Table / console" value={where} />
          <Summary label="Server" value={staffLabel(order.createdBy)} />
          <Summary label="Opened" value={formatDateTime(order.openedAt)} />
          <Summary label="Closed" value={formatDateTime(order.closedAt)} />
          <Summary label="Items" value={`${liveLines.length} live · ${order.lines.length} total`} />
          <Summary label="Total" value={formatMoney(gross, currency)} />
          <Summary
            label="Paid"
            value={
              <>
                {formatMoney(paid, currency)}
                {paid < gross && (
                  <span className="text-amber-600">
                    {' '}
                    · {formatMoney(gross - paid, currency)} due
                  </span>
                )}
              </>
            }
          />
          <Summary label="Cost" value={formatMoney(cost, currency)} />
          <Summary label="Profit" value={formatMoney(gross - cost, currency)} />
        </div>

        {order.reversedAt && (
          <p className="mt-4 text-sm text-red-600">
            Reversed {formatDateTime(order.reversedAt)}
            {order.reverseReason ? ` — ${order.reverseReason}` : ''}
          </p>
        )}
        {order.reopenedFromOrderSessionId && (
          <p className="mt-2 text-sm text-gray-600">
            Reopened from{' '}
            <Link
              href={`/orders/${order.reopenedFromOrderSessionId}`}
              className="text-blue-600 hover:underline"
            >
              the previous session
            </Link>
          </p>
        )}
        {order.reopenedToOrderSessionId && (
          <p className="mt-2 text-sm text-gray-600">
            Continued in{' '}
            <Link
              href={`/orders/${order.reopenedToOrderSessionId}`}
              className="text-blue-600 hover:underline"
            >
              a later session
            </Link>
          </p>
        )}
      </div>

      <Card title="Items" subtitle="Prices are what the item cost at the time of sale.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Item</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Price</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tax</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Added</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.lines.map((line) => (
                <tr key={line.id} className={line.voidedAt ? 'bg-red-50/40 text-gray-400' : ''}>
                  <td className="px-4 py-3">
                    <span className={line.voidedAt ? 'line-through' : 'font-medium text-gray-900'}>
                      {line.nameAtSale}
                    </span>
                    {line.voidedAt && (
                      <span className="block text-xs text-red-600">
                        Voided {formatDateTime(line.voidedAt)} by {staffLabel(line.voidedBy)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{line.categoryNameAtSale ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatMoney(line.unitPriceAmountMinor, line.currencyAtSale)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {(line.taxRateBpsAtSale / 100).toFixed(2)}%{' '}
                    <span className="text-xs text-gray-400">
                      {line.taxIncludedAtSale ? 'incl.' : 'excl.'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDateTime(line.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {line.settledAt ? (
                      <span className="text-gray-600">
                        {line.settledPaymentMethod ?? 'Paid'}
                        <span className="block text-xs text-gray-400">
                          {formatDateTime(line.settledAt)} · {staffLabel(line.settledBy)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-amber-600">Unpaid</span>
                    )}
                  </td>
                </tr>
              ))}
              {order.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No items on this order
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Payments"
        subtitle={`${order.payments.length} recorded · ${formatMoney(paymentsTotal, currency)} taken`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Taken</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Method</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Mode</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Covers</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDateTime(payment.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{payment.paymentMethod}</td>
                  <td className="px-4 py-3 text-gray-600">{payment.paymentMode}</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatMoney(payment.amountMinor, payment.currency)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {/* AMOUNT payments settle a sum rather than specific items,
                        so they legitimately have no line links. */}
                    {payment.lineLinks.length === 0
                      ? '—'
                      : payment.lineLinks
                          .map((l) => lineNames.get(l.orderLineId) ?? 'Removed item')
                          .join(', ')}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{staffLabel(payment.createdBy)}</td>
                </tr>
              ))}
              {order.payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No payments recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {order.paymentCorrections.length > 0 && (
        <Card
          title="Payment corrections"
          subtitle="Method changes applied after the order was closed."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">When</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Change</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.paymentCorrections.map((correction) => (
                  <tr key={correction.id}>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDateTime(correction.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {correction.previousPaymentMethod} → {correction.newPaymentMethod}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatMoney(correction.amountMinor, correction.currency)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{staffLabel(correction.createdBy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
