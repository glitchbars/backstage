'use client';

import { useEffect, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import * as XLSX from 'xlsx';
import { useBarFilter } from '@/components/BarFilterContext';
import { formatMoney } from '@/lib/money';
import {
    capDateRangeAt,
    dateInTimezone,
    FLOPI_SOURCE_START_DATE,
    getPeriodDateRange,
    type DateRange,
    type PeriodPreset,
} from '@/lib/sales-report';
import {
    filterProductSalesByCategory,
    sortProductSales,
    type ProductSalesRow,
    type ProductSortKey,
} from '@/lib/product-report';

interface BarOption {
    id: string;
    name: string;
    timezone: string;
}

interface ProductReport {
    barId: string;
    timezone: string;
    currency: string | null;
    startDate: string;
    endDate: string;
    sourceStartDate: string;
    products: ProductSalesRow[];
    totals: {
        quantity: number;
        salesInclTaxMinor: number;
        salesExclTaxMinor: number;
        discountMinor: number;
    };
}

type VatMode = 'incl' | 'excl';
type ProductGraphMetric = 'quantity' | 'sales';

const PERIOD_OPTIONS: { value: Exclude<PeriodPreset, 'custom'>; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this-week', label: 'This week' },
    { value: 'last-week', label: 'Last week' },
    { value: 'this-month', label: 'This month' },
    { value: 'last-month', label: 'Last month' },
    { value: 'this-year', label: 'This year' },
    { value: 'last-year', label: 'Last year' },
];
const ALL_CATEGORIES = '__all_categories__';
const UNCATEGORISED = '__uncategorised__';

function dateInput(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00.000Z`));
}

async function readResponseJson<T>(response: Response, fallbackMessage: string): Promise<T> {
    const text = await response.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = null;
    }

    if (!response.ok) {
        const message =
            body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
                ? body.error
                : `${fallbackMessage} (HTTP ${response.status})`;
        throw new Error(message);
    }
    if (body === null) throw new Error(`${fallbackMessage}: server returned an empty response.`);
    return body as T;
}

export default function ProductReportPage() {
    const { barId, setBarId } = useBarFilter();
    const [bars, setBars] = useState<BarOption[]>([]);
    const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this-month');
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [customRange, setCustomRange] = useState<DateRange>(() =>
        getPeriodDateRange('this-month', dateInTimezone(new Date(), browserTimezone)),
    );
    const [vatMode, setVatMode] = useState<VatMode>('incl');
    const [graphMetric, setGraphMetric] = useState<ProductGraphMetric>('quantity');
    const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
    const [sortBy, setSortBy] = useState<ProductSortKey>('quantity');
    const [report, setReport] = useState<ProductReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const timezone = bars.find((bar) => bar.id === barId)?.timezone || browserTimezone;
    const today = dateInTimezone(new Date(), timezone);
    const selectedRange = periodPreset === 'custom' ? customRange : getPeriodDateRange(periodPreset, today);
    const cappedRange = capDateRangeAt(selectedRange, today);
    const reportRange = cappedRange && cappedRange.endDate >= FLOPI_SOURCE_START_DATE
        ? {
            startDate: cappedRange.startDate < FLOPI_SOURCE_START_DATE
                ? FLOPI_SOURCE_START_DATE
                : cappedRange.startDate,
            endDate: cappedRange.endDate,
        }
        : null;

    useEffect(() => {
        fetch('/api/bars/all')
            .then(async (response) => {
                setBars(await readResponseJson<BarOption[]>(response, 'Failed to load bars'));
            })
            .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Failed to load bars.'));
    }, []);

    useEffect(() => {
        if (!barId || !reportRange || reportRange.startDate > reportRange.endDate) {
            setReport(null);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        const params = new URLSearchParams({
            barId,
            startDate: reportRange.startDate,
            endDate: reportRange.endDate,
        });
        setLoading(true);
        setError('');
        fetch(`/api/product-report?${params}`, { signal: controller.signal })
            .then(async (response) => {
                if (controller.signal.aborted) return;
                const body = await readResponseJson<ProductReport>(response, 'Failed to load product report');
                if (!controller.signal.aborted) setReport(body);
            })
            .catch((cause: unknown) => {
                if (controller.signal.aborted) return;
                setReport(null);
                setError(cause instanceof Error ? cause.message : 'Failed to load product report.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [barId, reportRange?.endDate, reportRange?.startDate]);

    const currentReport = report?.barId === barId &&
        report.startDate === reportRange?.startDate &&
        report.endDate === reportRange?.endDate
        ? report
        : null;
    const categoryOptions = [...new Set((currentReport?.products ?? []).map((product) =>
        product.category ?? UNCATEGORISED,
    ))].sort((a, b) => {
        const labelA = a === UNCATEGORISED ? 'Uncategorised' : a;
        const labelB = b === UNCATEGORISED ? 'Uncategorised' : b;
        return labelA.localeCompare(labelB);
    });
    const categoryFilter = selectedCategory === ALL_CATEGORIES
        ? undefined
        : selectedCategory === UNCATEGORISED ? null : selectedCategory;
    const categoryProducts = filterProductSalesByCategory(currentReport?.products ?? [], categoryFilter);
    const products = sortProductSales(categoryProducts, sortBy, vatMode);
    const chartProducts = sortProductSales(categoryProducts, graphMetric, vatMode)
        .filter((product) => product.quantity > 0);
    const chartData = chartProducts.slice(0, 10).map((product) => ({
        name: product.name,
        quantity: product.quantity,
        salesInclTaxMinor: product.salesInclTaxMinor,
        salesExclTaxMinor: product.salesExclTaxMinor,
        value: graphMetric === 'quantity'
            ? product.quantity
            : vatMode === 'incl' ? product.salesInclTaxMinor : product.salesExclTaxMinor,
    }));
    const totalSalesMinor = products.reduce(
        (total, product) => total + (vatMode === 'incl' ? product.salesInclTaxMinor : product.salesExclTaxMinor),
        0,
    );
    const totalQuantity = products.reduce((total, product) => total + product.quantity, 0);

    function exportReport() {
        if (!currentReport) return;
        const summary = [
            ['Metric', 'Value'],
            ['Bar', bars.find((bar) => bar.id === barId)?.name ?? barId],
            ['Date range', `${currentReport.startDate} - ${currentReport.endDate}`],
            ['Category', selectedCategory === ALL_CATEGORIES ? 'All categories' : selectedCategory === UNCATEGORISED ? 'Uncategorised' : selectedCategory],
            ['Revenue basis', vatMode === 'incl' ? 'Including VAT' : 'Excluding VAT'],
            ['Total sales', totalSalesMinor / 100],
            ['Items sold', totalQuantity],
            ['Products sold', products.filter((product) => product.quantity > 0).length],
            ['Products in catalog', products.length],
        ];
        const detail = products.map((product) => ({
            Product: product.name,
            Category: product.category ?? '',
            Quantity: product.quantity,
            'Sales incl. VAT': product.salesInclTaxMinor / 100,
            'Sales excl. VAT': product.salesExclTaxMinor / 100,
            'Average unit sales': (vatMode === 'incl' ? product.salesInclTaxMinor : product.salesExclTaxMinor) /
                product.quantity / 100,
            Discounts: product.discountMinor / 100,
        }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Summary');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detail), 'Products');
        const barName = bars.find((bar) => bar.id === barId)?.name ?? 'products';
        const filename = `${barName}-products-${currentReport.startDate}-to-${currentReport.endDate}`
            .replace(/[^a-z0-9-]+/gi, '-')
            .toLowerCase();
        XLSX.writeFile(workbook, `${filename}.xlsx`);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Product Sales</h1>
                    <p className="mt-1 text-sm text-gray-500">Settled Flopi order lines by product</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="grid gap-1 text-xs font-medium text-gray-600">
                        Bar
                        <select
                            aria-label="Bar"
                            value={barId}
                            onChange={(event) => setBarId(event.target.value)}
                            className="min-w-56 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                        >
                            <option value="">Select a bar</option>
                            {bars.map((bar) => (
                                <option key={bar.id} value={bar.id}>{bar.name}</option>
                            ))}
                        </select>
                    </label>
                    {currentReport && (
                        <button
                            type="button"
                            onClick={exportReport}
                            className="min-h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                        >
                            Export Excel
                        </button>
                    )}
                </div>
            </div>

            <section aria-label="Product report filters" className="flex flex-wrap items-end gap-3 border-y border-gray-200 py-4">
                <label className="grid gap-1 text-xs font-medium text-gray-600">
                    Category
                    <select
                        aria-label="Product category"
                        value={selectedCategory}
                        onChange={(event) => setSelectedCategory(event.target.value)}
                        className="min-w-56 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                        <option value={ALL_CATEGORIES}>All categories</option>
                        {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                                {category === UNCATEGORISED ? 'Uncategorised' : category}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-gray-600">
                    Period
                    <select
                        aria-label="Date period"
                        value={periodPreset}
                        onChange={(event) => {
                            const value = event.target.value as PeriodPreset;
                            if (value === 'custom') {
                                setCustomRange(selectedRange);
                            }
                            setPeriodPreset(value);
                        }}
                        className="min-w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                        {PERIOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                        <option value="custom">Custom</option>
                    </select>
                </label>
                {periodPreset === 'custom' && (
                    <>
                        <label className="grid gap-1 text-xs font-medium text-gray-600">
                            From
                            <input
                                aria-label="From date"
                                type="date"
                                value={selectedRange.startDate}
                                max={selectedRange.endDate}
                                onChange={(event) => setCustomRange({ ...customRange, startDate: event.target.value })}
                                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-gray-600">
                            To
                            <input
                                aria-label="To date"
                                type="date"
                                value={selectedRange.endDate}
                                min={selectedRange.startDate}
                                onChange={(event) => setCustomRange({ ...customRange, endDate: event.target.value })}
                                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                        </label>
                    </>
                )}
                <fieldset className="grid gap-1">
                    <legend className="text-xs font-medium text-gray-600">Revenue basis</legend>
                    <div role="radiogroup" aria-label="Revenue basis" className="flex overflow-hidden rounded-md border border-gray-300">
                        {(['excl', 'incl'] as const).map((mode) => (
                            <label
                                key={mode}
                                className={`cursor-pointer px-3 py-2 text-sm ${vatMode === mode ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                            >
                                <input
                                    type="radio"
                                    name="productVatMode"
                                    value={mode}
                                    checked={vatMode === mode}
                                    onChange={() => setVatMode(mode)}
                                    className="sr-only"
                                />
                                {mode === 'excl' ? 'Excl. VAT' : 'Incl. VAT'}
                            </label>
                        ))}
                    </div>
                </fieldset>
            </section>

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {!barId && <p className="text-sm text-gray-500">Select a bar to view its product sales.</p>}
            {barId && selectedRange.endDate < FLOPI_SOURCE_START_DATE && (
                <p role="status" className="text-sm text-gray-500">
                    Product-level data is available from {dateInput(FLOPI_SOURCE_START_DATE)}.
                </p>
            )}
            {barId && loading && <p className="text-sm text-gray-500">Loading product sales…</p>}

            {currentReport && !loading && (
                <>
                    <p className="text-sm text-gray-600">
                        Flopi product detail from {currentReport.startDate} to {currentReport.endDate} ({currentReport.timezone}).
                    </p>
                    {selectedRange.endDate > today && (
                        <p className="text-sm text-gray-500">Future dates are omitted; showing through {dateInput(today)}.</p>
                    )}

                    <section aria-label="Product totals" className="grid gap-3 sm:grid-cols-3">
                        <article className="rounded-md border border-gray-200 bg-white p-4">
                            <h2 className="text-xs font-medium uppercase text-gray-500">Product sales</h2>
                            <p className="mt-2 text-xl font-semibold text-gray-900">{formatMoney(totalSalesMinor, currentReport.currency)}</p>
                        </article>
                        <article className="rounded-md border border-gray-200 bg-white p-4">
                            <h2 className="text-xs font-medium uppercase text-gray-500">Items sold</h2>
                            <p className="mt-2 text-xl font-semibold text-gray-900">{totalQuantity.toLocaleString()}</p>
                        </article>
                        <article className="rounded-md border border-gray-200 bg-white p-4">
                            <h2 className="text-xs font-medium uppercase text-gray-500">Products sold</h2>
                            <p className="mt-2 text-xl font-semibold text-gray-900">
                                {products.filter((product) => product.quantity > 0).length.toLocaleString()}
                            </p>
                        </article>
                    </section>

                    <section aria-label="Top products chart" className="border-b border-gray-200 pb-5">
                        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                            <h2 className="font-semibold text-gray-900">
                                {graphMetric === 'quantity' ? 'Most sold products' : 'Product sales'}
                                {selectedCategory === ALL_CATEGORIES
                                    ? ''
                                    : ` in ${selectedCategory === UNCATEGORISED ? 'Uncategorised' : selectedCategory}`}
                            </h2>
                            <fieldset className="grid gap-1">
                                <legend className="text-xs font-medium text-gray-600">Graph metric</legend>
                                <div role="radiogroup" aria-label="Graph metric" className="flex overflow-hidden rounded-md border border-gray-300">
                                    {(['quantity', 'sales'] as const).map((metric) => (
                                        <label
                                            key={metric}
                                            className={`cursor-pointer px-3 py-2 text-sm ${graphMetric === metric ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <input
                                                type="radio"
                                                name="productGraphMetric"
                                                value={metric}
                                                checked={graphMetric === metric}
                                                onChange={() => setGraphMetric(metric)}
                                                className="sr-only"
                                            />
                                            {metric === 'quantity' ? 'Units sold' : 'Sales'}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        </div>
                        {chartData.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-500">No settled product sales in this period.</p>
                        ) : (
                            <div className="h-[26rem] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
                                        <CartesianGrid horizontal={false} stroke="#e5e7eb" />
                                        <XAxis
                                            type="number"
                                            allowDecimals={graphMetric === 'sales'}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value: number) => graphMetric === 'sales'
                                                ? formatMoney(value, currentReport.currency)
                                                : value.toLocaleString()}
                                        />
                                        <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                const point = payload?.[0]?.payload as (typeof chartData)[number] | undefined;
                                                if (!active || !point) return null;
                                                const salesMinor = vatMode === 'incl'
                                                    ? point.salesInclTaxMinor
                                                    : point.salesExclTaxMinor;
                                                return (
                                                    <div className="rounded-md border border-gray-200 bg-white px-4 py-3 shadow-md">
                                                        <p className="font-medium text-gray-900">{point.name}</p>
                                                        <p className="mt-1 text-sm text-gray-600">
                                                            Units sold: {point.quantity.toLocaleString()}
                                                        </p>
                                                        <p className="text-sm text-gray-600">
                                                            Sales {vatMode === 'incl' ? 'incl.' : 'excl.'} VAT: {formatMoney(salesMinor, currentReport.currency)}
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Legend />
                                        <Bar
                                            dataKey="value"
                                            name={graphMetric === 'quantity'
                                                ? 'Units sold'
                                                : `Sales ${vatMode === 'incl' ? 'incl.' : 'excl.'} VAT`}
                                            fill="#087f8c"
                                            maxBarSize={28}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </section>

                    <section aria-label="Product sales table" className="overflow-x-auto">
                        <div className="mb-3 flex justify-end">
                            <label className="grid gap-1 text-xs font-medium text-gray-600">
                                Sort by
                                <select
                                    aria-label="Sort products by"
                                    value={sortBy}
                                    onChange={(event) => setSortBy(event.target.value as ProductSortKey)}
                                    className="min-w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                                >
                                    <option value="sales">Sales</option>
                                    <option value="category">Product category</option>
                                    <option value="quantity">Quantity sold</option>
                                </select>
                            </label>
                        </div>
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="px-3 py-3 font-medium">Product</th>
                                    <th className="px-3 py-3 font-medium">Category</th>
                                    <th className="px-3 py-3 text-right font-medium">Quantity</th>
                                    <th className="px-3 py-3 text-right font-medium">Sales</th>
                                    <th className="px-3 py-3 text-right font-medium">Avg. unit sales</th>
                                    <th className="px-3 py-3 text-right font-medium">Discounts</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {products.map((product) => {
                                    const salesMinor = vatMode === 'incl' ? product.salesInclTaxMinor : product.salesExclTaxMinor;
                                    return (
                                        <tr key={`${product.name}-${product.category ?? ''}`} className="hover:bg-gray-50">
                                            <td className="px-3 py-3 font-medium text-gray-900">{product.name}</td>
                                            <td className="px-3 py-3 text-gray-600">{product.category ?? 'Uncategorised'}</td>
                                            <td className="px-3 py-3 text-right text-gray-700">{product.quantity.toLocaleString()}</td>
                                            <td className="px-3 py-3 text-right text-gray-900">{formatMoney(salesMinor, currentReport.currency)}</td>
                                            <td className="px-3 py-3 text-right text-gray-700">
                                                {product.quantity > 0
                                                    ? formatMoney(Math.round(salesMinor / product.quantity), currentReport.currency)
                                                    : 'No sales'}
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-700">
                                                {formatMoney(product.discountMinor, currentReport.currency)}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {products.length === 0 && (
                                    <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">No product sales found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </section>
                </>
            )}
        </div>
    );
}