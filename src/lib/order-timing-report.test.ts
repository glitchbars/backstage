import { describe, expect, it } from 'vitest';
import { aggregateOrderTiming } from './order-timing-report';

describe('aggregateOrderTiming', () => {
    it('buckets order openings and drink additions at their own local times', () => {
        const report = aggregateOrderTiming(
            [{ id: 'session-1', openedAt: '2026-10-10T18:00:00.000Z' }],
            [
                {
                    orderSessionId: 'session-1',
                    createdAt: '2026-10-10T21:00:00.000Z',
                    menuItemId: 'drink-1',
                    nameAtSale: 'Spritz',
                    categoryNameAtSale: 'Cocktails',
                },
            ],
            'Europe/Madrid',
            '2026-10-10',
            '2026-10-10',
            '2026-10-10',
            '2026-10-10',
        );

        expect(report.sessionOpenings[20].count).toBe(1);
        expect(report.drinkOrders[23].count).toBe(1);
        expect(report.weekdayHours[5 * 24 + 20].sessionCount).toBe(1);
        expect(report.weekdayHours[5 * 24 + 23].itemCount).toBe(1);
        expect(report.drinks[0]).toMatchObject({
            name: 'Spritz',
            quantity: 1,
            peakHours: [23],
            hourlyPercentages: expect.arrayContaining([100]),
        });
    });

    it('groups snapshot-only drinks and keeps peak-hour ties', () => {
        const report = aggregateOrderTiming(
            [],
            [
                {
                    orderSessionId: 's1',
                    createdAt: '2026-10-09T09:00:00Z',
                    menuItemId: null,
                    nameAtSale: 'House Soda',
                    categoryNameAtSale: null,
                },
                {
                    orderSessionId: 's2',
                    createdAt: '2026-10-09T21:00:00Z',
                    menuItemId: null,
                    nameAtSale: 'House Soda',
                    categoryNameAtSale: null,
                },
            ],
            'UTC',
            '2026-10-09',
            '2026-10-09',
            '2026-10-09',
            '2026-10-09',
        );

        expect(report.drinks).toHaveLength(1);
        expect(report.drinks[0].peakHours).toEqual([9, 21]);
        expect(report.totals).toMatchObject({ sessions: 0, items: 2, products: 1 });
    });

    it('uses available coverage for empty ranges', () => {
        const report = aggregateOrderTiming(
            [],
            [],
            'UTC',
            '2024-01-01',
            '2026-10-10',
            '2024-01-01',
            '2026-10-10',
        );

        expect(report.startDate).toBe('2024-01-01');
        expect(report.endDate).toBe('2026-10-10');
        expect(report.drinks).toEqual([]);
    });
});
