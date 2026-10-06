import { describe, expect, it } from 'vitest';
import {
    aggregateProductLines,
    filterProductSalesByCategory,
    getUtcBoundsForLocalDates,
    includeUnsoldCatalogProducts,
    sortProductSales,
} from './product-report';

describe('product report helpers', () => {
    it('aggregates sale-time product snapshots, discounts, and VAT', () => {
        const products = aggregateProductLines([
            {
                menuItemId: null,
                nameAtSale: 'Lager',
                categoryNameAtSale: 'Beer',
                unitPriceAmountMinor: 600,
                discountAmountMinor: 100,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: true,
            },
            {
                menuItemId: null,
                nameAtSale: 'Lager',
                categoryNameAtSale: 'Beer',
                unitPriceAmountMinor: 600,
                discountAmountMinor: 0,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: true,
            },
            {
                menuItemId: null,
                nameAtSale: 'Soda',
                categoryNameAtSale: 'Soft drinks',
                unitPriceAmountMinor: 250,
                discountAmountMinor: 0,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: false,
            },
        ]);

        expect(products).toEqual([
            {
                menuItemId: null,
                name: 'Lager',
                category: 'Beer',
                quantity: 2,
                salesInclTaxMinor: 1100,
                salesExclTaxMinor: 909,
                discountMinor: 100,
            },
            {
                menuItemId: null,
                name: 'Soda',
                category: 'Soft drinks',
                quantity: 1,
                salesInclTaxMinor: 250,
                salesExclTaxMinor: 250,
                discountMinor: 0,
            },
        ]);
    });

    it('converts local date bounds through daylight-saving changes', () => {
        expect(getUtcBoundsForLocalDates('2026-10-24', '2026-10-26', 'Europe/Madrid')).toEqual({
            start: new Date('2026-10-23T22:00:00.000Z'),
            endExclusive: new Date('2026-10-26T23:00:00.000Z'),
        });
    });

    it('sorts product rows alphabetically by category', () => {
        const products = aggregateProductLines([
            {
                menuItemId: null,
                nameAtSale: 'Soda',
                categoryNameAtSale: 'Soft drinks',
                unitPriceAmountMinor: 250,
                discountAmountMinor: 0,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: false,
            },
            {
                menuItemId: null,
                nameAtSale: 'Lager',
                categoryNameAtSale: 'Beer',
                unitPriceAmountMinor: 600,
                discountAmountMinor: 0,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: true,
            },
            {
                menuItemId: null,
                nameAtSale: 'Water',
                categoryNameAtSale: 'Soft drinks',
                unitPriceAmountMinor: 100,
                discountAmountMinor: 0,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: true,
            },
        ]);

        expect(sortProductSales(products, 'category', 'incl').map((product) => product.name)).toEqual([
            'Lager',
            'Soda',
            'Water',
        ]);
    });

    it('filters a selected product category without changing other groups', () => {
        const products = aggregateProductLines([
            {
                nameAtSale: 'Margarita',
                categoryNameAtSale: 'CÓCTELES AUTOR',
                unitPriceAmountMinor: 1000,
                discountAmountMinor: 0,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: true,
            },
            {
                nameAtSale: 'Lager',
                categoryNameAtSale: 'Beer',
                unitPriceAmountMinor: 500,
                discountAmountMinor: 0,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: true,
            },
        ]);

        expect(filterProductSalesByCategory(products, 'CÓCTELES AUTOR').map((product) => product.name)).toEqual([
            'Margarita',
        ]);
        expect(filterProductSalesByCategory(products, undefined)).toHaveLength(2);
    });

    it('includes catalog products with zero sales without duplicating sold menu items', () => {
        const sold = aggregateProductLines([
            {
                menuItemId: 'menu-1',
                nameAtSale: 'Lager',
                categoryNameAtSale: 'Beer',
                unitPriceAmountMinor: 500,
                discountAmountMinor: 0,
                taxRateBpsAtSale: 2100,
                taxIncludedAtSale: true,
            },
        ]);
        const products = includeUnsoldCatalogProducts(sold, [
            { id: 'menu-1', name: 'Lager', category: 'Beer' },
            { id: 'menu-2', name: 'Margarita', category: 'CÓCTELES AUTOR' },
        ]);

        expect(products).toHaveLength(2);
        expect(products.find((product) => product.name === 'Margarita')).toMatchObject({
            menuItemId: 'menu-2',
            quantity: 0,
            salesInclTaxMinor: 0,
            salesExclTaxMinor: 0,
        });
    });
});