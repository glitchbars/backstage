import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';
import { dateInTimezone, FLOPI_SOURCE_START_DATE, isIsoDate } from '@/lib/sales-report';
import {
    aggregateProductLines,
    getUtcBoundsForLocalDates,
    includeUnsoldCatalogProducts,
} from '@/lib/product-report';

const MAX_RANGE_DAYS = 3660;
const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const params = request.nextUrl.searchParams;
    const barId = params.get('barId');
    const requestedStartDate = params.get('startDate') ?? '';
    const requestedEndDate = params.get('endDate') ?? '';

    if (!barId) return NextResponse.json({ error: 'barId is required' }, { status: 400 });
    if (!isIsoDate(requestedStartDate) || !isIsoDate(requestedEndDate)) {
        return NextResponse.json({ error: 'startDate and endDate must be valid YYYY-MM-DD dates' }, { status: 400 });
    }
    if (requestedStartDate > requestedEndDate) {
        return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 });
    }
    const requestedDays =
        (Date.parse(`${requestedEndDate}T00:00:00Z`) - Date.parse(`${requestedStartDate}T00:00:00Z`)) /
        DAY_MS;
    if (requestedDays > MAX_RANGE_DAYS) {
        return NextResponse.json({ error: 'Date range cannot exceed 10 years' }, { status: 400 });
    }

    const bar = await prisma.bar.findUnique({ where: { id: barId }, select: { timezone: true } });
    if (!bar) return NextResponse.json({ error: 'Bar not found' }, { status: 404 });

    const timezone = bar.timezone || 'Europe/Madrid';
    const today = dateInTimezone(new Date(), timezone);
    const startDate = requestedStartDate < FLOPI_SOURCE_START_DATE ? FLOPI_SOURCE_START_DATE : requestedStartDate;
    const endDate = requestedEndDate > today ? today : requestedEndDate;

    if (startDate > endDate) {
        return NextResponse.json({
            barId,
            timezone,
            startDate,
            endDate,
            sourceStartDate: FLOPI_SOURCE_START_DATE,
            products: [],
            totals: { quantity: 0, salesInclTaxMinor: 0, salesExclTaxMinor: 0, discountMinor: 0 },
        });
    }

    const bounds = getUtcBoundsForLocalDates(startDate, endDate, timezone);
    const [lines, latestLine, catalog] = await Promise.all([
        prisma.orderLine.findMany({
            where: {
                barId,
                voidedAt: null,
                settledAt: { gte: bounds.start, lt: bounds.endExclusive },
                session: { is: { reversedAt: null } },
            },
            select: {
                menuItemId: true,
                nameAtSale: true,
                categoryNameAtSale: true,
                unitPriceAmountMinor: true,
                discountAmountMinor: true,
                taxRateBpsAtSale: true,
                taxIncludedAtSale: true,
            },
        }),
        prisma.orderLine.findFirst({
            where: { barId },
            orderBy: { createdAt: 'desc' },
            select: { currencyAtSale: true },
        }),
        prisma.menuItem.findMany({
            where: { barId, deletedAt: null },
            select: { id: true, name: true, category: { select: { name: true } } },
        }),
    ]);
    const sales = aggregateProductLines(lines);
    const products = includeUnsoldCatalogProducts(
        sales,
        catalog.map((item) => ({ id: item.id, name: item.name, category: item.category?.name ?? null })),
    );

    return NextResponse.json({
        barId,
        timezone,
        currency: latestLine?.currencyAtSale ?? null,
        startDate,
        endDate,
        sourceStartDate: FLOPI_SOURCE_START_DATE,
        products,
        totals: products.reduce(
            (total, product) => ({
                quantity: total.quantity + product.quantity,
                salesInclTaxMinor: total.salesInclTaxMinor + product.salesInclTaxMinor,
                salesExclTaxMinor: total.salesExclTaxMinor + product.salesExclTaxMinor,
                discountMinor: total.discountMinor + product.discountMinor,
            }),
            { quantity: 0, salesInclTaxMinor: 0, salesExclTaxMinor: 0, discountMinor: 0 },
        ),
    });
}