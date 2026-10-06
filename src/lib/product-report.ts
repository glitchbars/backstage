export interface ProductLineRecord {
    menuItemId: string | null;
    nameAtSale: string;
    categoryNameAtSale: string | null;
    unitPriceAmountMinor: number;
    discountAmountMinor: number;
    taxRateBpsAtSale: number;
    taxIncludedAtSale: boolean;
}

export interface ProductSalesRow {
    menuItemId: string | null;
    name: string;
    category: string | null;
    quantity: number;
    salesInclTaxMinor: number;
    salesExclTaxMinor: number;
    discountMinor: number;
}

export interface CatalogProduct {
    id: string;
    name: string;
    category: string | null;
}

export type ProductSortKey = 'sales' | 'category' | 'quantity';
export type ProductVatMode = 'incl' | 'excl';

export interface UtcDateRange {
    start: Date;
    endExclusive: Date;
}

function nextIsoDate(value: string): string {
    const next = new Date(`${value}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
}

function localMidnightUtc(value: string, timezone: string): Date {
    const target = Date.parse(`${value}T00:00:00.000Z`);
    let candidate = target;
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const parts = formatter.formatToParts(new Date(candidate));
        const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
        const representedAsUtc = Date.UTC(
            part('year'),
            part('month') - 1,
            part('day'),
            part('hour'),
            part('minute'),
            part('second'),
        );
        const adjustment = target - representedAsUtc;
        candidate += adjustment;
        if (adjustment === 0) break;
    }

    return new Date(candidate);
}

export function getUtcBoundsForLocalDates(startDate: string, endDate: string, timezone: string): UtcDateRange {
    return {
        start: localMidnightUtc(startDate, timezone),
        endExclusive: localMidnightUtc(nextIsoDate(endDate), timezone),
    };
}

export function aggregateProductLines(lines: ProductLineRecord[]): ProductSalesRow[] {
    const products = new Map<string, ProductSalesRow>();

    for (const line of lines) {
        const key = line.menuItemId
            ? `menu:${line.menuItemId}`
            : `snapshot:${line.nameAtSale}\u0000${line.categoryNameAtSale ?? ''}`;
        const product = products.get(key) ?? {
            menuItemId: line.menuItemId,
            name: line.nameAtSale,
            category: line.categoryNameAtSale,
            quantity: 0,
            salesInclTaxMinor: 0,
            salesExclTaxMinor: 0,
            discountMinor: 0,
        };
        const netOfDiscountMinor = Math.max(line.unitPriceAmountMinor - line.discountAmountMinor, 0);
        const salesExclTaxMinor = line.taxIncludedAtSale && line.taxRateBpsAtSale > 0
            ? Math.round((netOfDiscountMinor * 10_000) / (10_000 + line.taxRateBpsAtSale))
            : netOfDiscountMinor;

        product.quantity += 1;
        product.salesInclTaxMinor += netOfDiscountMinor;
        product.salesExclTaxMinor += salesExclTaxMinor;
        product.discountMinor += line.discountAmountMinor;
        products.set(key, product);
    }

    return [...products.values()].sort((a, b) => b.salesInclTaxMinor - a.salesInclTaxMinor);
}

export function includeUnsoldCatalogProducts(
    sales: ProductSalesRow[],
    catalog: CatalogProduct[],
): ProductSalesRow[] {
    const products = [...sales];
    const soldMenuItemIds = new Set(sales.map((product) => product.menuItemId).filter(Boolean));
    const existingSnapshots = new Set(sales.map((product) => `${product.name}\u0000${product.category ?? ''}`));

    for (const item of catalog) {
        const snapshotKey = `${item.name}\u0000${item.category ?? ''}`;
        if (soldMenuItemIds.has(item.id) || existingSnapshots.has(snapshotKey)) continue;
        products.push({
            menuItemId: item.id,
            name: item.name,
            category: item.category,
            quantity: 0,
            salesInclTaxMinor: 0,
            salesExclTaxMinor: 0,
            discountMinor: 0,
        });
    }

    return products;
}

export function sortProductSales(
    products: ProductSalesRow[],
    sortBy: ProductSortKey,
    vatMode: ProductVatMode,
): ProductSalesRow[] {
    return [...products].sort((a, b) => {
        if (sortBy === 'category') {
            const categoryOrder = (a.category ?? 'Uncategorised').localeCompare(b.category ?? 'Uncategorised');
            return categoryOrder || a.name.localeCompare(b.name);
        }
        if (sortBy === 'quantity') {
            return b.quantity - a.quantity || a.name.localeCompare(b.name);
        }
        const aSales = vatMode === 'incl' ? a.salesInclTaxMinor : a.salesExclTaxMinor;
        const bSales = vatMode === 'incl' ? b.salesInclTaxMinor : b.salesExclTaxMinor;
        return bSales - aSales || a.name.localeCompare(b.name);
    });
}

export function filterProductSalesByCategory(
    products: ProductSalesRow[],
    category: string | null | undefined,
): ProductSalesRow[] {
    if (category === undefined) return [...products];
    return products.filter((product) => product.category === category);
}