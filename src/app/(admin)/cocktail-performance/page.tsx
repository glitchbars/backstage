'use client';

import { useEffect, useState } from 'react';
import { useBarFilter } from '@/components/BarFilterContext';
import { formatMoney } from '@/lib/money';
import {
    dateInTimezone,
    formatReportDate,
    getPeriodDateRange,
    isIsoDate,
    ROLLING_MONTH_OPTIONS,
    type DateRange,
    type PeriodPreset,
} from '@/lib/sales-report';
import type { CocktailPerformanceReport } from '@/lib/cocktail-performance';

interface BarOption {
    id: string;
    name: string;
    timezone: string;
}
type View = 'repeats' | 'beer' | 'combos' | 'sales';
type Scope = 'period' | 'allTime';
const VIEWS: { value: View; label: string }[] = [
    { value: 'repeats', label: 'Repeats' },
    { value: 'beer', label: 'Caña follow-ups' },
    { value: 'combos', label: 'Popular combos' },
    { value: 'sales', label: 'Sales & rankings' },
];
const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this-week', label: 'This week' },
    { value: 'last-week', label: 'Last week' },
    { value: 'this-month', label: 'This month' },
    { value: 'last-month', label: 'Last month' },
    ...ROLLING_MONTH_OPTIONS,
    { value: 'this-year', label: 'This year' },
    { value: 'last-year', label: 'Last year' },
    { value: 'custom', label: 'Custom range' },
];
const CONTROL =
    'max-w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
const CELL = 'px-4 py-3 text-right tabular-nums';
const NAME = 'min-w-40 max-w-64 break-words px-4 py-3 text-left font-medium text-gray-900';
const percent = (value: number | null) => (value === null ? '-' : `${value.toFixed(1)}%`);

async function readJson<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? `Request failed (HTTP ${response.status})`);
    if (!body) throw new Error('The server returned an empty response.');
    return body as T;
}

function PerformanceReport({ barId, timezone }: { barId: string; timezone: string }) {
    const today = dateInTimezone(new Date(), timezone);
    const [period, setPeriod] = useState<PeriodPreset>('this-month');
    const [customRange, setCustomRange] = useState<DateRange>(() =>
        getPeriodDateRange('this-month', today),
    );
    const [categories, setCategories] = useState<(string | null)[] | null>(null);
    const [categoryChoices, setCategoryChoices] = useState<(string | null)[]>([]);
    const [defaultCategories, setDefaultCategories] = useState<(string | null)[]>([]);
    const [result, setResult] = useState<{ key: string; report: CocktailPerformanceReport } | null>(
        null,
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const [view, setView] = useState<View>('repeats');
    const [scope, setScope] = useState<Scope>('period');
    const [vat, setVat] = useState<'incl' | 'excl'>('incl');
    const [ranking, setRanking] = useState<'quantity' | 'sales'>('quantity');
    const range = period === 'custom' ? customRange : getPeriodDateRange(period, today);
    const validRange =
        isIsoDate(range.startDate) && isIsoDate(range.endDate) && range.startDate <= range.endDate;
    const params = new URLSearchParams({ barId, startDate: range.startDate, endDate: range.endDate });
    if (categories !== null) params.set('categories', JSON.stringify(categories));
    const requestKey = params.toString();

    useEffect(() => {
        if (!validRange) {
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        setError('');
        fetch(`/api/cocktail-performance?${requestKey}`, { signal: controller.signal })
            .then((response) => readJson<CocktailPerformanceReport>(response))
            .then((report) => {
                if (controller.signal.aborted) return;
                setResult({ key: requestKey, report });
                setCategoryChoices(report.categories);
                setDefaultCategories(report.selectedCategories);
            })
            .catch((cause: unknown) => {
                if (!controller.signal.aborted)
                    setError(cause instanceof Error ? cause.message : 'Failed to load cocktail performance.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [requestKey, retry, validRange]);

    const report =
        validRange && !loading && !error && result?.key === requestKey ? result.report : null;
    const selectedCategories = categories ?? defaultCategories;
    const salesKey = vat === 'incl' ? 'salesInclTaxMinor' : 'salesExclTaxMinor';
    const rankKey =
        ranking === 'quantity' ? 'quantityRank' : vat === 'incl' ? 'salesInclRank' : 'salesExclRank';
    const products = [...(report?.products ?? [])].sort((first, second) => {
        const metric =
            view === 'repeats'
                ? 'repeatRounds'
                : view === 'beer'
                    ? 'beerOrders'
                    : ranking === 'sales'
                        ? salesKey
                        : 'quantity';
        return (
            second[scope][metric] - first[scope][metric] ||
            first.name.localeCompare(second.name) ||
            first.key.localeCompare(second.key)
        );
    });
    const combos = [...(report?.combos ?? [])]
        .filter((combo) => combo[scope].orders > 0)
        .sort(
            (first, second) =>
                second[scope].orders - first[scope].orders || first.key.localeCompare(second.key),
        );
    const currency = report?.currencies[0] ?? null;
    const beerAvailable = (report?.comparisonBeers.length ?? 0) > 0;
    const activeLabel = VIEWS.find((option) => option.value === view)!.label;
    const coverage = view === 'sales' ? report?.salesAvailableFrom : report?.repeatAvailableFrom;
    const periodLabel =
        report && report.startDate <= report.endDate
            ? `${formatReportDate(report.startDate)} - ${formatReportDate(report.endDate)}`
            : 'No dates before today';

    return (
        <>
            <section
                aria-label="Cocktail performance filters"
                className="flex flex-wrap items-end gap-4 border-y border-gray-200 py-4"
            >
                <label className="grid min-w-0 gap-1 text-xs font-medium text-gray-600">
                    Period
                    <select
                        aria-label="Date period"
                        className={CONTROL}
                        value={period}
                        onChange={(event) => {
                            if (event.target.value === 'custom') setCustomRange(range);
                            setPeriod(event.target.value as PeriodPreset);
                        }}
                    >
                        {PERIOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                {period === 'custom' && (
                    <>
                        <label className="grid min-w-0 gap-1 text-xs text-gray-600">
                            From
                            <input
                                aria-label="From date"
                                type="date"
                                className={CONTROL}
                                value={customRange.startDate}
                                max={customRange.endDate}
                                onChange={(event) =>
                                    setCustomRange({ ...customRange, startDate: event.target.value })
                                }
                            />
                        </label>
                        <label className="grid min-w-0 gap-1 text-xs text-gray-600">
                            To
                            <input
                                aria-label="To date"
                                type="date"
                                className={CONTROL}
                                value={customRange.endDate}
                                min={customRange.startDate}
                                onChange={(event) =>
                                    setCustomRange({ ...customRange, endDate: event.target.value })
                                }
                            />
                        </label>
                    </>
                )}
                <fieldset className="min-w-0">
                    <legend className="mb-1 text-xs font-medium text-gray-600">Timeframe</legend>
                    <div className="flex flex-wrap overflow-hidden rounded-md border border-gray-300">
                        {(
                            [
                                { value: 'period', label: 'Selected period' },
                                { value: 'allTime', label: 'All time' },
                            ] as const
                        ).map((option) => (
                            <label
                                key={option.value}
                                className={`cursor-pointer px-3 py-2 text-sm ${scope === option.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
                            >
                                <input
                                    className="sr-only"
                                    type="radio"
                                    name="Timeframe"
                                    checked={scope === option.value}
                                    onChange={() => setScope(option.value)}
                                />
                                {option.label}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <details className="min-w-0 max-w-full text-sm text-gray-600">
                    <summary className="cursor-pointer py-2">
                        Cocktail categories ({selectedCategories.length})
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {categoryChoices.map((category) => (
                            <label
                                key={JSON.stringify(category)}
                                className="flex min-w-0 items-center gap-2 break-words"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedCategories.includes(category)}
                                    onChange={(event) => {
                                        setCategories(
                                            event.target.checked
                                                ? [...selectedCategories, category]
                                                : selectedCategories.filter((selected) => selected !== category),
                                        );
                                    }}
                                />
                                {category ?? 'Uncategorised'}
                            </label>
                        ))}
                    </div>
                </details>
            </section>

            <div
                role="tablist"
                aria-label="Performance views"
                className="grid grid-cols-2 gap-1 border-b border-gray-200 sm:flex sm:flex-wrap sm:gap-4"
            >
                {VIEWS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        id={`tab-${option.value}`}
                        aria-selected={view === option.value}
                        aria-controls={`panel-${option.value}`}
                        onClick={() => setView(option.value)}
                        className={`min-h-11 break-words border-b-2 px-2 py-3 text-sm font-medium ${view === option.value ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {!validRange && (
                <p role="alert" className="text-sm text-red-600">
                    Enter valid dates with the start on or before the end.
                </p>
            )}
            {error && (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-600">
                    {error}
                    <button type="button" className={CONTROL} onClick={() => setRetry(retry + 1)}>
                        Retry
                    </button>
                </div>
            )}
            {loading && (
                <p role="status" className="text-sm text-gray-500">
                    Loading cocktail performance...
                </p>
            )}

            {report && (
                <section
                    role="tabpanel"
                    id={`panel-${view}`}
                    aria-labelledby={`tab-${view}`}
                    className="min-w-0 space-y-4"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold text-gray-900">{activeLabel}</h2>
                            <p className="mt-1 text-sm text-gray-500">
                                {scope === 'period'
                                    ? periodLabel
                                    : coverage
                                        ? `All available history from ${formatReportDate(dateInTimezone(new Date(coverage), timezone))}`
                                        : 'No available history'}
                            </p>
                            {view !== 'sales' && (
                                <p className="mt-1 text-sm text-gray-600">
                                    {report.cocktailOrders[scope].toLocaleString()} closed cocktail orders
                                </p>
                            )}
                        </div>
                        {view === 'sales' && (
                            <div className="flex flex-wrap gap-3">
                                <label className="grid gap-1 text-xs text-gray-600">
                                    Rank by
                                    <select
                                        aria-label="Rank by"
                                        className={CONTROL}
                                        value={ranking}
                                        onChange={(event) => setRanking(event.target.value as 'quantity' | 'sales')}
                                    >
                                        <option value="quantity">Units sold</option>
                                        <option value="sales">Sales</option>
                                    </select>
                                </label>
                                <label className="grid gap-1 text-xs text-gray-600">
                                    Revenue basis
                                    <select
                                        aria-label="Revenue basis"
                                        className={CONTROL}
                                        value={vat}
                                        onChange={(event) => setVat(event.target.value as 'incl' | 'excl')}
                                    >
                                        <option value="incl">Incl. VAT</option>
                                        <option value="excl">Excl. VAT</option>
                                    </select>
                                </label>
                            </div>
                        )}
                    </div>

                    {selectedCategories.length === 0 ? (
                        <p role="status" className="py-5 text-sm text-gray-500">
                            No cocktail categories selected.
                        </p>
                    ) : (
                        <>
                            {view === 'beer' && (
                                <p className="text-sm text-gray-600">
                                    {beerAvailable
                                        ? `Compared only with ${report.comparisonBeers
                                            .map((beer) => beer.name)
                                            .filter((name, index, names) => names.indexOf(name) === index)
                                            .join(' / ')}.`
                                        : "Caña Estella was not found in this bar's menu or order history."}
                                </p>
                            )}
                            {view === 'combos' && combos.length === 0 ? (
                                <p role="status" className="py-5 text-sm text-gray-500">
                                    No cocktail combinations in this timeframe.
                                </p>
                            ) : view !== 'combos' && products.length === 0 ? (
                                <p role="status" className="py-5 text-sm text-gray-500">
                                    No cocktail data for the selected categories.
                                </p>
                            ) : (
                                <div
                                    role="region"
                                    aria-label={`${activeLabel} table`}
                                    tabIndex={0}
                                    className="max-w-full overflow-x-auto border-y border-gray-200"
                                >
                                    <table className="w-full text-sm text-gray-700">
                                        <thead className="bg-gray-50 text-xs text-gray-600">
                                            <tr>
                                                <th scope="col" className={`${NAME} text-gray-600`}>
                                                    {view === 'combos' ? 'Combination' : 'Cocktail'}
                                                </th>
                                                {(view === 'repeats'
                                                    ? [
                                                        'Orders',
                                                        'Orders with repeats',
                                                        'Repeat rounds (estimated)',
                                                        'Extra cocktails',
                                                        'Repeat rounds per order',
                                                    ]
                                                    : view === 'beer'
                                                        ? ['Cocktail orders', 'Then caña', '% followed by caña']
                                                        : view === 'combos'
                                                            ? ['Orders together', '% of cocktail orders']
                                                            : ['Period rank', 'All-time rank', 'Units sold', 'Sales', 'Discounts']
                                                ).map((heading) => (
                                                    <th key={heading} scope="col" className={CELL}>
                                                        {heading}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {view === 'combos'
                                                ? combos.map((combo) => (
                                                    <tr key={combo.key}>
                                                        <th scope="row" className={NAME}>
                                                            {combo.drinks.map((drink) => drink.name).join(' + ')}
                                                        </th>
                                                        <td className={CELL}>{combo[scope].orders.toLocaleString()}</td>
                                                        <td className={CELL}>{percent(combo[scope].share)}</td>
                                                    </tr>
                                                ))
                                                : products.map((product) => {
                                                    const metrics = product[scope];
                                                    return (
                                                        <tr key={product.key}>
                                                            <th scope="row" className={NAME}>
                                                                {product.name}
                                                            </th>
                                                            {view === 'repeats' ? (
                                                                <>
                                                                    <td className={CELL}>
                                                                        {metrics.eligibleOrders.toLocaleString()}
                                                                    </td>
                                                                    <td className={CELL}>
                                                                        {metrics.repeatOrders.toLocaleString()}
                                                                    </td>
                                                                    <td className={`${CELL} font-semibold text-emerald-800`}>
                                                                        {metrics.repeatRounds.toLocaleString()}
                                                                    </td>
                                                                    <td className={`${CELL} font-semibold text-emerald-800`}>
                                                                        {metrics.repeatCount.toLocaleString()}
                                                                    </td>
                                                                    <td className="min-w-52 px-4 py-3">
                                                                        <ul
                                                                            aria-label={`${product.name} repeat breakdown`}
                                                                            className="space-y-1 text-xs"
                                                                        >
                                                                            {metrics.repeatDistribution.map((entry) => (
                                                                                <li
                                                                                    key={entry.repeats}
                                                                                    className="flex justify-between gap-4"
                                                                                >
                                                                                    <span>
                                                                                        {entry.repeats === 0
                                                                                            ? 'No repeat rounds'
                                                                                            : `${entry.repeats} ${entry.repeats === 1 ? 'repeat round' : 'repeat rounds'}`}
                                                                                    </span>
                                                                                    <span className="tabular-nums">
                                                                                        {entry.orders}{' '}
                                                                                        {entry.orders === 1 ? 'order' : 'orders'}
                                                                                    </span>
                                                                                </li>
                                                                            ))}
                                                                            {metrics.repeatDistribution.length === 0 && (
                                                                                <li className="text-gray-400">No closed orders</li>
                                                                            )}
                                                                        </ul>
                                                                    </td>
                                                                </>
                                                            ) : view === 'beer' ? (
                                                                <>
                                                                    <td className={CELL}>
                                                                        {metrics.eligibleOrders.toLocaleString()}
                                                                    </td>
                                                                    <td className={CELL}>
                                                                        {beerAvailable ? metrics.beerOrders.toLocaleString() : '-'}
                                                                    </td>
                                                                    <td className={CELL}>
                                                                        {beerAvailable ? percent(metrics.beerRate) : '-'}
                                                                    </td>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <td className={CELL}>{product.period[rankKey] ?? '-'}</td>
                                                                    <td className={CELL}>{product.allTime[rankKey] ?? '-'}</td>
                                                                    <td className={CELL}>{metrics.quantity.toLocaleString()}</td>
                                                                    <td className={`${CELL} whitespace-nowrap`}>
                                                                        {formatMoney(metrics[salesKey], currency)}
                                                                    </td>
                                                                    <td className={`${CELL} whitespace-nowrap`}>
                                                                        {formatMoney(metrics.discountMinor, currency)}
                                                                    </td>
                                                                </>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className="text-xs text-gray-500">
                                {view === 'repeats'
                                    ? "Estimated rounds group identical cocktails added within one minute of the round's first item. The first round is not a repeat; extra cocktails are units in later rounds."
                                    : view === 'beer'
                                        ? 'Caña added later on the same order. Other items in between are allowed.'
                                        : view === 'combos'
                                            ? 'Distinct cocktail pairs and cocktail + Caña Estella pairs on the same order, counted once per pair per order. Shared orders can contain several pairs.'
                                            : `Sales use settlement dates; order statistics use closing dates (${timezone}).`}
                            </p>
                        </>
                    )}
                </section>
            )}
        </>
    );
}

export default function CocktailPerformancePage() {
    const { barId, setBarId } = useBarFilter();
    const [bars, setBars] = useState<BarOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/bars/all', { signal: controller.signal })
            .then((response) => readJson<BarOption[]>(response))
            .then((options) => {
                if (!controller.signal.aborted) setBars(options);
            })
            .catch((cause: unknown) => {
                if (!controller.signal.aborted)
                    setError(cause instanceof Error ? cause.message : 'Failed to load bars.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, []);
    const bar = bars.find((option) => option.id === barId);
    return (
        <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Cocktail Performance</h1>
                <label className="grid max-w-full gap-1 text-xs font-medium text-gray-600">
                    Bar
                    <select
                        aria-label="Bar"
                        className={CONTROL}
                        value={barId}
                        disabled={loading}
                        onChange={(event) => setBarId(event.target.value)}
                    >
                        <option value="">Select a bar</option>
                        {barId && !bar && <option value={barId}>Unavailable bar</option>}
                        {bars.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {error && (
                <p role="alert" className="text-sm text-red-600">
                    {error}
                </p>
            )}
            {loading && (
                <p role="status" className="text-sm text-gray-500">
                    Loading bars...
                </p>
            )}
            {!loading && !barId && <p className="text-sm text-gray-500">No bar selected.</p>}
            {!loading && barId && !bar && (
                <p role="alert" className="text-sm text-gray-500">
                    The selected bar is unavailable.
                </p>
            )}
            {bar && (
                <PerformanceReport key={barId} barId={barId} timezone={bar.timezone || 'Europe/Madrid'} />
            )}
        </div>
    );
}
