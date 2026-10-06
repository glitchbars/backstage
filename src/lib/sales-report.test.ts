import { describe, expect, it } from 'vitest';
import {
    buildSalesBuckets,
    buildTillBuckets,
    capDateRangeAt,
    FLOPI_SOURCE_START_DATE,
    getPeriodDateRange,
    getPreviousDateRange,
    getPreviousYearDateRange,
    isIsoDate,
    summarizeReportTotals,
} from './sales-report';

describe('sales report buckets', () => {
    it('validates real ISO calendar dates', () => {
        expect(isIsoDate('2026-02-28')).toBe(true);
        expect(isIsoDate('2026-02-30')).toBe(false);
    });

    it('builds the requested calendar presets', () => {
        expect(getPeriodDateRange('today', '2026-10-06')).toEqual({
            startDate: '2026-10-06',
            endDate: '2026-10-06',
        });
        expect(getPeriodDateRange('yesterday', '2026-10-06')).toEqual({
            startDate: '2026-10-05',
            endDate: '2026-10-05',
        });
        expect(getPeriodDateRange('this-week', '2026-10-06')).toEqual({
            startDate: '2026-10-05',
            endDate: '2026-10-11',
        });
        expect(getPeriodDateRange('last-week', '2026-10-06')).toEqual({
            startDate: '2026-09-28',
            endDate: '2026-10-04',
        });
        expect(getPeriodDateRange('this-month', '2026-10-06')).toEqual({
            startDate: '2026-10-01',
            endDate: '2026-10-31',
        });
        expect(getPeriodDateRange('last-month', '2026-10-06')).toEqual({
            startDate: '2026-09-01',
            endDate: '2026-09-30',
        });
        expect(getPeriodDateRange('this-year', '2026-10-06')).toEqual({
            startDate: '2026-01-01',
            endDate: '2026-12-31',
        });
        expect(getPeriodDateRange('last-year', '2026-10-06')).toEqual({
            startDate: '2025-01-01',
            endDate: '2025-12-31',
        });
    });

    it('calculates the prior calendar month or matching custom duration', () => {
        expect(
            getPreviousDateRange('this-month', {
                startDate: '2026-10-01',
                endDate: '2026-10-31',
            }),
        ).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
        expect(
            getPreviousDateRange('custom', {
                startDate: '2026-10-03',
                endDate: '2026-10-04',
            }),
        ).toEqual({ startDate: '2026-10-01', endDate: '2026-10-02' });
        expect(
            getPreviousYearDateRange({ startDate: '2026-10-01', endDate: '2026-10-31' }),
        ).toEqual({ startDate: '2025-10-01', endDate: '2025-10-31' });
    });

    it('caps future dates at today and returns no range when it starts in the future', () => {
        expect(
            capDateRangeAt(
                { startDate: '2026-10-01', endDate: '2026-10-31' },
                '2026-10-06',
            ),
        ).toEqual({ startDate: '2026-10-01', endDate: '2026-10-06' });
        expect(
            capDateRangeAt(
                { startDate: '2026-10-07', endDate: '2026-10-31' },
                '2026-10-06',
            ),
        ).toBeNull();
        expect(
            capDateRangeAt(
                { startDate: '2026-09-01', endDate: '2026-09-30' },
                '2026-10-06',
            ),
        ).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
    });

    it('switches from SumUp to Flopi on the configured handoff date', () => {
        const sales = buildSalesBuckets(
            [
                { date: '2026-10-04', salesInclTaxMinor: 36950, salesExclTaxMinor: 33598, customers: 2 },
                { date: FLOPI_SOURCE_START_DATE, salesInclTaxMinor: 50000, salesExclTaxMinor: 45000, customers: 5 },
            ],
            '2026-10-04',
            FLOPI_SOURCE_START_DATE,
            'day',
        );
        const tills = buildTillBuckets(
            [
                { createdAt: new Date('2026-10-04T17:00:00.000Z'), totalCash: 500, totalCard: 600, customerCount: 1 },
                { createdAt: new Date('2026-10-05T17:00:00.000Z'), totalCash: 3810, totalCard: 39048, customerCount: 12 },
            ],
            '2026-10-04',
            FLOPI_SOURCE_START_DATE,
            'day',
            'Europe/Madrid',
        );

        expect(sales[0]).toMatchObject({ salesInclTaxMinor: 36950, hasData: true });
        expect(sales[1]).toMatchObject({ salesInclTaxMinor: 0, hasData: false });
        expect(tills[0]).toMatchObject({ total: 0, hasData: false });
        expect(tills[1]).toMatchObject({ total: 42858, hasData: true });
    });

    it('groups weeks from Monday and fills missing weeks', () => {
        const buckets = buildSalesBuckets(
            [{ date: '2026-10-04', salesInclTaxMinor: 36950, salesExclTaxMinor: 33598, customers: 2 }],
            '2026-09-28',
            '2026-10-11',
            'week',
        );

        expect(buckets.map((bucket) => bucket.startDate)).toEqual(['2026-09-28', '2026-10-05']);
        expect(buckets[0]).toMatchObject({ hasData: true, salesInclTaxMinor: 36950, customers: 2 });
        expect(buckets[1]).toMatchObject({ hasData: false, daysWithData: 0 });
    });

    it('clips grouped labels to the selected range', () => {
        const [bucket] = buildSalesBuckets(
            [{ date: '2026-10-04', salesInclTaxMinor: 36950, salesExclTaxMinor: 33598, customers: 2 }],
            '2026-10-03',
            '2026-10-04',
            'week',
        );

        expect(bucket).toMatchObject({
            startDate: '2026-09-28',
            rangeStartDate: '2026-10-03',
            rangeEndDate: '2026-10-04',
        });
    });

    it('excludes sales rows outside the selected range', () => {
        const buckets = buildSalesBuckets(
            [
                { date: '2026-10-01', salesInclTaxMinor: 17380, salesExclTaxMinor: 15800, customers: 19 },
                { date: '2026-10-04', salesInclTaxMinor: 36950, salesExclTaxMinor: 33598, customers: 2 },
            ],
            '2026-10-04',
            '2026-10-04',
            'day',
        );

        expect(buckets).toHaveLength(1);
        expect(buckets[0]).toMatchObject({
            startDate: '2026-10-04',
            salesInclTaxMinor: 36950,
            customers: 2,
        });
    });

    it('groups consecutive fortnights from the ISO week 1 anchor', () => {
        const buckets = buildSalesBuckets(
            [{ date: '2026-01-05', salesInclTaxMinor: 100, salesExclTaxMinor: 90, customers: 1 }],
            '2025-12-29',
            '2026-01-11',
            'fortnight',
        );

        expect(buckets).toHaveLength(1);
        expect(buckets[0]).toMatchObject({ startDate: '2025-12-29', hasData: true });
    });

    it('aggregates monthly gross sales and derives average spend', () => {
        const buckets = buildSalesBuckets(
            [
                { date: '2026-10-01', salesInclTaxMinor: 17380, salesExclTaxMinor: 15800, customers: 19 },
                { date: '2026-10-04', salesInclTaxMinor: 36950, salesExclTaxMinor: 33598, customers: 2 },
            ],
            '2026-10-01',
            '2026-11-01',
            'month',
        );

        expect(buckets).toHaveLength(2);
        expect(buckets[0]).toMatchObject({
            startDate: '2026-10-01',
            salesInclTaxMinor: 54330,
            customers: 21,
            averageSpendMinor: 2587,
            daysWithData: 2,
            hasData: true,
        });
        expect(buckets[1]).toMatchObject({ startDate: '2026-11-01', hasData: false });
    });

    it('groups closed Flopi tills by the bar-local date', () => {
        const [bucket] = buildTillBuckets(
            [
                {
                    createdAt: new Date('2026-10-05T17:19:26.366Z'),
                    totalCash: 3810,
                    totalCard: 39048,
                    customerCount: 12,
                },
                {
                    createdAt: new Date('2026-10-05T22:30:00.000Z'),
                    totalCash: 500,
                    totalCard: 600,
                    customerCount: 2,
                },
            ],
            '2026-10-05',
            '2026-10-05',
            'day',
            'Europe/Madrid',
        );

        expect(bucket).toMatchObject({
            startDate: '2026-10-05',
            totalCash: 3810,
            totalCard: 39048,
            total: 42858,
            tillCount: 1,
        });
    });

    it('summarizes the selected and previous periods as totals', () => {
        const sales = buildSalesBuckets(
            [
                { date: '2026-10-01', salesInclTaxMinor: 17380, salesExclTaxMinor: 15800, customers: 19 },
                { date: '2026-10-04', salesInclTaxMinor: 36950, salesExclTaxMinor: 33598, customers: 2 },
            ],
            '2026-10-01',
            '2026-10-04',
            'day',
        );
        const tills = buildTillBuckets(
            [{ createdAt: new Date('2026-10-05T17:19:26.366Z'), totalCash: 3810, totalCard: 39048, customerCount: 12 }],
            '2026-10-05',
            '2026-10-05',
            'day',
            'Europe/Madrid',
        );

        expect(summarizeReportTotals(sales, tills)).toEqual({
            salesInclTaxMinor: 54330,
            salesExclTaxMinor: 49398,
            customers: 21,
            tillTotalMinor: 42858,
            tillCount: 1,
            totalInclTaxMinor: 97188,
            customerCount: 33,
        });
    });
});