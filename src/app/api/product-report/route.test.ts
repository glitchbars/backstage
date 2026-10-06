import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
    prisma: {
        bar: { findUnique: vi.fn() },
        orderLine: { findMany: vi.fn(), findFirst: vi.fn() },
        menuItem: { findMany: vi.fn() },
    },
}));

vi.mock('@/lib/require-admin', () => ({
    requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const BASE_URL = 'http://localhost/api/product-report';
const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
    error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

function makeRequest(query = 'barId=bar-1&startDate=2026-10-05&endDate=2026-10-06') {
    return new NextRequest(`${BASE_URL}?${query}`);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.bar.findUnique).mockResolvedValue({ timezone: 'Europe/Madrid' } as never);
    vi.mocked(prisma.orderLine.findMany).mockResolvedValue([
        {
            nameAtSale: 'Lager',
            menuItemId: null,
            categoryNameAtSale: 'Beer',
            unitPriceAmountMinor: 600,
            discountAmountMinor: 100,
            taxRateBpsAtSale: 2100,
            taxIncludedAtSale: true,
        },
    ] as never);
    vi.mocked(prisma.orderLine.findFirst).mockResolvedValue({ currencyAtSale: 'EUR' } as never);
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([] as never);
});

describe('GET /api/product-report', () => {
    it('requires an admin before querying product lines', async () => {
        vi.mocked(requireAdmin).mockResolvedValue(UNAUTH_RESPONSE);

        const response = await GET(makeRequest());

        expect(response.status).toBe(401);
        expect(prisma.orderLine.findMany).not.toHaveBeenCalled();
    });

    it('filters settled, non-voided, non-reversed products by bar-local dates', async () => {
        const response = await GET(makeRequest());
        const body = await response.json();

        expect(prisma.orderLine.findMany).toHaveBeenCalledWith({
            where: {
                barId: 'bar-1',
                voidedAt: null,
                settledAt: {
                    gte: new Date('2026-10-04T22:00:00.000Z'),
                    lt: new Date('2026-10-06T22:00:00.000Z'),
                },
                session: { is: { reversedAt: null } },
            },
            select: {
                nameAtSale: true,
                menuItemId: true,
                categoryNameAtSale: true,
                unitPriceAmountMinor: true,
                discountAmountMinor: true,
                taxRateBpsAtSale: true,
                taxIncludedAtSale: true,
            },
        });
        expect(body.products).toMatchObject([
            { name: 'Lager', quantity: 1, salesInclTaxMinor: 500, salesExclTaxMinor: 413 },
        ]);
        expect(body.currency).toBe('EUR');
        expect(body.totals).toMatchObject({ quantity: 1, salesInclTaxMinor: 500, discountMinor: 100 });
        expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
            where: { barId: 'bar-1', deletedAt: null },
            select: { id: true, name: true, category: { select: { name: true } } },
        });
    });

    it('includes non-deleted catalog products with zero sales', async () => {
        vi.mocked(prisma.orderLine.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.menuItem.findMany).mockResolvedValue([
            { id: 'menu-1', name: 'Margarita', category: { name: 'CÓCTELES AUTOR' } },
        ] as never);

        const response = await GET(makeRequest());
        const body = await response.json();

        expect(body.products).toMatchObject([
            {
                menuItemId: 'menu-1',
                name: 'Margarita',
                category: 'CÓCTELES AUTOR',
                quantity: 0,
                salesInclTaxMinor: 0,
                salesExclTaxMinor: 0,
            },
        ]);
        expect(body.totals).toMatchObject({ quantity: 0, salesInclTaxMinor: 0, salesExclTaxMinor: 0 });
    });

    it('includes catalog products with a missing category', async () => {
        vi.mocked(prisma.orderLine.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.menuItem.findMany).mockResolvedValue([
            { id: 'menu-2', name: 'Uncategorised special', category: null },
        ] as never);

        const response = await GET(makeRequest());
        const body = await response.json();

        expect(body.products).toMatchObject([
            { menuItemId: 'menu-2', name: 'Uncategorised special', category: null, quantity: 0 },
        ]);
    });

    it('clamps product history to the Flopi source start date', async () => {
        const response = await GET(
            makeRequest('barId=bar-1&startDate=2025-01-01&endDate=2026-10-06'),
        );

        expect((await response.json()).startDate).toBe('2026-10-05');
        expect(prisma.orderLine.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    settledAt: {
                        gte: new Date('2026-10-04T22:00:00.000Z'),
                        lt: new Date('2026-10-06T22:00:00.000Z'),
                    },
                }),
            }),
        );
    });

    it('rejects an invalid date range', async () => {
        const response = await GET(makeRequest('barId=bar-1&startDate=2026-10-07&endDate=2026-10-05'));

        expect(response.status).toBe(400);
        expect(prisma.orderLine.findMany).not.toHaveBeenCalled();
    });
});