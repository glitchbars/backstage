export type SalesGrouping = 'day' | 'week' | 'fortnight' | 'month' | 'year';
export type PeriodPreset =
    | 'today'
    | 'yesterday'
    | 'this-week'
    | 'last-week'
    | 'this-month'
    | 'last-month'
    | 'this-year'
    | 'last-year'
    | 'custom';
export type ComparisonPreset = 'previous-period' | 'previous-year';

export const SUMUP_SOURCE_END_DATE = '2026-10-04';
export const FLOPI_SOURCE_START_DATE = '2026-10-05';

export interface DateRange {
    startDate: string;
    endDate: string;
}

export function capDateRangeAt(range: DateRange, currentDate: string): DateRange | null {
    if (range.startDate > currentDate) return null;
    return {
        startDate: range.startDate,
        endDate: range.endDate > currentDate ? currentDate : range.endDate,
    };
}

export interface SalesDayRecord {
    date: Date | string;
    salesInclTaxMinor: number;
    salesExclTaxMinor: number;
    customers: number;
}

export interface TillRecord {
    createdAt: Date | string;
    totalCash: number;
    totalCard: number;
    customerCount: number;
}

export interface BucketRange {
    startDate: string;
    rangeStartDate: string;
    rangeEndDate: string;
}

export interface SalesBucket extends BucketRange {
    salesInclTaxMinor: number;
    salesExclTaxMinor: number;
    customers: number;
    averageSpendMinor: number | null;
    daysWithData: number;
    hasData: boolean;
}

export interface TillBucket extends BucketRange {
    totalCash: number;
    totalCard: number;
    total: number;
    tillCount: number;
    customerCount: number;
    hasData: boolean;
}

export interface ReportTotals {
    salesInclTaxMinor: number;
    salesExclTaxMinor: number;
    customers: number;
    tillTotalMinor: number;
    tillCount: number;
    totalInclTaxMinor: number;
    customerCount: number;
}

const DAY_MS = 86_400_000;
const FORTNIGHT_ANCHOR = Date.UTC(2024, 11, 30);

export function isIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateAtUtcMidnight(value: string | Date): Date {
    if (value instanceof Date) {
        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }
    return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function shiftIsoDate(value: string, days: number): string {
    const date = dateAtUtcMidnight(value);
    date.setUTCDate(date.getUTCDate() + days);
    return toIsoDate(date);
}

function monthRange(value: string, offset: number): DateRange {
    const date = dateAtUtcMidnight(value);
    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
    return { startDate: toIsoDate(monthStart), endDate: toIsoDate(monthEnd) };
}

function yearRange(value: string, offset: number): DateRange {
    const year = dateAtUtcMidnight(value).getUTCFullYear() + offset;
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

export function getPeriodDateRange(preset: Exclude<PeriodPreset, 'custom'>, today: string): DateRange {
    const date = dateAtUtcMidnight(today);
    const weekdayOffset = (date.getUTCDay() + 6) % 7;
    const thisWeekStart = shiftIsoDate(today, -weekdayOffset);

    switch (preset) {
        case 'today':
            return { startDate: today, endDate: today };
        case 'yesterday': {
            const yesterday = shiftIsoDate(today, -1);
            return { startDate: yesterday, endDate: yesterday };
        }
        case 'this-week':
            return { startDate: thisWeekStart, endDate: shiftIsoDate(thisWeekStart, 6) };
        case 'last-week': {
            const lastWeekStart = shiftIsoDate(thisWeekStart, -7);
            return { startDate: lastWeekStart, endDate: shiftIsoDate(lastWeekStart, 6) };
        }
        case 'this-month':
            return monthRange(today, 0);
        case 'last-month':
            return monthRange(today, -1);
        case 'this-year':
            return yearRange(today, 0);
        case 'last-year':
            return yearRange(today, -1);
    }
}

export function getPreviousDateRange(preset: PeriodPreset, range: DateRange): DateRange {
    if (preset === 'this-week' || preset === 'last-week') {
        return { startDate: shiftIsoDate(range.startDate, -7), endDate: shiftIsoDate(range.endDate, -7) };
    }
    if (preset === 'this-month' || preset === 'last-month') return monthRange(range.startDate, -1);
    if (preset === 'this-year' || preset === 'last-year') return yearRange(range.startDate, -1);

    if (preset === 'today' || preset === 'yesterday') {
        const previous = shiftIsoDate(range.startDate, -1);
        return { startDate: previous, endDate: previous };
    }

    const duration =
        (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) /
        DAY_MS +
        1;
    const endDate = shiftIsoDate(range.startDate, -1);
    return { startDate: shiftIsoDate(endDate, -(duration - 1)), endDate };
}

function shiftIsoDateYear(value: string, years: number): string {
    const date = dateAtUtcMidnight(value);
    const year = date.getUTCFullYear() + years;
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return toIsoDate(new Date(Date.UTC(year, month, Math.min(day, maxDay))));
}

export function getPreviousYearDateRange(range: DateRange): DateRange {
    return {
        startDate: shiftIsoDateYear(range.startDate, -1),
        endDate: shiftIsoDateYear(range.endDate, -1),
    };
}

function bucketStart(date: Date, grouping: SalesGrouping): Date {
    const start = new Date(date);
    if (grouping === 'day') return start;
    if (grouping === 'week') {
        start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
        return start;
    }
    if (grouping === 'fortnight') {
        const offset = Math.floor((start.getTime() - FORTNIGHT_ANCHOR) / (14 * DAY_MS));
        return new Date(FORTNIGHT_ANCHOR + offset * 14 * DAY_MS);
    }
    if (grouping === 'month') {
        start.setUTCDate(1);
        return start;
    }
    start.setUTCMonth(0, 1);
    return start;
}

function nextBucketStart(date: Date, grouping: SalesGrouping): Date {
    const next = new Date(date);
    if (grouping === 'day') next.setUTCDate(next.getUTCDate() + 1);
    else if (grouping === 'week') next.setUTCDate(next.getUTCDate() + 7);
    else if (grouping === 'fortnight') next.setUTCDate(next.getUTCDate() + 14);
    else if (grouping === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
    else next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
}

function enumerateBucketRanges(
    startDate: string,
    endDate: string,
    grouping: SalesGrouping,
): BucketRange[] {
    const ranges: BucketRange[] = [];
    const requestedEnd = dateAtUtcMidnight(endDate);
    for (
        let start = bucketStart(dateAtUtcMidnight(startDate), grouping);
        start <= requestedEnd;
        start = nextBucketStart(start, grouping)
    ) {
        const periodEnd = new Date(nextBucketStart(start, grouping).getTime() - DAY_MS);
        const periodStartDate = toIsoDate(start);
        const periodEndDate = toIsoDate(periodEnd);
        ranges.push({
            startDate: periodStartDate,
            rangeStartDate: periodStartDate < startDate ? startDate : periodStartDate,
            rangeEndDate: periodEndDate > endDate ? endDate : periodEndDate,
        });
    }
    return ranges;
}

export function dateInTimezone(value: Date | string, timezone: string): string {
    const date = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
}

export function buildSalesBuckets(
    rows: SalesDayRecord[],
    startDate: string,
    endDate: string,
    grouping: SalesGrouping,
): SalesBucket[] {
    const totals = new Map<string, {
        salesInclTaxMinor: number;
        salesExclTaxMinor: number;
        customers: number;
        daysWithData: number;
    }>();

    for (const row of rows) {
        const rowDate = toIsoDate(dateAtUtcMidnight(row.date));
        if (rowDate < startDate || rowDate > endDate || rowDate >= FLOPI_SOURCE_START_DATE) continue;
        const date = dateAtUtcMidnight(rowDate);
        const key = toIsoDate(bucketStart(date, grouping));
        const total = totals.get(key) ?? {
            salesInclTaxMinor: 0,
            salesExclTaxMinor: 0,
            customers: 0,
            daysWithData: 0,
        };
        total.salesInclTaxMinor += row.salesInclTaxMinor;
        total.salesExclTaxMinor += row.salesExclTaxMinor;
        total.customers += row.customers;
        total.daysWithData += 1;
        totals.set(key, total);
    }

    return enumerateBucketRanges(startDate, endDate, grouping).map((range) => {
        const total = totals.get(range.startDate);
        const salesInclTaxMinor = total?.salesInclTaxMinor ?? 0;
        const customers = total?.customers ?? 0;
        return {
            ...range,
            salesInclTaxMinor,
            salesExclTaxMinor: total?.salesExclTaxMinor ?? 0,
            customers,
            averageSpendMinor: customers > 0 ? Math.round(salesInclTaxMinor / customers) : null,
            daysWithData: total?.daysWithData ?? 0,
            hasData: Boolean(total),
        };
    });
}

export function buildTillBuckets(
    rows: TillRecord[],
    startDate: string,
    endDate: string,
    grouping: SalesGrouping,
    timezone: string,
): TillBucket[] {
    const totals = new Map<string, {
        totalCash: number;
        totalCard: number;
        tillCount: number;
        customerCount: number;
    }>();

    for (const row of rows) {
        const localDate = dateInTimezone(row.createdAt, timezone);
        if (localDate < startDate || localDate > endDate || localDate < FLOPI_SOURCE_START_DATE) continue;
        const key = toIsoDate(bucketStart(dateAtUtcMidnight(localDate), grouping));
        const total = totals.get(key) ?? { totalCash: 0, totalCard: 0, tillCount: 0, customerCount: 0 };
        total.totalCash += row.totalCash;
        total.totalCard += row.totalCard;
        total.tillCount += 1;
        total.customerCount += row.customerCount;
        totals.set(key, total);
    }

    return enumerateBucketRanges(startDate, endDate, grouping).map((range) => {
        const total = totals.get(range.startDate);
        const totalCash = total?.totalCash ?? 0;
        const totalCard = total?.totalCard ?? 0;
        return {
            ...range,
            totalCash,
            totalCard,
            total: totalCash + totalCard,
            tillCount: total?.tillCount ?? 0,
            customerCount: total?.customerCount ?? 0,
            hasData: Boolean(total),
        };
    });
}

export function summarizeReportTotals(sales: SalesBucket[], tills: TillBucket[]): ReportTotals {
    const salesInclTaxMinor = sales.reduce((total, bucket) => total + bucket.salesInclTaxMinor, 0);
    const customers = sales.reduce((total, bucket) => total + bucket.customers, 0);
    const tillTotalMinor = tills.reduce((total, bucket) => total + bucket.total, 0);
    return {
        salesInclTaxMinor,
        salesExclTaxMinor: sales.reduce((total, bucket) => total + bucket.salesExclTaxMinor, 0),
        customers,
        tillTotalMinor,
        tillCount: tills.reduce((total, bucket) => total + bucket.tillCount, 0),
        totalInclTaxMinor: salesInclTaxMinor + tillTotalMinor,
        customerCount: customers + tills.reduce((total, bucket) => total + bucket.customerCount, 0),
    };
}