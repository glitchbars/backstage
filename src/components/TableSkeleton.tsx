interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export function TableSkeleton({ columns, rows = 8 }: TableSkeletonProps) {
  return (
    <tbody className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: columns }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-4 bg-gray-100 rounded animate-pulse"
                style={{ width: `${60 + ((i + j) % 3) * 15}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
