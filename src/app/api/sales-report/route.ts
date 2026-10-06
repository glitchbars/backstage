import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';
import {
    buildSalesBuckets,
    buildTillBuckets,
    FLOPI_SOURCE_START_DATE,
    isIsoDate,
    type SalesGrouping,
    type SalesDayRecord,
    type TillRecord,
} from '@/lib/sales-report';

const GROUPINGS = new Set<SalesGrouping>(['day', 'week', 'fortnight', 'month', 'year']);
const MAX_RANGE_DAYS = 3660;
const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const params = request.nextUrl.searchParams;
    const barId = params.get('barId');
    const startDate = params.get('startDate') ?? '';
    const endDate = params.get('endDate') ?? '';
    const grouping = params.get('grouping') ?? 'day';
    const previousStartDate = params.get('previousStartDate');
    const previousEndDate = params.get('previousEndDate');

    if (!barId) return NextResponse.json({ error: 'barId is required' }, { status: 400 });
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
        return NextResponse.json({ error: 'startDate and endDate must be valid YYYY-MM-DD dates' }, { status: 400 });
    }
    if (startDate > endDate) {
        return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 });
    }
    if (!GROUPINGS.has(grouping as SalesGrouping)) {
        return NextResponse.json({ error: 'grouping must be day, week, fortnight, month, or year' }, { status: 400 });
    }
    if (Boolean(previousStartDate) !== Boolean(previousEndDate)) {
        return NextResponse.json({ error: 'Both previous period dates are required' }, { status: 400 });
    }
    if (previousStartDate && previousEndDate) {
        if (!isIsoDate(previousStartDate) || !isIsoDate(previousEndDate) || previousStartDate > previousEndDate) {
            return NextResponse.json({ error: 'Previous period dates must be a valid ordered date range' }, { status: 400 });
        }
        const previousDays =
            (Date.parse(`${previousEndDate}T00:00:00Z`) - Date.parse(`${previousStartDate}T00:00:00Z`)) /
            86_400_000;
        if (previousDays > MAX_RANGE_DAYS) {
            return NextResponse.json({ error: 'Previous period cannot exceed 10 years' }, { status: 400 });
        }
    }
    const rangeDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
    if (rangeDays > MAX_RANGE_DAYS) {
        return NextResponse.json({ error: 'Date range cannot exceed 10 years' }, { status: 400 });
    }

    const queryStartDate = previousStartDate && previousStartDate < startDate ? previousStartDate : startDate;
    const queryEndDate = previousEndDate && previousEndDate > endDate ? previousEndDate : endDate;
    const start = Date.parse(`${queryStartDate}T00:00:00.000Z`);
    const end = Date.parse(`${queryEndDate}T00:00:00.000Z`);
    const [rows, latestSale, bar, tills] = await Promise.all([
        prisma.$queryRaw<SalesDayRecord[]>`
    SELECT \`date\`, salesInclTaxMinor, salesExclTaxMinor, customers
      FROM sales_days
      WHERE barId = ${barId}
        AND \`date\` >= ${new Date(`${queryStartDate}T00:00:00.000Z`)}
        AND \`date\` <= ${new Date(`${queryEndDate}T00:00:00.000Z`)}
        AND \`date\` < ${new Date(`${FLOPI_SOURCE_START_DATE}T00:00:00.000Z`)}
      ORDER BY \`date\` ASC
    `,
        prisma.orderLine.findFirst({
            where: { barId },
            orderBy: { createdAt: 'desc' },
            select: { currencyAtSale: true },
        }),
        prisma.bar.findUnique({ where: { id: barId }, select: { timezone: true } }),
        prisma.dailyTill.findMany({
            where: {
                barId,
                open: false,
                createdAt: {
                    gte: new Date(start - DAY_MS),
                    lt: new Date(end + 2 * DAY_MS),
                },
            },
            orderBy: { createdAt: 'asc' },
            select: {
                createdAt: true,
                totalCash: true,
                totalCard: true,
                closedOrders: {
                    where: { reversedAt: null },
                    select: { customerCount: true },
                },
            },
        }),
    ]);

    if (!bar) return NextResponse.json({ error: 'Bar not found' }, { status: 404 });
    const timezone = bar.timezone || 'Europe/Madrid';
    const tillRows: TillRecord[] = tills.map((till) => ({
        createdAt: till.createdAt,
        totalCash: till.totalCash,
        totalCard: till.totalCard,
        customerCount: till.closedOrders.reduce((total, order) => total + order.customerCount, 0),
    }));

    return NextResponse.json({
        barId,
        currency: latestSale?.currencyAtSale ?? null,
        timezone,
        startDate,
        endDate,
        grouping,
        buckets: buildSalesBuckets(rows, startDate, endDate, grouping as SalesGrouping),
        tillBuckets: buildTillBuckets(
            tillRows,
            startDate,
            endDate,
            grouping as SalesGrouping,
            timezone,
        ),
        previous: previousStartDate && previousEndDate
            ? {
                startDate: previousStartDate,
                endDate: previousEndDate,
                buckets: buildSalesBuckets(rows, previousStartDate, previousEndDate, grouping as SalesGrouping),
                tillBuckets: buildTillBuckets(
                    tillRows,
                    previousStartDate,
                    previousEndDate,
                    grouping as SalesGrouping,
                    timezone,
                ),
            }
            : null,
    });
}