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

/** `<input type="datetime-local">` holds local wall-clock time, not an ISO instant. */
export function toDateTimeLocalValue(value: string | Date): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Hours actually worked: the scheduled span minus whatever break was recorded. */
export function formatShiftLength(start: string, end: string, breakMinutes: number | null): string {
  const scheduled = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  const minutes = Math.max(0, Math.round(scheduled) - (breakMinutes ?? 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
