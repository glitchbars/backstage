export function OrderStatusBadge({
  status,
  reversedAt,
}: {
  status: string;
  reversedAt?: string | null;
}) {
  // A reversed session keeps its CLOSED status, so the reversal has to win here
  // or a voided order looks like a normal completed one.
  const [label, tone] = reversedAt
    ? ['Reversed', 'bg-red-100 text-red-700']
    : status === 'OPEN'
      ? ['Open', 'bg-amber-100 text-amber-700']
      : ['Closed', 'bg-gray-100 text-gray-600'];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
