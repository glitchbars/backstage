export interface OrderSessionTimingRecord {
    id: string;
    openedAt: Date | string;
}

export interface OrderLineTimingRecord {
    orderSessionId: string;
    createdAt: Date | string;
    menuItemId: string | null;
    nameAtSale: string;
    categoryNameAtSale: string | null;
}

export interface HourBucket {
    hour: number;
    count: number;
}

export interface WeekdayHourBucket {
    weekday: number;
    hour: number;
    sessionCount: number;
    itemCount: number;
}

export interface DrinkTimingRow {
    key: string;
    menuItemId: string | null;
    name: string;
    category: string | null;
    quantity: number;
    peakHours: number[];
    hourlyCounts: number[];
    hourlyPercentages: number[];
}

export interface OrderTimingReport {
    timezone: string;
    startDate: string;
    endDate: string;
    availableFrom: string | null;
    availableThrough: string | null;
    sessionOpenings: HourBucket[];
    drinkOrders: HourBucket[];
    weekdayHours: WeekdayHourBucket[];
    drinks: DrinkTimingRow[];
    totals: {
        sessions: number;
        items: number;
        products: number;
    };
}

export interface OrderTimingAccumulator {
    addSession(session: OrderSessionTimingRecord): void;
    addLine(line: OrderLineTimingRecord): void;
    finish(
        startDate: string,
        endDate: string,
        availableFrom: string | null,
        availableThrough: string | null,
    ): OrderTimingReport;
}

function timestampParts(
    value: Date | string,
    timezone: string,
): { date: string; hour: number; weekday: number } {
    const timestamp = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(timestamp);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value ?? '';
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(part('weekday'));

    return {
        date: `${part('year')}-${part('month')}-${part('day')}`,
        hour: Number(part('hour')),
        weekday,
    };
}

function emptyHours(): number[] {
    return Array.from({ length: 24 }, () => 0);
}

export function createOrderTimingAccumulator(timezone: string): OrderTimingAccumulator {
    const sessionOpenings = emptyHours();
    const drinkOrders = emptyHours();
    const weekdayHours = Array.from({ length: 7 * 24 }, (_, index) => ({
        weekday: Math.floor(index / 24),
        hour: index % 24,
        sessionCount: 0,
        itemCount: 0,
    }));
    const drinks = new Map<string, Omit<DrinkTimingRow, 'peakHours' | 'hourlyPercentages'>>();
    let sessionCount = 0;
    let itemCount = 0;

    return {
        addSession(session) {
            const parts = timestampParts(session.openedAt, timezone);
            sessionOpenings[parts.hour] += 1;
            const bucket = weekdayHours[parts.weekday * 24 + parts.hour];
            bucket.sessionCount += 1;
            sessionCount += 1;
        },

        addLine(line) {
            const parts = timestampParts(line.createdAt, timezone);
            drinkOrders[parts.hour] += 1;
            weekdayHours[parts.weekday * 24 + parts.hour].itemCount += 1;
            itemCount += 1;

            const key = line.menuItemId
                ? `menu:${line.menuItemId}`
                : `snapshot:${line.nameAtSale}\u0000${line.categoryNameAtSale ?? ''}`;
            const drink = drinks.get(key) ?? {
                key,
                menuItemId: line.menuItemId,
                name: line.nameAtSale,
                category: line.categoryNameAtSale,
                quantity: 0,
                hourlyCounts: emptyHours(),
            };
            drink.quantity += 1;
            drink.hourlyCounts[parts.hour] += 1;
            drinks.set(key, drink);
        },

        finish(startDate, endDate, availableFrom, availableThrough) {
            const drinkRows = [...drinks.values()]
                .map((drink) => {
                    const peakCount = Math.max(...drink.hourlyCounts);
                    return {
                        ...drink,
                        peakHours: drink.hourlyCounts.flatMap((count, hour) =>
                            count === peakCount ? [hour] : [],
                        ),
                        hourlyPercentages: drink.hourlyCounts.map((count) => (count / drink.quantity) * 100),
                    };
                })
                .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));

            return {
                timezone,
                startDate,
                endDate,
                availableFrom,
                availableThrough,
                sessionOpenings: sessionOpenings.map((count, hour) => ({ hour, count })),
                drinkOrders: drinkOrders.map((count, hour) => ({ hour, count })),
                weekdayHours,
                drinks: drinkRows,
                totals: {
                    sessions: sessionCount,
                    items: itemCount,
                    products: drinkRows.length,
                },
            };
        },
    };
}

export function aggregateOrderTiming(
    sessions: OrderSessionTimingRecord[],
    lines: OrderLineTimingRecord[],
    timezone: string,
    startDate: string,
    endDate: string,
    availableFrom: string | null,
    availableThrough: string | null,
): OrderTimingReport {
    const accumulator = createOrderTimingAccumulator(timezone);
    sessions.forEach((session) => accumulator.addSession(session));
    lines.forEach((line) => accumulator.addLine(line));
    return accumulator.finish(startDate, endDate, availableFrom, availableThrough);
}
