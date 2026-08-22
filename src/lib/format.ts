export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Staff are identified by gamertag in the POS, so prefer it over the legal name. */
export function staffLabel(staff: { name: string; gamertag: string | null } | null): string {
  if (!staff) return '—';
  return staff.gamertag || staff.name || '—';
}
