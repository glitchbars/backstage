import { describe, expect, it } from 'vitest';
import {
    createCocktailPerformanceAccumulator,
    type PerformanceLine,
    type PerformanceSession,
    isComparisonBeer,
} from './cocktail-performance';

const date = (minutes: number) => new Date(Date.UTC(2026, 9, 22, 18) + minutes * 60_000);
function line(id = 'margarita', minutes = 0): PerformanceLine {
    return {
        menuItemId: id,
        nameAtSale: id === 'beer' ? 'Caña Estrella' : id,
        categoryNameAtSale: id === 'beer' ? 'Beer' : 'Cocktails',
        createdAt: date(minutes),
        settledAt: date(30),
        currencyAtSale: 'EUR',
        unitPriceAmountMinor: 1000,
        discountAmountMinor: 100,
        taxRateBpsAtSale: 1000,
        taxIncludedAtSale: true,
    };
}
function session(lines: PerformanceLine[], duration = 30): PerformanceSession {
    return { openedAt: date(0), closedAt: date(duration), status: 'CLOSED', lines };
}
function accumulator() {
    return createCocktailPerformanceAccumulator(['Cocktails'], {
        start: date(10),
        endExclusive: date(60),
    });
}

describe('cocktail performance', () => {
    it('includes short and exactly ten-minute orders but excludes open and reversed orders', () => {
        const report = accumulator();
        for (const duration of [9.9, 10, 10.1])
            report.addSession(session([line(), line('margarita', 5)], duration));
        report.addSession({ ...session([line()]), closedAt: null, status: 'OPEN' });
        report.addSession({ ...session([line()]), reversedAt: date(40) });
        expect(report.finish().products[0].period).toMatchObject({
            eligibleOrders: 2,
            repeatOrders: 2,
            repeatRate: 100,
        });
        expect(report.finish().products[0].allTime.eligibleOrders).toBe(3);
    });

    it('counts each cocktail once per order, using strictly later timestamps, not quantities or other cocktails', () => {
        const report = accumulator();
        report.addSession(session([line(), line(), line('mojito', 5)]));
        report.addSession(session([line(), line('margarita', 5), line('margarita', 8)]));
        report.addSession(session([line()]));
        const margarita = report.finish().products.find((product) => product.name === 'margarita')!;
        expect(margarita.period).toMatchObject({
            eligibleOrders: 3,
            repeatOrders: 1,
            repeatCount: 2,
            repeatDistribution: [
                { repeats: 0, orders: 2 },
                { repeats: 2, orders: 1 },
            ],
        });
        expect(margarita.period.repeatRate).toBeCloseTo(100 / 3);
    });

    it('counts any later selected beer, allowing intervening items, but not beer first or at the same time', () => {
        const report = accumulator();
        report.addSession(session([line('beer', 0), line('margarita', 5)]));
        report.addSession(session([line(), line('beer', 0)]));
        report.addSession(session([line(), line('mojito', 5), line('beer', 8), line('beer', 9)]));
        const products = report.finish().products;
        expect(products.find((product) => product.name === 'margarita')!.period).toMatchObject({
            eligibleOrders: 3,
            beerOrders: 1,
        });
        expect(products.find((product) => product.name === 'mojito')!.period.beerOrders).toBe(1);
    });

    it('excludes voided items and isolates sessions', () => {
        const report = accumulator();
        report.addSession(
            session([
                line(),
                { ...line('margarita', 5), voidedAt: date(8) },
                { ...line('beer', 9), voidedAt: date(10) },
            ]),
        );
        report.addSession(session([line('margarita', 9)]));
        expect(report.finish().products[0].period).toMatchObject({
            eligibleOrders: 2,
            repeatOrders: 0,
            beerOrders: 0,
        });
    });

    it('uses complete order history and closing date, independently of sale settlement date', () => {
        const report = accumulator();
        const sale = { ...line(), settledAt: date(5) };
        report.addSalesLine(sale);
        report.addSession(session([sale, line('margarita', 15)]));
        report.addSession({ ...session([line(), line('margarita', 5)]), closedAt: date(65) });
        const product = report.finish().products[0];
        expect(product.period).toMatchObject({
            quantity: 0,
            eligibleOrders: 1,
            repeatOrders: 1,
            quantityRank: null,
        });
        expect(product.allTime).toMatchObject({
            quantity: 1,
            eligibleOrders: 2,
            repeatOrders: 2,
            salesInclTaxMinor: 900,
            salesExclTaxMinor: 818,
        });
    });

    it('preserves historical products, ranks ties, and has null rates without eligible orders', () => {
        const report = accumulator();
        for (const id of ['margarita', 'mojito']) {
            report.addSalesLine(line(id));
            report.addSalesLine(line(id));
        }
        report.addSalesLine({ ...line('old'), menuItemId: null });
        report.observe({ menuItemId: 'unsold', nameAtSale: 'Unsold', categoryNameAtSale: 'Cocktails' });
        const data = report.finish();
        expect(data.products.map((product) => [product.name, product.period.quantityRank])).toEqual([
            ['margarita', 1],
            ['mojito', 1],
            ['old', 3],
            ['Unsold', null],
        ]);
        expect(data.products[0].period.repeatRate).toBeNull();
        expect(data.choices.some((choice) => choice.key.startsWith('snapshot:'))).toBe(true);
    });

    it('returns choices but no inferred cocktail results without category selections', () => {
        const report = createCocktailPerformanceAccumulator([], {
            start: date(0),
            endExclusive: date(60),
        });
        report.addSalesLine(line());
        expect(report.finish()).toMatchObject({ products: [], categories: ['Cocktails'] });
    });

    it('matches only Caña Estella / Estrella, not other beers', () => {
        expect(isComparisonBeer('  CAÑA Estella  ')).toBe(true);
        expect(isComparisonBeer('Caña Estrella')).toBe(true);
        for (const name of ['Estrella bottle', 'Caña', 'Caña IPA', 'Lager'])
            expect(isComparisonBeer(name)).toBe(false);
        const report = accumulator();
        report.addSession(session([line(), { ...line('lager', 5), categoryNameAtSale: 'Beer' }]));
        expect(report.finish().products[0].period.beerOrders).toBe(0);
        expect(report.finish().combos).toEqual([]);
    });

    it('separates extra units from repeat rounds', () => {
        const report = accumulator();
        report.addSession(
            session([line(), line(), line('margarita', 5), line('margarita', 5), line('margarita', 8)]),
        );
        report.addSession(session([line(), line('margarita', 5)]));
        expect(report.finish().products[0].period).toMatchObject({
            repeatCount: 4,
            repeatRounds: 3,
            repeatOrders: 2,
            repeatDistribution: [
                { repeats: 1, orders: 1 },
                { repeats: 2, orders: 1 },
            ],
        });
    });

    it('ranks distinct drink pairs once per order regardless of quantity or sequence', () => {
        const report = accumulator();
        report.addSession(
            session([
                line(),
                line('mojito', 0),
                line('beer', 5),
                line('mojito', 8),
                { ...line('food', 2), categoryNameAtSale: 'Food' },
            ]),
        );
        report.addSession(session([line('beer', 0), line('margarita', 5)]));
        report.addSession({ ...session([line(), line('mojito', 5)]), closedAt: date(65) });
        const data = report.finish();
        expect(data.cocktailOrders).toEqual({ period: 2, allTime: 3 });
        expect(data.combos).toHaveLength(3);
        expect(data.combos[0].drinks.map((drink) => drink.name)).toEqual([
            'Caña Estrella',
            'margarita',
        ]);
        expect(data.combos[0].period).toEqual({ orders: 2, share: 100 });
        const cocktails = data.combos.find((combo) =>
            combo.drinks.every((drink) => drink.category === 'Cocktails'),
        )!;
        expect(cocktails.period.orders).toBe(1);
        expect(cocktails.allTime.orders).toBe(2);
    });

    it('automatically selects cocktail categories when no override is supplied', () => {
        const report = createCocktailPerformanceAccumulator(null, {
            start: date(0),
            endExclusive: date(60),
        });
        report.addSalesLine({ ...line(), categoryNameAtSale: 'CÓCTELES AUTOR' });
        report.addSalesLine(line('beer'));
        expect(report.finish().selectedCategories).toEqual(['CÓCTELES AUTOR']);
        expect(report.finish().products).toHaveLength(1);
    });

    it('counts eight identical cocktails added together as an initial round, not seven repeats', () => {
        const report = accumulator();
        const firstRound = Array.from({ length: 8 }, (_, index) => line('margarita', index / 60));
        report.addSession(session(firstRound));
        expect(report.finish().products[0].period).toMatchObject({
            eligibleOrders: 1,
            repeatOrders: 0,
            repeatRounds: 0,
            repeatCount: 0,
            repeatDistribution: [{ repeats: 0, orders: 1 }],
        });
    });

    it('counts another eight later as one repeat round and eight extra cocktails', () => {
        const report = accumulator();
        const rounds = [0, 5].flatMap((minutes) =>
            Array.from({ length: 8 }, (_, index) => line('margarita', minutes + index / 60)),
        );
        report.addSession(session(rounds.reverse()));
        expect(report.finish().products[0].period).toMatchObject({
            eligibleOrders: 1,
            repeatOrders: 1,
            repeatRounds: 1,
            repeatCount: 8,
            repeatDistribution: [{ repeats: 1, orders: 1 }],
        });
    });

    it('anchors the inclusive one-minute window to each round start, not the previous item', () => {
        const report = accumulator();
        report.addSession(
            session([
                line(),
                line('margarita', 1),
                line('margarita', 1 + 1 / 60_000),
                line('margarita', 2),
            ]),
        );
        expect(report.finish().products[0].period).toMatchObject({
            repeatRounds: 1,
            repeatCount: 2,
            repeatDistribution: [{ repeats: 1, orders: 1 }],
        });
    });
});
