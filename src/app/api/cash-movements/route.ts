import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const REASONS = ['CASH_IN', 'CASH_OUT', 'ADJUSTMENT'] as const;
type Reason = (typeof REASONS)[number];

function parseInstant(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Read-only, like /api/summary: the cash total history is written by the till app.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const barId = searchParams.get('barId') ?? undefined;
  const reasonParam = searchParams.get('reason');
  const reason = REASONS.includes(reasonParam as Reason) ? (reasonParam as Reason) : undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') ?? 20)));

  // `from` is inclusive and `to` exclusive. They are instants rather than
  // calendar dates so the caller decides which timezone a "day" is in.
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const from = parseInstant(fromParam);
  const to = parseInstant(toParam);
  if ((fromParam && !from) || (toParam && !to)) {
    return NextResponse.json({ error: 'from and to must be valid dates' }, { status: 400 });
  }

  const where = {
    ...(barId ? { cashTotal: { barId } } : {}),
    ...(reason ? { reason } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
  };

  const [data, total, sum, latestLine] = await Promise.all([
    prisma.cashTotalHistory.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      // id breaks ties so rows created in the same millisecond page stably.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        total: true,
        reason: true,
        extraInfo: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, gamertag: true } },
        cashTotal: { select: { bar: { select: { name: true } } } },
      },
    }),
    prisma.cashTotalHistory.count({ where }),
    prisma.cashTotalHistory.aggregate({ where, _sum: { total: true } }),
    // Cash totals store no currency of their own, so the display currency
    // comes from what the bar most recently actually sold in.
    prisma.orderLine.findFirst({
      where: barId ? { barId } : {},
      orderBy: { createdAt: 'desc' },
      select: { currencyAtSale: true },
    }),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    netMinor: sum._sum?.total ?? 0,
    currency: latestLine?.currencyAtSale ?? null,
  });
}
