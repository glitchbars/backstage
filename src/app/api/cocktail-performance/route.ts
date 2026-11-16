import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';
import { dateInTimezone, isIsoDate } from '@/lib/sales-report';
import { getUtcBoundsForLocalDates } from '@/lib/product-report';
import { createCocktailPerformanceAccumulator } from '@/lib/cocktail-performance';

const LINE_PAGE_SIZE = 2000;
const SESSION_PAGE_SIZE = 500;

export async function GET(request: NextRequest) {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const params = request.nextUrl.searchParams;
    const barId = params.get('barId');
    const startDate = params.get('startDate') ?? '';
    const requestedEndDate = params.get('endDate') ?? '';
    if (!barId) return NextResponse.json({ error: 'barId is required' }, { status: 400 });
    if (!isIsoDate(startDate) || !isIsoDate(requestedEndDate) || startDate > requestedEndDate) {
        return NextResponse.json(
            { error: 'Provide a valid startDate and endDate in YYYY-MM-DD order' },
            { status: 400 },
        );
    }
    if (Date.parse(requestedEndDate) - Date.parse(startDate) > 3660 * 86_400_000) {
        return NextResponse.json({ error: 'Date range cannot exceed 10 years' }, { status: 400 });
    }

    let categories: (string | null)[] | null;
    try {
        const categoryInput: unknown = params.has('categories')
            ? JSON.parse(params.get('categories')!)
            : null;
        if (
            params.has('categories') &&
            (!Array.isArray(categoryInput) ||
                categoryInput.length > 100 ||
                !categoryInput.every(
                    (value) => value === null || (typeof value === 'string' && value.length <= 500),
                ))
        ) {
            throw new Error('Invalid selections');
        }
        categories = categoryInput === null ? null : [...new Set(categoryInput as (string | null)[])];
    } catch {
        return NextResponse.json(
            { error: 'categories must be a valid selection array' },
            { status: 400 },
        );
    }

    const bar = await prisma.bar.findUnique({ where: { id: barId }, select: { timezone: true } });
    if (!bar) return NextResponse.json({ error: 'Bar not found' }, { status: 404 });
    const timezone = bar.timezone || 'Europe/Madrid';
    const now = new Date();
    const today = dateInTimezone(now, timezone);
    const endDate = requestedEndDate > today ? today : requestedEndDate;
    const bounds = getUtcBoundsForLocalDates(startDate, endDate, timezone);
    const accumulator = createCocktailPerformanceAccumulator(categories, bounds);

    let lineCursor: string | undefined;
    for (; ;) {
        const page = await prisma.orderLine.findMany({
            where: {
                voidedAt: null,
                settledAt: { lte: now },
                session: { is: { barId, reversedAt: null } },
            },
            orderBy: [{ settledAt: 'asc' }, { id: 'asc' }],
            take: LINE_PAGE_SIZE,
            ...(lineCursor ? { cursor: { id: lineCursor }, skip: 1 } : {}),
            select: {
                id: true,
                menuItemId: true,
                nameAtSale: true,
                categoryNameAtSale: true,
                createdAt: true,
                settledAt: true,
                currencyAtSale: true,
                unitPriceAmountMinor: true,
                discountAmountMinor: true,
                taxRateBpsAtSale: true,
                taxIncludedAtSale: true,
            },
        });
        page.forEach(accumulator.addSalesLine);
        if (page.length < LINE_PAGE_SIZE) break;
        lineCursor = page[page.length - 1].id;
    }

    let sessionCursor: string | undefined;
    for (; ;) {
        const page = await prisma.orderSession.findMany({
            where: { barId, status: 'CLOSED', reversedAt: null, closedAt: { lte: now } },
            orderBy: [{ closedAt: 'asc' }, { id: 'asc' }],
            take: SESSION_PAGE_SIZE,
            ...(sessionCursor ? { cursor: { id: sessionCursor }, skip: 1 } : {}),
            select: {
                id: true,
                openedAt: true,
                closedAt: true,
                status: true,
                lines: {
                    where: { voidedAt: null },
                    select: { menuItemId: true, nameAtSale: true, categoryNameAtSale: true, createdAt: true },
                },
            },
        });
        page.forEach(accumulator.addSession);
        if (page.length < SESSION_PAGE_SIZE) break;
        sessionCursor = page[page.length - 1].id;
    }

    const catalog = await prisma.menuItem.findMany({
        where: { barId, deletedAt: null },
        select: { id: true, name: true, category: { select: { name: true } } },
    });
    for (const item of catalog) {
        accumulator.observe({
            menuItemId: item.id,
            nameAtSale: item.name,
            categoryNameAtSale: item.category?.name ?? null,
        });
    }
    const data = accumulator.finish();
    if (categories?.some((category) => !data.categories.includes(category))) {
        return NextResponse.json(
            { error: 'A selected cocktail category is not available for this bar' },
            { status: 400 },
        );
    }
    if (data.currencies.length > 1) {
        return NextResponse.json(
            {
                error:
                    'Selected cocktails have multiple currencies; combined sales rankings are unavailable',
            },
            { status: 422 },
        );
    }
    return NextResponse.json({ barId, timezone, startDate, endDate, ...data });
}
