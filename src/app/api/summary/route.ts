import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const STAFF_SELECT = { select: { id: true, name: true, gamertag: true } };
const DAY_MS = 24 * 60 * 60 * 1000;

// Read-only, like /api/orders: tills and cash totals are written by the till app.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const barId = request.nextUrl.searchParams.get('barId') ?? undefined;
  const barWhere = barId ? { barId } : {};
  const since24h = new Date(Date.now() - DAY_MS);
  const since30d = new Date(Date.now() - 30 * DAY_MS);

  const liveLines = { voidedAt: null, ...barWhere };

  const [
    cash,
    cashHistory,
    openTills,
    recentTills,
    sessions24h,
    lines24h,
    paid24h,
    openOrders,
    topItems,
    latestLine,
    counts,
  ] = await Promise.all([
    // barId is @unique on CashTotal, so this is one row per bar; summing lets the
    // unfiltered view show every bar's drawer at once.
    prisma.cashTotal.aggregate({
      where: barWhere,
      _sum: { total: true },
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.cashTotalHistory.findMany({
      where: barId ? { cashTotal: { barId } } : {},
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        total: true,
        reason: true,
        extraInfo: true,
        createdAt: true,
        createdBy: STAFF_SELECT,
        cashTotal: { select: { bar: { select: { name: true } } } },
      },
    }),
    prisma.dailyTill.findMany({
      where: { open: true, ...barWhere },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        totalCash: true,
        totalCard: true,
        createdAt: true,
        updatedAt: true,
        bar: { select: { name: true } },
        _count: { select: { closedOrders: true } },
      },
    }),
    prisma.dailyTill.findMany({
      where: barWhere,
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        open: true,
        totalCash: true,
        totalCard: true,
        createdAt: true,
        updatedAt: true,
        bar: { select: { name: true } },
        _count: { select: { closedOrders: true } },
      },
    }),
    prisma.orderSession.count({ where: { openedAt: { gte: since24h }, ...barWhere } }),
    prisma.orderLine.aggregate({
      where: { ...liveLines, createdAt: { gte: since24h } },
      _sum: { unitPriceAmountMinor: true, unitCostAmountMinor: true },
      _count: { _all: true },
    }),
    prisma.orderLine.aggregate({
      where: { ...liveLines, createdAt: { gte: since24h }, settledAt: { not: null } },
      _sum: { unitPriceAmountMinor: true },
    }),
    prisma.orderSession.count({ where: { status: 'OPEN', ...barWhere } }),
    prisma.orderLine.groupBy({
      by: ['nameAtSale'],
      where: { ...liveLines, createdAt: { gte: since30d } },
      _count: { _all: true },
      _sum: { unitPriceAmountMinor: true },
      orderBy: { _count: { nameAtSale: 'desc' } },
      take: 5,
    }),
    // Tills and cash totals store no currency of their own, so the display
    // currency comes from what the bar most recently actually sold in.
    prisma.orderLine.findFirst({
      where: barWhere,
      orderBy: { createdAt: 'desc' },
      select: { currencyAtSale: true },
    }),
    Promise.all([
      prisma.bar.count(),
      prisma.menuItem.count({ where: { deletedAt: null, ...barWhere } }),
      prisma.mesa.count({ where: barWhere }),
      prisma.console.count({ where: barWhere }),
      prisma.barMembership.count({ where: barWhere }),
    ]),
  ]);

  const [bars, menuItems, mesas, consoles, staff] = counts;
  const grossMinor = lines24h._sum.unitPriceAmountMinor ?? 0;

  return NextResponse.json({
    currency: latestLine?.currencyAtSale ?? null,
    cash: {
      totalMinor: cash._sum.total ?? 0,
      updatedAt: cash._max.updatedAt,
      barCount: cash._count._all,
    },
    cashHistory,
    openTills,
    recentTills,
    last24h: {
      orders: sessions24h,
      items: lines24h._count._all,
      grossMinor,
      costMinor: lines24h._sum.unitCostAmountMinor ?? 0,
      paidMinor: paid24h._sum.unitPriceAmountMinor ?? 0,
    },
    openOrders,
    topItems: topItems.map((item) => ({
      name: item.nameAtSale,
      quantity: item._count._all,
      grossMinor: item._sum.unitPriceAmountMinor ?? 0,
    })),
    counts: { bars, menuItems, mesas, consoles, staff },
  });
}
