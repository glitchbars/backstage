import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';
import { getUtcBoundsForLocalDates } from '@/lib/product-report';
import { dateInTimezone, isIsoDate } from '@/lib/sales-report';
import { createOrderTimingAccumulator } from '@/lib/order-timing-report';

const PAGE_SIZE = 2000;
const MAX_RANGE_DAYS = 3660;
const DAY_MS = 86_400_000;

function earlierDate(dates: (string | null)[]): string | null {
    return dates.filter((date): date is string => date !== null).sort()[0] ?? null;
}

function laterDate(dates: (string | null)[]): string | null {
    return (
        dates
            .filter((date): date is string => date !== null)
            .sort()
            .at(-1) ?? null
    );
}

export async function GET(request: NextRequest) {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const params = request.nextUrl.searchParams;
    const barId = params.get('barId');
    const allTime = params.get('allTime') === 'true';
    const requestedStartDate = params.get('startDate') ?? '';
    const requestedEndDate = params.get('endDate') ?? '';

    if (!barId) return NextResponse.json({ error: 'barId is required' }, { status: 400 });
    if (!allTime && (!isIsoDate(requestedStartDate) || !isIsoDate(requestedEndDate))) {
        return NextResponse.json(
            { error: 'startDate and endDate must be valid YYYY-MM-DD dates' },
            { status: 400 },
        );
    }
    if (!allTime && requestedStartDate > requestedEndDate) {
        return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 });
    }
    if (!allTime) {
        const requestedDays =
            (Date.parse(`${requestedEndDate}T00:00:00Z`) -
                Date.parse(`${requestedStartDate}T00:00:00Z`)) /
            DAY_MS;
        if (requestedDays > MAX_RANGE_DAYS) {
            return NextResponse.json(
                { error: 'Date range cannot exceed 10 years; use allTime=true instead' },
                { status: 400 },
            );
        }
    }

    const bar = await prisma.bar.findUnique({ where: { id: barId }, select: { timezone: true } });
    if (!bar) return NextResponse.json({ error: 'Bar not found' }, { status: 404 });

    const timezone = bar.timezone || 'Europe/Madrid';
    const today = dateInTimezone(new Date(), timezone);
    const sessionCoverageWhere = { barId, reversedAt: null };
    const lineCoverageWhere = { voidedAt: null, session: { is: { barId, reversedAt: null } } };
    const [firstSession, lastSession, firstLine, lastLine] = await Promise.all([
        prisma.orderSession.findFirst({
            where: sessionCoverageWhere,
            orderBy: { openedAt: 'asc' },
            select: { openedAt: true },
        }),
        prisma.orderSession.findFirst({
            where: sessionCoverageWhere,
            orderBy: { openedAt: 'desc' },
            select: { openedAt: true },
        }),
        prisma.orderLine.findFirst({
            where: lineCoverageWhere,
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
        }),
        prisma.orderLine.findFirst({
            where: lineCoverageWhere,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        }),
    ]);
    const availableFrom = earlierDate([
        firstSession ? dateInTimezone(firstSession.openedAt, timezone) : null,
        firstLine ? dateInTimezone(firstLine.createdAt, timezone) : null,
    ]);
    const availableThrough = laterDate([
        lastSession ? dateInTimezone(lastSession.openedAt, timezone) : null,
        lastLine ? dateInTimezone(lastLine.createdAt, timezone) : null,
    ]);

    const startDate = allTime
        ? (availableFrom ?? today)
        : availableFrom && requestedStartDate < availableFrom
            ? availableFrom
            : requestedStartDate;
    const endDate = allTime
        ? availableThrough && availableThrough < today
            ? availableThrough
            : today
        : requestedEndDate < today
            ? requestedEndDate
            : today;
    const accumulator = createOrderTimingAccumulator(timezone);

    if (startDate <= endDate) {
        const bounds = getUtcBoundsForLocalDates(startDate, endDate, timezone);
        let sessionCursor: string | undefined;
        for (; ;) {
            const page = await prisma.orderSession.findMany({
                where: {
                    barId,
                    reversedAt: null,
                    openedAt: { gte: bounds.start, lt: bounds.endExclusive },
                },
                orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
                take: PAGE_SIZE,
                ...(sessionCursor ? { cursor: { id: sessionCursor }, skip: 1 } : {}),
                select: { id: true, openedAt: true },
            });
            page.forEach((session) => accumulator.addSession(session));
            if (page.length < PAGE_SIZE) break;
            sessionCursor = page[page.length - 1].id;
        }

        let lineCursor: string | undefined;
        for (; ;) {
            const page = await prisma.orderLine.findMany({
                where: {
                    voidedAt: null,
                    createdAt: { gte: bounds.start, lt: bounds.endExclusive },
                    session: { is: { barId, reversedAt: null } },
                },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: PAGE_SIZE,
                ...(lineCursor ? { cursor: { id: lineCursor }, skip: 1 } : {}),
                select: {
                    id: true,
                    orderSessionId: true,
                    createdAt: true,
                    menuItemId: true,
                    nameAtSale: true,
                    categoryNameAtSale: true,
                },
            });
            page.forEach((line) => accumulator.addLine(line));
            if (page.length < PAGE_SIZE) break;
            lineCursor = page[page.length - 1].id;
        }
    }

    return NextResponse.json({
        barId,
        ...accumulator.finish(startDate, endDate, availableFrom, availableThrough),
    });
}
