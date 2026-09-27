export const SHIFT_INCLUDE = {
  bar: { select: { name: true } },
  employee: { select: { id: true, name: true, email: true, gamertag: true } },
  createdBy: { select: { id: true, name: true, gamertag: true } },
};

export const SHIFT_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export interface ShiftTimes {
  scheduledStart: Date;
  scheduledEnd: Date;
  breakMinutes: number | null;
}

/**
 * The schema puts no constraint on a shift's own times, and `relationMode` is
 * "prisma" so nothing is enforced in the database either — this is the only
 * thing standing between the schedule and a shift that ends before it starts.
 */
export function parseShiftTimes(input: {
  scheduledStart?: unknown;
  scheduledEnd?: unknown;
  breakMinutes?: unknown;
}): { error: string } | ShiftTimes {
  const scheduledStart = new Date(String(input.scheduledStart ?? ''));
  const scheduledEnd = new Date(String(input.scheduledEnd ?? ''));

  if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) {
    return { error: 'Start and end must both be valid dates' };
  }

  if (scheduledEnd <= scheduledStart) {
    return { error: 'The shift has to end after it starts' };
  }

  const raw = input.breakMinutes;
  const breakMinutes = raw === null || raw === undefined || raw === '' ? null : Number(raw);

  if (breakMinutes !== null && (!Number.isInteger(breakMinutes) || breakMinutes < 0)) {
    return { error: 'The break must be a whole number of minutes' };
  }

  const lengthMinutes = (scheduledEnd.getTime() - scheduledStart.getTime()) / 60000;
  if (breakMinutes !== null && breakMinutes >= lengthMinutes) {
    return { error: 'The break cannot be as long as the shift itself' };
  }

  return { scheduledStart, scheduledEnd, breakMinutes };
}

/**
 * Two shifts clash when each one starts before the other ends. CANCELLED shifts
 * are excluded: they are kept for the record, not as a claim on someone's time.
 * The check is per employee rather than per bar — a person can only be in one
 * place at a time even if two bars both want them.
 */
export function overlappingShiftWhere({
  employeeId,
  scheduledStart,
  scheduledEnd,
  excludeId,
}: {
  employeeId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  excludeId?: string;
}) {
  return {
    employeeId,
    status: { not: 'CANCELLED' as const },
    scheduledStart: { lt: scheduledEnd },
    scheduledEnd: { gt: scheduledStart },
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
}
