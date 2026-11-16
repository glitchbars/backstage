import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
    prisma: {
        bar: { findUnique: vi.fn() },
        orderLine: { findMany: vi.fn() },
        orderSession: { findMany: vi.fn() },
        menuItem: { findMany: vi.fn() },
    },
}));
vi.mock('@/lib/require-admin', () => ({ requireAdmin: vi.fn() }));
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const sale = {
    id: 'line-1',
    menuItemId: 'cocktail',
    nameAtSale: 'Margarita',
    categoryNameAtSale: 'Cocktails',
    createdAt: new Date('2026-10-20T21:00:00Z'),
    settledAt: new Date('2026-10-21T23:00:00Z'),
    currencyAtSale: 'EUR',
    unitPriceAmountMinor: 1000,
    discountAmountMinor: 0,
    taxRateBpsAtSale: 1000,
    taxIncludedAtSale: true,
};
function request(overrides: Record<string, string> = {}) {
    const params = new URLSearchParams({
        barId: 'bar-1',
        startDate: '2026-10-22',
        endDate: '2026-10-22',
        categories: '["Cocktails"]',
        ...overrides,
    });
    return new NextRequest(`http://localhost/api/cocktail-performance?${params}`);
}
beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T22:00:00Z'));
    vi.mocked(requireAdmin).mockResolvedValue({ session: { user: { id: 'admin' } } } as never);
    vi.mocked(prisma.bar.findUnique).mockResolvedValue({ timezone: 'Europe/Madrid' } as never);
    vi.mocked(prisma.orderLine.findMany).mockResolvedValue([sale] as never);
    vi.mocked(prisma.orderSession.findMany).mockResolvedValue([
        {
            id: 'session-1',
            openedAt: new Date('2026-10-20T20:00:00Z'),
            closedAt: new Date('2026-10-21T23:30:00Z'),
            status: 'CLOSED',
            lines: [sale, { ...sale, createdAt: new Date('2026-10-21T22:00:00Z') }],
        },
    ] as never);
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([] as never);
});
afterEach(() => vi.useRealTimers());

describe('cocktail performance API', () => {
    it('requires admin before any database access', async () => {
        vi.mocked(requireAdmin).mockResolvedValue({
            error: NextResponse.json({}, { status: 401 }),
        } as never);
        expect((await GET(request())).status).toBe(401);
        expect(prisma.bar.findUnique).not.toHaveBeenCalled();
    });

    it.each<Record<string, string>>([
        { barId: '' },
        { startDate: '2026-02-30' },
        { startDate: '2026-10-23' },
        { startDate: '2000-01-01' },
        { categories: '{}' },
        { categories: 'null' },
    ])('rejects malformed filters %j', async (overrides) => {
        expect((await GET(request(overrides))).status).toBe(400);
        expect(prisma.orderLine.findMany).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown bar', async () => {
        vi.mocked(prisma.bar.findUnique).mockResolvedValue(null);
        expect((await GET(request())).status).toBe(404);
    });

    it('scopes every historical query to the bar and inspects complete sessions across date boundaries', async () => {
        const response = await GET(request());
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.products[0].period).toMatchObject({
            quantity: 1,
            eligibleOrders: 1,
            repeatOrders: 1,
        });
        expect(prisma.orderLine.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    voidedAt: null,
                    settledAt: { lte: new Date() },
                    session: { is: { barId: 'bar-1', reversedAt: null } },
                },
            }),
        );
        expect(prisma.orderSession.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    barId: 'bar-1',
                    status: 'CLOSED',
                    reversedAt: null,
                    closedAt: { lte: new Date() },
                },
                select: expect.objectContaining({
                    lines: { where: { voidedAt: null }, select: expect.any(Object) },
                }),
            }),
        );
        expect(body.salesAvailableFrom).toBe(sale.settledAt.toISOString());
    });

    it('caps future selected dates at the bar-local current day', async () => {
        const body = await (await GET(request({ endDate: '2026-12-31' }))).json();
        expect(body.endDate).toBe('2026-10-23');
    });

    it('rejects unknown categories and never lets beerKeys change the fixed beer comparison', async () => {
        expect((await GET(request({ categories: '["Unknown"]' }))).status).toBe(400);
        const body = await (await GET(request({ beerKeys: '["menu:foreign"]' }))).json();
        expect(body.comparisonBeers).toEqual([]);
        expect(body.products[0].period.beerOrders).toBe(0);
    });

    it('returns catalog choices with no inferred cocktail categories when nothing is selected', async () => {
        vi.mocked(prisma.orderLine.findMany).mockResolvedValue([]);
        vi.mocked(prisma.orderSession.findMany).mockResolvedValue([]);
        vi.mocked(prisma.menuItem.findMany).mockResolvedValue([
            { id: 'beer', name: 'Caña', category: { name: 'Beer' } },
        ] as never);
        const body = await (await GET(request({ categories: '[]' }))).json();
        expect(body.products).toEqual([]);
        expect(body.choices).toEqual([{ key: 'menu:beer', name: 'Caña', category: 'Beer' }]);
        expect(body.salesAvailableFrom).toBeNull();
    });

    it('pages sales and sessions with stable cursors without duplicating the final page', async () => {
        vi.mocked(prisma.orderLine.findMany)
            .mockResolvedValueOnce(
                Array.from({ length: 2000 }, (_, index) => ({ ...sale, id: `line-${index}` })) as never,
            )
            .mockResolvedValueOnce([]);
        vi.mocked(prisma.orderSession.findMany)
            .mockResolvedValueOnce(
                Array.from({ length: 500 }, (_, index) => ({
                    id: `session-${index}`,
                    openedAt: sale.createdAt,
                    closedAt: sale.settledAt,
                    status: 'CLOSED',
                    lines: [sale],
                })) as never,
            )
            .mockResolvedValueOnce([]);
        const body = await (await GET(request())).json();
        expect(body.products[0].allTime.quantity).toBe(2000);
        expect(prisma.orderLine.findMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ cursor: { id: 'line-1999' }, skip: 1 }),
        );
        expect(prisma.orderSession.findMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ cursor: { id: 'session-499' }, skip: 1 }),
        );
    });

    it('returns short-order repeat counts and popular pairs using only the named caña', async () => {
        vi.mocked(prisma.orderSession.findMany).mockResolvedValue([
            {
                id: 'short',
                openedAt: new Date('2026-10-21T23:00:00Z'),
                closedAt: new Date('2026-10-21T23:04:00Z'),
                status: 'CLOSED',
                lines: [
                    { ...sale, createdAt: new Date('2026-10-21T23:00:00Z') },
                    { ...sale, createdAt: new Date('2026-10-21T23:01:01Z') },
                    { ...sale, createdAt: new Date('2026-10-21T23:02:02Z') },
                    {
                        ...sale,
                        menuItemId: 'beer',
                        nameAtSale: 'Caña Estella',
                        categoryNameAtSale: 'Beer',
                        createdAt: new Date('2026-10-21T23:03:00Z'),
                    },
                    { ...sale, menuItemId: 'lager', nameAtSale: 'Lager', categoryNameAtSale: 'Beer' },
                ],
            },
        ] as never);
        const body = await (await GET(request())).json();
        expect(body.products[0].period).toMatchObject({
            eligibleOrders: 1,
            repeatCount: 2,
            repeatRounds: 2,
            beerOrders: 1,
            repeatDistribution: [{ repeats: 2, orders: 1 }],
        });
        expect(body.combos).toHaveLength(1);
        expect(body.combos[0].period.orders).toBe(1);
        expect(body.comparisonBeers[0].name).toBe('Caña Estella');
    });

    it('defaults to recognizable cocktail categories without manual setup', async () => {
        const response = await GET(
            new NextRequest(
                'http://localhost/api/cocktail-performance?barId=bar-1&startDate=2026-10-22&endDate=2026-10-22',
            ),
        );
        const body = await response.json();
        expect(body.selectedCategories).toEqual(['Cocktails']);
        expect(body.products[0].name).toBe('Margarita');
    });

    it('returns zero repeat rounds for eight together, then one round and eight extra units when bought again', async () => {
        const start = new Date('2026-10-21T23:00:00Z').getTime();
        const bulk = (minutes: number) =>
            Array.from({ length: 8 }, (_, index) => ({
                ...sale,
                createdAt: new Date(start + minutes * 60_000 + index * 1000),
            }));
        const closedOrder = {
            id: 'bulk',
            openedAt: new Date(start),
            closedAt: new Date(start + 10 * 60_000),
            status: 'CLOSED',
        };
        vi.mocked(prisma.orderSession.findMany).mockResolvedValue([
            { ...closedOrder, lines: bulk(0) },
        ] as never);
        const initial = await (await GET(request())).json();
        expect(initial.products[0].period).toMatchObject({
            repeatCount: 0,
            repeatRounds: 0,
            repeatOrders: 0,
        });
        vi.mocked(prisma.orderSession.findMany).mockResolvedValue([
            { ...closedOrder, lines: [...bulk(0), ...bulk(5)] },
        ] as never);
        const later = await (await GET(request())).json();
        expect(later.products[0].period).toMatchObject({
            repeatCount: 8,
            repeatRounds: 1,
            repeatOrders: 1,
            repeatDistribution: [{ repeats: 1, orders: 1 }],
        });
    });
});
