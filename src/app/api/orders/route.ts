import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const STATUSES = ['OPEN', 'CLOSED'] as const;
type Status = (typeof STATUSES)[number];

// Read-only on purpose: order sessions are written by the POS app while a bar is
// trading. Backstage reports on them, it never edits them.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const barId = searchParams.get('barId') ?? undefined;
  const statusParam = searchParams.get('status');
  const status = STATUSES.includes(statusParam as Status) ? (statusParam as Status) : undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') ?? 20)));
  const skip = (page - 1) * pageSize;

  const where = { ...(barId ? { barId } : {}), ...(status ? { status } : {}) };

  const [sessions, total] = await Promise.all([
    prisma.orderSession.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { openedAt: 'desc' },
      include: {
        bar: { select: { name: true } },
        mesa: { select: { name: true } },
        console: { select: { name: true } },
        createdBy: { select: { id: true, name: true, gamertag: true } },
        // Voided lines are excluded from every total, and the total is a plain
        // sum of unit prices with no tax adjustment — both match how the POS
        // derives `gross` (unreal-customer order-sessions-controller.ts).
        lines: {
          where: { voidedAt: null },
          select: { unitPriceAmountMinor: true, currencyAtSale: true, settledAt: true },
        },
        _count: { select: { payments: true, paymentCorrections: true } },
      },
    }),
    prisma.orderSession.count({ where }),
  ]);

  const data = sessions.map(({ lines, _count, ...session }) => ({
    ...session,
    itemCount: lines.length,
    currency: lines[0]?.currencyAtSale ?? null,
    grossMinor: lines.reduce((sum, l) => sum + l.unitPriceAmountMinor, 0),
    paidMinor: lines
      .filter((l) => l.settledAt !== null)
      .reduce((sum, l) => sum + l.unitPriceAmountMinor, 0),
    paymentCount: _count.payments,
    correctionCount: _count.paymentCorrections,
  }));

  return NextResponse.json({ data, total, page, pageSize });
}
