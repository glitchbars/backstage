'use client';

import { useEffect, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useBarFilter } from '@/components/BarFilterContext';
import { dateInTimezone, getPeriodDateRange, ROLLING_MONTH_OPTIONS, type DateRange } from '@/lib/sales-report';
import type { OrderTimingReport } from '@/lib/order-timing-report';

interface BarOption {
    id: string;
    name: string;
    timezone: string;
}

interface TimingReport extends OrderTimingReport {
    barId: string;
}

type Period = 'this-week' | 'this-month' | 'this-year' | 'custom' | 'all-time' | (typeof ROLLING_MONTH_OPTIONS)[number]['value'];
type HeatmapMetric = 'sessions' | 'items';
type CompareMetric = 'count' | 'percentage';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    ...ROLLING_MONTH_OPTIONS,
    { value: 'this-week', label: 'This week' },
    { value: 'this-month', label: 'This month' },
    { value: 'this-year', label: 'This year' },
    { value: 'custom', label: 'Custom range' },
    { value: 'all-time', label: 'All available history' },
];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LINE_COLORS = ['#087f8c', '#d45d3a', '#b58318', '#3d6eaa', '#8b5e83', '#54836b'];

function hourLabel(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
}

async function readJson<T>(response: Response): Promise<T> {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(body?.error ?? `Request failed (HTTP ${response.status})`);
    if (body === null) throw new Error('The server returned an empty response.');
    return body as T;
}

export default function OrderTimingPage() {
    const { barId, setBarId } = useBarFilter();
    const [bars, setBars] = useState<BarOption[]>([]);
    const [period, setPeriod] = useState<Period>('this-month');
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [customRange, setCustomRange] = useState<DateRange>(() =>
        getPeriodDateRange('this-month', dateInTimezone(new Date(), browserTimezone)),
    );
    const [report, setReport] = useState<TimingReport | null>(null);
    const [selectedDrinkKeys, setSelectedDrinkKeys] = useState<string[]>([]);
    const [selectedHour, setSelectedHour] = useState(20);
    const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('items');
    const [compareMetric, setCompareMetric] = useState<CompareMetric>('percentage');
    const [loadingBars, setLoadingBars] = useState(true);
    const [loadingReport, setLoadingReport] = useState(false);
    const [error, setError] = useState('');

    const timezone = bars.find((bar) => bar.id === barId)?.timezone || browserTimezone;
    const today = dateInTimezone(new Date(), timezone);
    const selectedRange =
        period === 'custom'
            ? customRange
            : period === 'all-time'
                ? null
                : getPeriodDateRange(period, today);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/bars/all', { signal: controller.signal })
            .then((response) => readJson<BarOption[]>(response))
            .then(setBars)
            .catch((cause: unknown) => {
                if (!controller.signal.aborted)
                    setError(cause instanceof Error ? cause.message : 'Failed to load bars.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingBars(false);
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!barId) {
            setReport(null);
            setLoadingReport(false);
            return;
        }

        const controller = new AbortController();
        const params = new URLSearchParams({ barId });
        if (period === 'all-time') {
            params.set('allTime', 'true');
        } else if (selectedRange) {
            params.set('startDate', selectedRange.startDate);
            params.set('endDate', selectedRange.endDate);
        }

        setLoadingReport(true);
        setError('');
        fetch(`/api/order-timing-report?${params}`, { signal: controller.signal })
            .then((response) => readJson<TimingReport>(response))
            .then((nextReport) => {
                if (controller.signal.aborted) return;
                setReport(nextReport);
                setSelectedDrinkKeys(nextReport.drinks.slice(0, 4).map((drink) => drink.key));
            })
            .catch((cause: unknown) => {
                if (controller.signal.aborted) return;
                setReport(null);
                setError(cause instanceof Error ? cause.message : 'Failed to load order timing.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingReport(false);
            });
        return () => controller.abort();
    }, [barId, period, selectedRange?.startDate, selectedRange?.endDate]);

    const currentReport = report?.barId === barId ? report : null;
    const selectedDrinks = (currentReport?.drinks ?? []).filter((drink) =>
        selectedDrinkKeys.includes(drink.key),
    );
    const comparisonData = Array.from({ length: 24 }, (_, hour) => {
        const point: Record<string, string | number> = { hour: hourLabel(hour) };
        for (const drink of selectedDrinks) {
            point[drink.key] =
                compareMetric === 'count'
                    ? drink.hourlyCounts[hour]
                    : Number(drink.hourlyPercentages[hour].toFixed(1));
        }
        return point;
    });
    const hourLeaders = [...(currentReport?.drinks ?? [])]
        .map((drink) => ({ ...drink, count: drink.hourlyCounts[selectedHour] }))
        .filter((drink) => drink.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 8);
    const heatmapMaximum = Math.max(
        1,
        ...(currentReport?.weekdayHours ?? []).map((bucket) =>
            heatmapMetric === 'sessions' ? bucket.sessionCount : bucket.itemCount,
        ),
    );

    function toggleDrink(key: string) {
        setSelectedDrinkKeys((keys) =>
            keys.includes(key)
                ? keys.filter((selectedKey) => selectedKey !== key)
                : keys.length < 6
                    ? [...keys, key]
                    : keys,
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Order Timing</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Tab openings and recorded drink additions by local time
                    </p>
                </div>
                <label className="grid gap-1 text-xs font-medium text-gray-600">
                    Bar
                    <select
                        aria-label="Bar"
                        value={barId}
                        onChange={(event) => setBarId(event.target.value)}
                        disabled={loadingBars}
                        className="min-w-56 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                        <option value="">Select a bar</option>
                        {bars.map((bar) => (
                            <option key={bar.id} value={bar.id}>
                                {bar.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <section
                aria-label="Order timing filters"
                className="flex flex-wrap items-end gap-3 border-y border-gray-200 py-4"
            >
                <label className="grid gap-1 text-xs font-medium text-gray-600">
                    Period
                    <select
                        aria-label="Date period"
                        value={period}
                        onChange={(event) => {
                            const nextPeriod = event.target.value as Period;
                            if (nextPeriod === 'custom' && selectedRange) setCustomRange(selectedRange);
                            setPeriod(nextPeriod);
                        }}
                        className="min-w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
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
                        <label className="grid gap-1 text-xs font-medium text-gray-600">
                            From
                            <input
                                aria-label="From date"
                                type="date"
                                value={customRange.startDate}
                                max={customRange.endDate}
                                onChange={(event) =>
                                    setCustomRange({ ...customRange, startDate: event.target.value })
                                }
                                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-gray-600">
                            To
                            <input
                                aria-label="To date"
                                type="date"
                                value={customRange.endDate}
                                min={customRange.startDate}
                                onChange={(event) =>
                                    setCustomRange({ ...customRange, endDate: event.target.value })
                                }
                                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                        </label>
                    </>
                )}
            </section>

            {error && (
                <p role="alert" className="text-sm text-red-700">
                    {error}
                </p>
            )}
            {!barId && <p className="text-sm text-gray-500">Select a bar to view order timing.</p>}
            {barId && loadingReport && (
                <p role="status" className="text-sm text-gray-500">
                    Loading order history…
                </p>
            )}

            {currentReport && !loadingReport && (
                <>
                    <p className="text-sm text-gray-600">
                        {currentReport.availableFrom
                            ? `Detailed history available ${currentReport.availableFrom} to ${currentReport.availableThrough} (${currentReport.timezone}).`
                            : `No detailed order history found for this bar (${currentReport.timezone}).`}
                        {period !== 'all-time' &&
                            currentReport.availableFrom &&
                            selectedRange &&
                            selectedRange.startDate < currentReport.availableFrom
                            ? ` This report starts at the earliest available date, ${currentReport.startDate}.`
                            : ''}
                    </p>

                    <section aria-label="Order timing totals" className="grid gap-3 sm:grid-cols-3">
                        <article className="rounded-md border border-gray-200 bg-white p-4">
                            <h2 className="text-xs font-medium uppercase text-gray-500">Tabs opened</h2>
                            <p className="mt-2 text-xl font-semibold text-gray-900">
                                {currentReport.totals.sessions.toLocaleString()}
                            </p>
                        </article>
                        <article className="rounded-md border border-gray-200 bg-white p-4">
                            <h2 className="text-xs font-medium uppercase text-gray-500">Drinks recorded</h2>
                            <p className="mt-2 text-xl font-semibold text-gray-900">
                                {currentReport.totals.items.toLocaleString()}
                            </p>
                        </article>
                        <article className="rounded-md border border-gray-200 bg-white p-4">
                            <h2 className="text-xs font-medium uppercase text-gray-500">Different products</h2>
                            <p className="mt-2 text-xl font-semibold text-gray-900">
                                {currentReport.totals.products.toLocaleString()}
                            </p>
                        </article>
                    </section>

                    <section className="grid gap-8 xl:grid-cols-2">
                        <div className="min-w-0 border-b border-gray-200 pb-5">
                            <h2 className="mb-3 font-semibold text-gray-900">When tabs were opened</h2>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={currentReport.sessionOpenings}
                                        margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                                    >
                                        <CartesianGrid vertical={false} stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="hour"
                                            tickFormatter={hourLabel}
                                            interval={2}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                        <Tooltip labelFormatter={(hour) => hourLabel(Number(hour))} />
                                        <Bar dataKey="count" name="Tabs opened" fill="#087f8c" maxBarSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="min-w-0 border-b border-gray-200 pb-5">
                            <h2 className="mb-3 font-semibold text-gray-900">When drinks were added</h2>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={currentReport.drinkOrders}
                                        margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                                    >
                                        <CartesianGrid vertical={false} stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="hour"
                                            tickFormatter={hourLabel}
                                            interval={2}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                        <Tooltip labelFormatter={(hour) => hourLabel(Number(hour))} />
                                        <Bar dataKey="count" name="Drink units added" fill="#d45d3a" maxBarSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </section>

                    <section aria-label="Weekday and hour activity" className="space-y-3">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <h2 className="font-semibold text-gray-900">Busy periods by weekday</h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    Each cell is one bar-local weekday and hour.
                                </p>
                            </div>
                            <fieldset className="grid gap-1">
                                <legend className="text-xs font-medium text-gray-600">Show</legend>
                                <div
                                    role="radiogroup"
                                    aria-label="Heatmap metric"
                                    className="flex overflow-hidden rounded-md border border-gray-300"
                                >
                                    {(['items', 'sessions'] as const).map((metric) => (
                                        <label
                                            key={metric}
                                            className={`cursor-pointer px-3 py-2 text-sm ${heatmapMetric === metric ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <input
                                                type="radio"
                                                name="heatmapMetric"
                                                value={metric}
                                                checked={heatmapMetric === metric}
                                                onChange={() => setHeatmapMetric(metric)}
                                                className="sr-only"
                                            />
                                            {metric === 'items' ? 'Drink units' : 'Tabs opened'}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        </div>
                        <div className="overflow-x-auto border-y border-gray-200 py-3">
                            <table className="min-w-[1050px] w-full table-fixed text-xs">
                                <thead>
                                    <tr>
                                        <th scope="col" className="w-24 px-2 py-2 text-left font-medium text-gray-500">
                                            Day
                                        </th>
                                        {Array.from({ length: 24 }, (_, hour) => (
                                            <th
                                                key={hour}
                                                scope="col"
                                                className="px-1 py-2 text-center font-medium text-gray-500"
                                            >
                                                {hour}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {WEEKDAYS.map((day, weekday) => (
                                        <tr key={day}>
                                            <th scope="row" className="px-2 py-1 text-left font-medium text-gray-700">
                                                {day}
                                            </th>
                                            {Array.from({ length: 24 }, (_, hour) => {
                                                const bucket = currentReport.weekdayHours[weekday * 24 + hour];
                                                const count =
                                                    heatmapMetric === 'sessions' ? bucket.sessionCount : bucket.itemCount;
                                                const intensity = count === 0 ? 0 : 0.12 + (count / heatmapMaximum) * 0.78;
                                                return (
                                                    <td key={hour} className="p-1 text-center">
                                                        <button
                                                            type="button"
                                                            title={`${day} ${hourLabel(hour)}: ${count.toLocaleString()} ${heatmapMetric === 'items' ? 'drink units' : 'tabs opened'}`}
                                                            onClick={() => setSelectedHour(hour)}
                                                            className={`h-7 w-full rounded-sm text-[11px] ${selectedHour === hour ? 'ring-2 ring-inset ring-gray-900' : ''} ${count > 0 ? 'text-gray-950' : 'text-gray-400'}`}
                                                            style={{
                                                                backgroundColor:
                                                                    count > 0 ? `rgba(8, 127, 140, ${intensity})` : '#f3f4f6',
                                                            }}
                                                        >
                                                            {count || ''}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
                        <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <div>
                                    <h2 className="font-semibold text-gray-900">Compare drinks by hour</h2>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Select up to six products. Percent shows each drink’s own hourly distribution.
                                    </p>
                                </div>
                                <fieldset className="grid gap-1">
                                    <legend className="text-xs font-medium text-gray-600">Compare</legend>
                                    <div
                                        role="radiogroup"
                                        aria-label="Drink comparison metric"
                                        className="flex overflow-hidden rounded-md border border-gray-300"
                                    >
                                        {(['percentage', 'count'] as const).map((metric) => (
                                            <label
                                                key={metric}
                                                className={`cursor-pointer px-3 py-2 text-sm ${compareMetric === metric ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="compareMetric"
                                                    value={metric}
                                                    checked={compareMetric === metric}
                                                    onChange={() => setCompareMetric(metric)}
                                                    className="sr-only"
                                                />
                                                {metric === 'percentage' ? '% of drink' : 'Units'}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            </div>
                            <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto border-y border-gray-200 py-3">
                                {currentReport.drinks.map((drink) => (
                                    <label key={drink.key} className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={selectedDrinkKeys.includes(drink.key)}
                                            disabled={
                                                !selectedDrinkKeys.includes(drink.key) && selectedDrinkKeys.length >= 6
                                            }
                                            onChange={() => toggleDrink(drink.key)}
                                            className="size-4 accent-teal-700"
                                        />
                                        {drink.name}
                                    </label>
                                ))}
                                {currentReport.drinks.length === 0 && (
                                    <p className="text-sm text-gray-500">No drink lines in this period.</p>
                                )}
                            </div>
                            {selectedDrinks.length > 0 ? (
                                <div className="h-80 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                            data={comparisonData}
                                            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                                        >
                                            <CartesianGrid vertical={false} stroke="#e5e7eb" />
                                            <XAxis dataKey="hour" interval={2} tickLine={false} axisLine={false} />
                                            <YAxis
                                                unit={compareMetric === 'percentage' ? '%' : ''}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <Tooltip />
                                            <Legend />
                                            {selectedDrinks.map((drink, index) => (
                                                <Line
                                                    key={drink.key}
                                                    type="monotone"
                                                    dataKey={drink.key}
                                                    name={drink.name}
                                                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                                                    strokeWidth={2}
                                                    dot={false}
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <p className="py-8 text-center text-sm text-gray-500">
                                    Select a drink to compare its hourly pattern.
                                </p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <label className="grid max-w-48 gap-1 text-xs font-medium text-gray-600">
                                Drinks added at
                                <select
                                    aria-label="Drink order hour"
                                    value={selectedHour}
                                    onChange={(event) => setSelectedHour(Number(event.target.value))}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                                >
                                    {Array.from({ length: 24 }, (_, hour) => (
                                        <option key={hour} value={hour}>
                                            {hourLabel(hour)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <h2 className="font-semibold text-gray-900">
                                Most ordered at {hourLabel(selectedHour)}
                            </h2>
                            <div className="overflow-x-auto border-y border-gray-200">
                                <table className="w-full min-w-64 text-sm">
                                    <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                                        <tr>
                                            <th className="py-2 font-medium">Drink</th>
                                            <th className="py-2 text-right font-medium">Units</th>
                                            <th className="py-2 text-right font-medium">Share</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {hourLeaders.map((drink) => (
                                            <tr key={drink.key}>
                                                <td className="py-2 pr-2 text-gray-900">{drink.name}</td>
                                                <td className="py-2 text-right text-gray-700">
                                                    {drink.count.toLocaleString()}
                                                </td>
                                                <td className="py-2 text-right text-gray-500">
                                                    {drink.hourlyPercentages[selectedHour].toFixed(1)}%
                                                </td>
                                            </tr>
                                        ))}
                                        {hourLeaders.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="py-6 text-center text-gray-500">
                                                    No drink additions at this hour.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>

                    <section aria-label="Drink peak hour table" className="overflow-x-auto">
                        <h2 className="mb-3 font-semibold text-gray-900">Peak ordering time by drink</h2>
                        <table className="w-full min-w-[560px] text-sm">
                            <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="px-3 py-3 font-medium">Drink</th>
                                    <th className="px-3 py-3 font-medium">Category</th>
                                    <th className="px-3 py-3 text-right font-medium">Units</th>
                                    <th className="px-3 py-3 text-right font-medium">Peak hour</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {currentReport.drinks.map((drink) => (
                                    <tr key={drink.key} className="hover:bg-gray-50">
                                        <td className="px-3 py-3 font-medium text-gray-900">{drink.name}</td>
                                        <td className="px-3 py-3 text-gray-600">{drink.category ?? 'Uncategorised'}</td>
                                        <td className="px-3 py-3 text-right text-gray-700">
                                            {drink.quantity.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-3 text-right text-gray-700">
                                            {drink.peakHours.map(hourLabel).join(', ')}
                                        </td>
                                    </tr>
                                ))}
                                {currentReport.drinks.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-3 py-8 text-center text-gray-500">
                                            No drink lines found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </section>
                </>
            )}
        </div>
    );
}
