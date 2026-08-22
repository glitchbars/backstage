import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    orderSession: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindMany = vi.mocked(prisma.orderSession.findMany);
const mockCount = vi.mocked(prisma.orderSession.count);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

const BASE_URL = 'http://localhost/api/orders';

function makeRequest(url: string) {
  return new NextRequest(url);
}

function line(amount: number, settled: boolean, cost = 0) {
  return {
    unitPriceAmountMinor: amount,
    unitCostAmountMinor: cost,
    currencyAtSale: 'EUR',
    settledAt: settled ? new Date() : null,
  };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Table 4',
    status: 'OPEN',
    lines: [],
    _count: { payments: 0, paymentCorrections: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCount.mockResolvedValue(0);
  mockFindMany.mockResolvedValue([] as never);
});

describe('GET /api/orders', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeRequest(BASE_URL));

    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('lists newest first with no filters by default', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest(BASE_URL));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { openedAt: 'desc' }, skip: 0, take: 20 }),
    );
  });

  it('filters by bar and status together', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest(`${BASE_URL}?barId=bar-1&status=CLOSED`));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barId: 'bar-1', status: 'CLOSED' } }),
    );
  });

  it('ignores a status outside the enum rather than passing it to Prisma', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest(`${BASE_URL}?status=DELETED`));

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('excludes voided lines from the query', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest(BASE_URL));

    const include = mockFindMany.mock.calls[0][0]?.include as { lines: { where: unknown } };
    expect(include.lines.where).toEqual({ voidedAt: null });
  });

  it('totals gross from every line and paid from settled lines only', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([
      session({ lines: [line(500, true), line(250, false), line(125, true)] }),
    ] as never);
    mockCount.mockResolvedValue(1);

    const res = await GET(makeRequest(BASE_URL));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      itemCount: 3,
      currency: 'EUR',
      grossMinor: 875,
      paidMinor: 625,
    });
    expect(body.data[0].lines).toBeUndefined();
  });

  it('reports an order with no lines as zero rather than crashing', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([session()] as never);
    mockCount.mockResolvedValue(1);

    const body = await (await GET(makeRequest(BASE_URL))).json();

    expect(body.data[0]).toMatchObject({
      itemCount: 0,
      currency: null,
      grossMinor: 0,
      paidMinor: 0,
    });
  });

  it('flattens the payment and correction counts', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([
      session({ _count: { payments: 2, paymentCorrections: 1 } }),
    ] as never);
    mockCount.mockResolvedValue(1);

    const body = await (await GET(makeRequest(BASE_URL))).json();

    expect(body.data[0]).toMatchObject({ paymentCount: 2, correctionCount: 1 });
    expect(body.data[0]._count).toBeUndefined();
  });

  it('paginates', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCount.mockResolvedValue(42);

    const body = await (await GET(makeRequest(`${BASE_URL}?page=3&pageSize=10`))).json();

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    expect(body).toMatchObject({ total: 42, page: 3, pageSize: 10 });
  });
});
