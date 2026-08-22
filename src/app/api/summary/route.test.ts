import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    cashTotal: { aggregate: vi.fn() },
    cashTotalHistory: { findMany: vi.fn() },
    dailyTill: { findMany: vi.fn() },
    orderSession: { count: vi.fn() },
    orderLine: { aggregate: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
    bar: { count: vi.fn() },
    menuItem: { count: vi.fn() },
    mesa: { count: vi.fn() },
    console: { count: vi.fn() },
    barMembership: { count: vi.fn() },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

const BASE_URL = 'http://localhost/api/summary';

function makeRequest(url = BASE_URL) {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.cashTotal.aggregate).mockResolvedValue({
    _sum: { total: 62410 },
    _max: { updatedAt: new Date('2026-08-22T10:00:00Z') },
    _count: { _all: 1 },
  } as never);
  vi.mocked(prisma.cashTotalHistory.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.dailyTill.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.orderSession.count).mockResolvedValue(0);
  vi.mocked(prisma.orderLine.aggregate).mockResolvedValue({
    _sum: { unitPriceAmountMinor: 5000, unitCostAmountMinor: 2000 },
    _count: { _all: 4 },
  } as never);
  vi.mocked(prisma.orderLine.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.orderLine.findFirst).mockResolvedValue({ currencyAtSale: 'EUR' } as never);
  vi.mocked(prisma.bar.count).mockResolvedValue(1);
  vi.mocked(prisma.menuItem.count).mockResolvedValue(154);
  vi.mocked(prisma.mesa.count).mockResolvedValue(8);
  vi.mocked(prisma.console.count).mockResolvedValue(4);
  vi.mocked(prisma.barMembership.count).mockResolvedValue(3);
});

describe('GET /api/summary', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(prisma.cashTotal.aggregate).not.toHaveBeenCalled();
  });

  it('sums the cash drawers and reports how many it covered', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const body = await (await GET(makeRequest())).json();

    expect(body.cash).toMatchObject({ totalMinor: 62410, barCount: 1 });
  });

  it('takes the display currency from the most recent sale', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const body = await (await GET(makeRequest())).json();

    expect(body.currency).toBe('EUR');
  });

  it('reports a null currency when the bar has never sold anything', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.orderLine.findFirst).mockResolvedValue(null);

    const body = await (await GET(makeRequest())).json();

    expect(body.currency).toBeNull();
  });

  it('scopes every bar-specific query when barId is given', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest(`${BASE_URL}?barId=bar-1`));

    expect(prisma.cashTotal.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barId: 'bar-1' } }),
    );
    // History hangs off CashTotal, so it filters through the relation.
    expect(prisma.cashTotalHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cashTotal: { barId: 'bar-1' } } }),
    );
    expect(prisma.mesa.count).toHaveBeenCalledWith({ where: { barId: 'bar-1' } });
  });

  it('applies no bar filter when barId is absent', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest());

    expect(prisma.cashTotal.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(prisma.cashTotalHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('excludes voided lines from the sales figures', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest());

    const where = vi.mocked(prisma.orderLine.aggregate).mock.calls[0][0]?.where as {
      voidedAt: null;
    };
    expect(where.voidedAt).toBeNull();
  });

  it('counts paid revenue from settled lines only', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest());

    const paidCall = vi.mocked(prisma.orderLine.aggregate).mock.calls[1][0]?.where as {
      settledAt: unknown;
    };
    expect(paidCall.settledAt).toEqual({ not: null });
  });

  it('flattens the grouped top sellers', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.orderLine.groupBy).mockResolvedValue([
      { nameAtSale: 'Estrella', _count: { _all: 12 }, _sum: { unitPriceAmountMinor: 4800 } },
    ] as never);

    const body = await (await GET(makeRequest())).json();

    expect(body.topItems).toEqual([{ name: 'Estrella', quantity: 12, grossMinor: 4800 }]);
  });

  it('reports zeroes rather than nulls when there is no activity', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.cashTotal.aggregate).mockResolvedValue({
      _sum: { total: null },
      _max: { updatedAt: null },
      _count: { _all: 0 },
    } as never);
    vi.mocked(prisma.orderLine.aggregate).mockResolvedValue({
      _sum: { unitPriceAmountMinor: null, unitCostAmountMinor: null },
      _count: { _all: 0 },
    } as never);

    const body = await (await GET(makeRequest())).json();

    expect(body.cash.totalMinor).toBe(0);
    expect(body.last24h).toMatchObject({ grossMinor: 0, costMinor: 0, paidMinor: 0, items: 0 });
  });

  it('only counts sessions that are still open for the open-orders tile', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest());

    expect(prisma.orderSession.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: 'OPEN' }),
    });
  });
});
