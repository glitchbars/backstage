import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
    prisma: {
        bar: { findUnique: vi.fn() },
        orderSession: { findFirst: vi.fn(), findMany: vi.fn() },
        orderLine: { findFirst: vi.fn(), findMany: vi.fn() },
    },
}));

vi.mock('@/lib/require-admin', () => ({ requireAdmin: vi.fn() }));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const BASE_URL = 'http://localhost/api/order-timing-report';
const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;

function makeRequest(query = 'barId=bar-1&startDate=2026-10-10&endDate=2026-10-10') {
    return new NextRequest(`${BASE_URL}?${query}`);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.bar.findUnique).mockResolvedValue({ timezone: 'Europe/Madrid' } as never);
    vi.mocked(prisma.orderSession.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.orderLine.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.orderSession.findMany).mockResolvedValue([
        { id: 'session-1', openedAt: new Date('2026-10-10T18:00:00.000Z') },
    ] as never);
    vi.mocked(prisma.orderLine.findMany).mockResolvedValue([
        {
            id: 'line-1',
            orderSessionId: 'session-1',
            createdAt: new Date('2026-10-10T21:00:00.000Z'),
            menuItemId: 'drink-1',
            nameAtSale: 'Spritz',
            categoryNameAtSale: 'Cocktails',
        },
    ] as never);
});

describe('GET /api/order-timing-report', () => {
    it('requires an admin before reading order data', async () => {
        vi.mocked(requireAdmin).mockResolvedValue({
            error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        } as never);

        const response = await GET(makeRequest());

        expect(response.status).toBe(401);
        expect(prisma.orderSession.findMany).not.toHaveBeenCalled();
    });

    it('queries opening and item timestamps independently using bar-local date bounds', async () => {
        const response = await GET(makeRequest());
        const body = await response.json();

        expect(prisma.orderSession.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    barId: 'bar-1',
                    reversedAt: null,
                    openedAt: {
                        gte: new Date('2026-10-09T22:00:00.000Z'),
                        lt: new Date('2026-10-10T22:00:00.000Z'),
                    },
                },
            }),
        );
        expect(prisma.orderLine.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    voidedAt: null,
                    createdAt: {
                        gte: new Date('2026-10-09T22:00:00.000Z'),
                        lt: new Date('2026-10-10T22:00:00.000Z'),
                    },
                    session: { is: { barId: 'bar-1', reversedAt: null } },
                },
            }),
        );
        expect(body).toMatchObject({
            barId: 'bar-1',
            timezone: 'Europe/Madrid',
            sessionOpenings: expect.arrayContaining([{ hour: 20, count: 1 }]),
            drinkOrders: expect.arrayContaining([{ hour: 23, count: 1 }]),
            availableFrom: null,
            availableThrough: null,
        });
    });

    it('uses earliest and latest detailed records for all-time coverage', async () => {
        vi.mocked(prisma.orderSession.findFirst)
            .mockResolvedValueOnce({ openedAt: new Date('2025-03-01T18:00:00.000Z') } as never)
            .mockResolvedValueOnce({ openedAt: new Date('2026-10-10T18:00:00.000Z') } as never);
        vi.mocked(prisma.orderLine.findFirst)
            .mockResolvedValueOnce(null as never)
            .mockResolvedValueOnce(null as never);

        const response = await GET(makeRequest('barId=bar-1&allTime=true'));
        const body = await response.json();

        expect(body.availableFrom).toBe('2025-03-01');
        expect(body.startDate).toBe('2025-03-01');
        expect(body.endDate).toBe('2026-10-10');
        expect(prisma.orderSession.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    openedAt: {
                        gte: new Date('2025-02-28T23:00:00.000Z'),
                        lt: new Date('2026-10-10T22:00:00.000Z'),
                    },
                }),
            }),
        );
    });

    it('rejects invalid date ranges before querying the database', async () => {
        const response = await GET(makeRequest('barId=bar-1&startDate=2026-10-11&endDate=2026-10-10'));

        expect(response.status).toBe(400);
        expect(prisma.bar.findUnique).not.toHaveBeenCalled();
    });
});
