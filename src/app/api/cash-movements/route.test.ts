import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    cashTotalHistory: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    orderLine: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindMany = vi.mocked(prisma.cashTotalHistory.findMany);
const mockCount = vi.mocked(prisma.cashTotalHistory.count);
const mockAggregate = vi.mocked(prisma.cashTotalHistory.aggregate);
const mockFindCurrency = vi.mocked(prisma.orderLine.findFirst);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

const BASE_URL = 'http://localhost/api/cash-movements';

function makeRequest(query = '') {
  return new NextRequest(query ? `${BASE_URL}?${query}` : BASE_URL);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
  mockFindMany.mockResolvedValue([] as never);
  mockCount.mockResolvedValue(0);
  mockAggregate.mockResolvedValue({ _sum: { total: null } } as never);
  mockFindCurrency.mockResolvedValue({ currencyAtSale: 'EUR' } as never);
});

describe('GET /api/cash-movements', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('lists newest first with no filters by default', async () => {
    await GET(makeRequest());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      }),
    );
  });

  it('filters by bar, reason and date range together', async () => {
    await GET(
      makeRequest(
        'barId=bar-1&reason=CASH_OUT&from=2026-11-01T00:00:00.000Z&to=2026-11-08T00:00:00.000Z',
      ),
    );

    const where = {
      cashTotal: { barId: 'bar-1' },
      reason: 'CASH_OUT',
      createdAt: {
        gte: new Date('2026-11-01T00:00:00.000Z'),
        lt: new Date('2026-11-08T00:00:00.000Z'),
      },
    };
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(mockCount).toHaveBeenCalledWith({ where });
    expect(mockAggregate).toHaveBeenCalledWith({ where, _sum: { total: true } });
    expect(mockFindCurrency).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barId: 'bar-1' } }),
    );
  });

  it('accepts an open-ended date range', async () => {
    await GET(makeRequest('from=2026-11-01T00:00:00.000Z'));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: { gte: new Date('2026-11-01T00:00:00.000Z') } },
      }),
    );
  });

  it('ignores an unknown reason', async () => {
    await GET(makeRequest('reason=REFUND'));

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('rejects an unparseable date', async () => {
    const res = await GET(makeRequest('from=not-a-date'));

    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('pages through results and caps the page size', async () => {
    await GET(makeRequest('page=3&pageSize=500'));

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 200, take: 100 }));
  });

  it('returns the page with the net total and currency of the whole filtered set', async () => {
    const row = { id: 'h1', total: -1500, reason: 'CASH_OUT' };
    mockFindMany.mockResolvedValue([row] as never);
    mockCount.mockResolvedValue(42);
    mockAggregate.mockResolvedValue({ _sum: { total: -9000 } } as never);

    const res = await GET(makeRequest());

    expect(await res.json()).toEqual({
      data: [row],
      total: 42,
      page: 1,
      pageSize: 20,
      netMinor: -9000,
      currency: 'EUR',
    });
  });
});
