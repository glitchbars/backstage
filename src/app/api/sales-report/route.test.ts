import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
    prisma: {
        $queryRaw: vi.fn(),
        orderLine: { findFirst: vi.fn() },
        bar: { findUnique: vi.fn() },
        dailyTill: { findMany: vi.fn() },
    },
}));

vi.mock('@/lib/require-admin', () => ({
    requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const queryRawMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const BASE_URL = 'http://localhost/api/sales-report';
const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
    error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

function makeRequest(query = 'barId=bar-1&startDate=2026-10-01&endDate=2026-10-04&grouping=day') {
    return new NextRequest(`${BASE_URL}?${query}`);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_SESSION);
    queryRawMock.mockResolvedValue([
        { date: new Date('2026-10-01T00:00:00Z'), salesInclTaxMinor: 17380, salesExclTaxMinor: 15800, customers: 19 },
        { date: new Date('2026-10-04T00:00:00Z'), salesInclTaxMinor: 36950, salesExclTaxMinor: 33598, customers: 2 },
    ] as never);
    vi.mocked(prisma.orderLine.findFirst).mockResolvedValue({ currencyAtSale: 'EUR' } as never);
    vi.mocked(prisma.bar.findUnique).mockResolvedValue({ timezone: 'Europe/Madrid' } as never);
    vi.mocked(prisma.dailyTill.findMany).mockResolvedValue([] as never);
});

describe('GET /api/sales-report', () => {
    it('requires an admin before querying sales', async () => {
        vi.mocked(requireAdmin).mockResolvedValue(UNAUTH_RESPONSE);

        const response = await GET(makeRequest());

        expect(response.status).toBe(401);
        expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('filters by bar and inclusive date range and returns grouped rows', async () => {
        const response = await GET(makeRequest());
        const body = await response.json();

        expect(queryRawMock).toHaveBeenCalledTimes(1);
        expect(queryRawMock.mock.calls[0]).toEqual(
            expect.arrayContaining([
                'bar-1',
                new Date('2026-10-01T00:00:00.000Z'),
                new Date('2026-10-04T00:00:00.000Z'),
            ]),
        );
        expect(body.currency).toBe('EUR');
        expect(body.timezone).toBe('Europe/Madrid');
        expect(body.buckets).toHaveLength(4);
        expect(body.buckets[0]).toMatchObject({ salesInclTaxMinor: 17380, customers: 19 });
        expect(body.buckets[1]).toMatchObject({ hasData: false, daysWithData: 0 });
        expect(body.buckets[3]).toMatchObject({ averageSpendMinor: 18475 });
        expect(prisma.dailyTill.findMany).toHaveBeenCalledWith({
            where: {
                barId: 'bar-1',
                open: false,
                createdAt: {
                    gte: new Date('2026-09-30T00:00:00.000Z'),
                    lt: new Date('2026-10-06T00:00:00.000Z'),
                },
            },
            orderBy: { createdAt: 'asc' },
            select: {
                createdAt: true,
                totalCash: true,
                totalCard: true,
                closedOrders: { where: { reversedAt: null }, select: { customerCount: true } },
            },
        });
    });

    it('includes a closed Flopi till for the selected local date', async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
        vi.mocked(prisma.dailyTill.findMany).mockResolvedValue([
            {
                createdAt: new Date('2026-10-05T17:19:26.366Z'),
                totalCash: 3810,
                totalCard: 39048,
                closedOrders: [{ customerCount: 12 }],
            },
        ] as never);

        const response = await GET(
            makeRequest('barId=bar-1&startDate=2026-10-05&endDate=2026-10-05&grouping=day'),
        );
        const body = await response.json();

        expect(body.buckets[0]).toMatchObject({ hasData: false });
        expect(body.tillBuckets[0]).toMatchObject({
            startDate: '2026-10-05',
            totalCash: 3810,
            totalCard: 39048,
            total: 42858,
            tillCount: 1,
            customerCount: 12,
        });
    });

    it('returns a separate previous-period comparison', async () => {
        queryRawMock.mockResolvedValue([
            {
                date: new Date('2026-09-15T00:00:00Z'),
                salesInclTaxMinor: 10000,
                salesExclTaxMinor: 9000,
                customers: 10,
            },
            {
                date: new Date('2026-10-03T00:00:00Z'),
                salesInclTaxMinor: 5000,
                salesExclTaxMinor: 4500,
                customers: 5,
            },
            {
                date: new Date('2026-10-15T00:00:00Z'),
                salesInclTaxMinor: 12000,
                salesExclTaxMinor: 10800,
                customers: 12,
            },
        ] as never);

        const response = await GET(
            makeRequest(
                'barId=bar-1&startDate=2026-10-01&endDate=2026-10-31&grouping=month&previousStartDate=2026-09-01&previousEndDate=2026-09-30',
            ),
        );
        const body = await response.json();

        expect(body.previous).toMatchObject({
            startDate: '2026-09-01',
            endDate: '2026-09-30',
            buckets: [{ salesInclTaxMinor: 10000, salesExclTaxMinor: 9000, customers: 10 }],
        });
        expect(body.buckets[0]).toMatchObject({
            salesInclTaxMinor: 5000,
            salesExclTaxMinor: 4500,
            customers: 5,
        });
    });

    it.each([
        ['missing bar', 'startDate=2026-10-01&endDate=2026-10-04'],
        ['invalid date', 'barId=bar-1&startDate=2026-02-30&endDate=2026-10-04'],
        ['reversed dates', 'barId=bar-1&startDate=2026-10-05&endDate=2026-10-04'],
        ['unknown grouping', 'barId=bar-1&startDate=2026-10-01&endDate=2026-10-04&grouping=quarter'],
    ])('rejects %s', async (_label, query) => {
        const response = await GET(makeRequest(query));

        expect(response.status).toBe(400);
        expect(queryRawMock).not.toHaveBeenCalled();
    });
});