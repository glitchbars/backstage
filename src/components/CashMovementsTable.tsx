import { TableSkeleton } from '@/components/TableSkeleton';
import { formatMoney } from '@/lib/money';
import { formatDateTime, staffLabel } from '@/lib/format';

export interface CashMovement {
  id: string;
  total: number;
  reason: string;
  extraInfo: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; gamertag: string | null } | null;
  cashTotal: { bar: { name: string } };
}

export const CASH_MOVEMENT_REASONS = [
  { value: 'CASH_IN', label: 'Cash in' },
  { value: 'CASH_OUT', label: 'Cash out' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
];

const REASON_TONE: Record<string, string> = {
  CASH_IN: 'bg-green-100 text-green-700',
  CASH_OUT: 'bg-red-100 text-red-700',
  ADJUSTMENT: 'bg-gray-100 text-gray-600',
};

const COLUMNS = 5;

/** Movement amounts are signed deltas to the drawer, so they always show their sign. */
export function formatSignedMoney(amountMinor: number, currency: string | null): string {
  return `${amountMinor > 0 ? '+' : ''}${formatMoney(amountMinor, currency)}`;
}

export function CashMovementsTable({
  movements,
  currency,
  loading = false,
  emptyMessage = 'No cash movements recorded',
}: {
  movements: CashMovement[];
  currency: string | null;
  loading?: boolean;
  emptyMessage?: string;
}) {
  return (
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
        {loading ? (
          <TableSkeleton columns={COLUMNS} />
        ) : (
          <tbody className="divide-y divide-gray-100">
            {movements.map((movement) => (
              <tr key={movement.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {formatDateTime(movement.createdAt)}
                  <span className="block text-xs text-gray-400">{movement.cashTotal.bar.name}</span>
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
                  {formatSignedMoney(movement.total, currency)}
                </td>
                <td className="px-4 py-3 text-gray-600">{movement.extraInfo || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{staffLabel(movement.createdBy)}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={COLUMNS} className="px-4 py-8 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}
