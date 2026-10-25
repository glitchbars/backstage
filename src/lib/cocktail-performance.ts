import { aggregateProductLines, productLineKey, type ProductLineRecord } from './product-report';

export const REPEAT_ROUND_WINDOW_MS = 60_000;

export interface DrinkChoice {
    key: string;
    name: string;
    category: string | null;
}

export interface PerformanceMetrics {
    quantity: number;
    salesInclTaxMinor: number;
    salesExclTaxMinor: number;
    discountMinor: number;
    eligibleOrders: number;
    repeatOrders: number;
    repeatCount: number;
    repeatRounds: number;
    repeatDistribution: { repeats: number; orders: number }[];
    beerOrders: number;
    repeatRate: number | null;
    beerRate: number | null;
    quantityRank: number | null;
    salesInclRank: number | null;
    salesExclRank: number | null;
}

export interface CocktailPerformanceRow extends DrinkChoice {
    period: PerformanceMetrics;
    allTime: PerformanceMetrics;
}

export interface PerformanceLine extends ProductLineRecord {
    createdAt: Date;
    settledAt: Date | null;
    currencyAtSale: string;
    voidedAt?: Date | null;
}

export interface PerformanceSession {
    openedAt: Date;
    closedAt: Date | null;
    status: string;
    reversedAt?: Date | null;
    lines: Pick<
        PerformanceLine,
        'menuItemId' | 'nameAtSale' | 'categoryNameAtSale' | 'createdAt' | 'voidedAt'
    >[];
}

export interface PerformanceData {
    products: CocktailPerformanceRow[];
    choices: DrinkChoice[];
    categories: (string | null)[];
    currencies: string[];
    salesAvailableFrom: string | null;
    repeatAvailableFrom: string | null;
    comparisonBeers: DrinkChoice[];
    selectedCategories: (string | null)[];
    cocktailOrders: { period: number; allTime: number };
    combos: {
        key: string;
        drinks: DrinkChoice[];
        period: { orders: number; share: number | null };
        allTime: { orders: number; share: number | null };
    }[];
}

export interface CocktailPerformanceReport extends PerformanceData {
    barId: string;
    startDate: string;
    endDate: string;
    timezone: string;
}

function emptyMetrics(): PerformanceMetrics {
    return {
        quantity: 0,
        salesInclTaxMinor: 0,
        salesExclTaxMinor: 0,
        discountMinor: 0,
        eligibleOrders: 0,
        repeatOrders: 0,
        repeatCount: 0,
        repeatRounds: 0,
        repeatDistribution: [],
        beerOrders: 0,
        repeatRate: null,
        beerRate: null,
        quantityRank: null,
        salesInclRank: null,
        salesExclRank: null,
    };
}

function normalizeName(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

export function isComparisonBeer(name: string): boolean {
    return /^cana est(?:r)?ella$/.test(normalizeName(name));
}

export function createCocktailPerformanceAccumulator(
    categories: (string | null)[] | null,
    bounds: { start: Date; endExclusive: Date },
) {
    const selectedCategories = categories === null ? null : new Set(categories);
    const isCocktail = (category: string | null) =>
        selectedCategories
            ? selectedCategories.has(category)
            : /cocktail|coctel/.test(normalizeName(category ?? ''));
    const choices = new Map<string, DrinkChoice>();
    const comparisonBeers = new Map<string, DrinkChoice>();
    const combos = new Map<string, PerformanceData['combos'][number]>();
    const cocktailOrders = { period: 0, allTime: 0 };
    const availableCategories = new Set<string | null>();
    const products = new Map<string, CocktailPerformanceRow>();
    const currencies = new Set<string>();
    let salesAvailableFrom: Date | null = null;
    let repeatAvailableFrom: Date | null = null;

    function inPeriod(date: Date) {
        return date >= bounds.start && date < bounds.endExclusive;
    }

    function observe(
        line: Pick<ProductLineRecord, 'menuItemId' | 'nameAtSale' | 'categoryNameAtSale'>,
    ) {
        const key = productLineKey(line);
        const choice = { key, name: line.nameAtSale, category: line.categoryNameAtSale };
        choices.set(key, choice);
        if (isComparisonBeer(choice.name)) comparisonBeers.set(key, choice);
        availableCategories.add(choice.category);
        if (isCocktail(choice.category) && !isComparisonBeer(choice.name) && !products.has(key)) {
            products.set(key, { ...choice, period: emptyMetrics(), allTime: emptyMetrics() });
        }
        return key;
    }

    function addSalesLine(line: PerformanceLine) {
        if (line.voidedAt || !line.settledAt) return;
        const key = observe(line);
        if (!salesAvailableFrom || line.settledAt < salesAvailableFrom)
            salesAvailableFrom = line.settledAt;
        if (!isCocktail(line.categoryNameAtSale) || isComparisonBeer(line.nameAtSale)) return;
        currencies.add(line.currencyAtSale);
        const product = products.get(key)!;
        const sale = aggregateProductLines([line])[0];
        const targets = inPeriod(line.settledAt)
            ? [product.period, product.allTime]
            : [product.allTime];
        for (const target of targets) {
            target.quantity += sale.quantity;
            target.salesInclTaxMinor += sale.salesInclTaxMinor;
            target.salesExclTaxMinor += sale.salesExclTaxMinor;
            target.discountMinor += sale.discountMinor;
        }
    }

    function addSession(session: PerformanceSession) {
        if (session.reversedAt || session.status !== 'CLOSED' || !session.closedAt) return;
        const lines = session.lines.filter((line) => !line.voidedAt);
        for (const line of lines) observe(line);
        if (!repeatAvailableFrom || session.closedAt < repeatAvailableFrom)
            repeatAvailableFrom = session.closedAt;
        const times = new Map<string, number[]>();
        const sessionDrinks = new Map<string, DrinkChoice>();
        let lastBeer = -Infinity;
        for (const line of lines) {
            const key = productLineKey(line);
            const timestamp = line.createdAt.getTime();
            const beer = isComparisonBeer(line.nameAtSale);
            const cocktail = !beer && isCocktail(line.categoryNameAtSale);
            if (beer) lastBeer = Math.max(lastBeer, timestamp);
            if (beer || cocktail) sessionDrinks.set(key, choices.get(key)!);
            if (!cocktail) continue;
            const timestamps = times.get(key) ?? [];
            timestamps.push(timestamp);
            times.set(key, timestamps);
        }
        for (const [key, timestamps] of times) {
            timestamps.sort((first, second) => first - second);
            const firstTimestamp = timestamps[0];
            let roundStart = firstTimestamp;
            let repeatRounds = 0;
            let extraCocktails = 0;
            for (const timestamp of timestamps) {
                if (timestamp - roundStart > REPEAT_ROUND_WINDOW_MS) {
                    repeatRounds += 1;
                    roundStart = timestamp;
                }
                if (repeatRounds > 0) extraCocktails += 1;
            }
            const product = products.get(key)!;
            const targets = inPeriod(session.closedAt)
                ? [product.period, product.allTime]
                : [product.allTime];
            for (const target of targets) {
                target.eligibleOrders += 1;
                if (repeatRounds > 0) target.repeatOrders += 1;
                target.repeatCount += extraCocktails;
                target.repeatRounds += repeatRounds;
                const distribution = target.repeatDistribution.find(
                    (entry) => entry.repeats === repeatRounds,
                );
                if (distribution) distribution.orders += 1;
                else target.repeatDistribution.push({ repeats: repeatRounds, orders: 1 });
                if (lastBeer > firstTimestamp) target.beerOrders += 1;
            }
        }
        if (times.size === 0) return;
        const scopes = inPeriod(session.closedAt)
            ? (['period', 'allTime'] as const)
            : (['allTime'] as const);
        for (const scope of scopes) cocktailOrders[scope] += 1;
        const drinks = [...sessionDrinks.values()].sort((first, second) =>
            first.key.localeCompare(second.key),
        );
        for (let firstIndex = 0; firstIndex < drinks.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < drinks.length; secondIndex += 1) {
                const pair = [drinks[firstIndex], drinks[secondIndex]];
                if (!pair.some((drink) => times.has(drink.key))) continue;
                const key = JSON.stringify(pair.map((drink) => drink.key));
                const combo = combos.get(key) ?? {
                    key,
                    drinks: pair,
                    period: { orders: 0, share: null },
                    allTime: { orders: 0, share: null },
                };
                for (const scope of scopes) combo[scope].orders += 1;
                combos.set(key, combo);
            }
        }
    }

    function finish(): PerformanceData {
        const rows = [...products.values()];
        for (const scope of ['period', 'allTime'] as const) {
            for (const row of rows) {
                const metrics = row[scope];
                metrics.repeatDistribution.sort((first, second) => first.repeats - second.repeats);
                metrics.repeatRate = metrics.eligibleOrders
                    ? (metrics.repeatOrders / metrics.eligibleOrders) * 100
                    : null;
                metrics.beerRate = metrics.eligibleOrders
                    ? (metrics.beerOrders / metrics.eligibleOrders) * 100
                    : null;
            }
            for (const [value, rank] of [
                ['quantity', 'quantityRank'],
                ['salesInclTaxMinor', 'salesInclRank'],
                ['salesExclTaxMinor', 'salesExclRank'],
            ] as const) {
                const ranked = rows
                    .filter((row) => row[scope].quantity > 0)
                    .sort((first, second) => second[scope][value] - first[scope][value]);
                ranked.forEach((row, index) => {
                    row[scope][rank] =
                        index > 0 && ranked[index - 1][scope][value] === row[scope][value]
                            ? ranked[index - 1][scope][rank]
                            : index + 1;
                });
            }
        }
        for (const combo of combos.values()) {
            for (const scope of ['period', 'allTime'] as const) {
                combo[scope].share = cocktailOrders[scope]
                    ? (combo[scope].orders / cocktailOrders[scope]) * 100
                    : null;
            }
        }
        return {
            products: rows.sort(
                (first, second) =>
                    first.name.localeCompare(second.name) || first.key.localeCompare(second.key),
            ),
            choices: [...choices.values()].sort((first, second) => first.name.localeCompare(second.name)),
            categories: [...availableCategories].sort((first, second) =>
                (first ?? '').localeCompare(second ?? ''),
            ),
            currencies: [...currencies].sort(),
            salesAvailableFrom: salesAvailableFrom?.toISOString() ?? null,
            repeatAvailableFrom: repeatAvailableFrom?.toISOString() ?? null,
            comparisonBeers: [...comparisonBeers.values()],
            selectedCategories: [...availableCategories].filter(isCocktail),
            cocktailOrders,
            combos: [...combos.values()].sort(
                (first, second) =>
                    second.period.orders - first.period.orders ||
                    second.allTime.orders - first.allTime.orders ||
                    first.key.localeCompare(second.key),
            ),
        };
    }

    return { observe, addSalesLine, addSession, finish };
}
