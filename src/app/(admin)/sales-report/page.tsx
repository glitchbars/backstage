'use client';

import { useEffect, useRef, useState } from 'react';
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
import { useBarFilter } from '@/components/BarFilterContext';
import { formatMoney } from '@/lib/money';
import * as XLSX from 'xlsx';
import {
    capDateRangeAt,
    dateInTimezone,
    FLOPI_SOURCE_START_DATE,
    getPeriodDateRange,
    getPreviousDateRange,
    getPreviousYearDateRange,
    summarizeReportTotals,
    SUMUP_SOURCE_END_DATE,
    type BucketRange,
    type ComparisonPreset,
    type DateRange,
    type PeriodPreset,
    type SalesBucket,
    type SalesGrouping,
    type TillBucket,
} from '@/lib/sales-report';

interface BarOption {
    id: string;
    name: string;
    timezone: string;
}

interface SalesReport {
    barId: string;
    startDate: string;
    endDate: string;
    grouping: SalesGrouping;
    currency: string | null;
    timezone: string;
    buckets: SalesBucket[];
    tillBuckets: TillBucket[];
    previous: {
        startDate: string;
        endDate: string;
        buckets: SalesBucket[];
        tillBuckets: TillBucket[];
    } | null;
}

type VatMode = 'incl' | 'excl';

const GROUPINGS: { value: SalesGrouping; label: string }[] = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'fortnight', label: 'Fortnight' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
];

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

function formatDateInput(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00.000Z`));
}

function periodDescription(preset: Exclude<PeriodPreset, 'custom'>, today: string): string {
    const range = getPeriodDateRange(preset, today);
    if (preset === 'today' || preset === 'yesterday') {
        return new Intl.DateTimeFormat(undefined, {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            timeZone: 'UTC',
        }).format(new Date(`${range.startDate}T00:00:00.000Z`));
    }
    return `${formatDateInput(range.startDate)} - ${formatDateInput(range.endDate)}`;
}

function dateLabel(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00.000Z`));
}

function rangeLabel(bucket: BucketRange): string {
    return bucket.rangeStartDate === bucket.rangeEndDate
        ? dateLabel(bucket.rangeStartDate)
        : `${dateLabel(bucket.rangeStartDate)} – ${dateLabel(bucket.rangeEndDate)}`;
}

function sourceLabel(hasSumUp: boolean, hasFlopi: boolean): string {
    if (hasSumUp && hasFlopi) return 'SumUp + Flopi';
    if (hasSumUp) return 'SumUp';
    if (hasFlopi) return 'Flopi';
    return 'No data';
}

function RadioPickerOption({
    name,
    value,
    selected,
    label,
    description,
    onSelect,
}: {
    name: string;
    value: string;
    selected: boolean;
    label: string;
    description: string;
    onSelect: () => void;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-gray-50">
            <input
                type="radio"
                name={name}
                value={value}
                checked={selected}
                onChange={onSelect}
                className="peer sr-only"
            />
            <span
                aria-hidden="true"
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2 ${selected ? 'border-blue-600' : 'border-gray-300'}`}
            >
                {selected && <span className="size-2.5 rounded-full bg-blue-600" />}
            </span>
            <span className="grid gap-0.5">
                <span className="text-sm text-gray-900">{label}</span>
                <span className="text-sm text-gray-500">{description}</span>
            </span>
        </label>
    );
}

function PickerChevron({ open }: { open: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={`size-2 border-b-2 border-r-2 border-current transition-transform ${open ? 'rotate-[225deg]' : 'rotate-45'}`}
        />
    );
}

export default function SalesReportPage() {
    const { barId, setBarId } = useBarFilter();
    const [bars, setBars] = useState<BarOption[]>([]);
    const [grouping, setGrouping] = useState<SalesGrouping>('day');
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const initialToday = dateInTimezone(new Date(), browserTimezone);
    const initialRange = getPeriodDateRange('this-month', initialToday);
    const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this-month');
    const [customRange, setCustomRange] = useState<DateRange>(initialRange);
    const [comparisonPreset, setComparisonPreset] = useState<ComparisonPreset>('previous-period');
    const [showSource, setShowSource] = useState(false);
    const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
    const [comparisonMenuOpen, setComparisonMenuOpen] = useState(false);
    const [vatMode, setVatMode] = useState<VatMode>('incl');
    const [report, setReport] = useState<SalesReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const periodMenuRef = useRef<HTMLDivElement>(null);
    const comparisonMenuRef = useRef<HTMLDivElement>(null);

    const barTimezone = bars.find((bar) => bar.id === barId)?.timezone || browserTimezone;
    const today = dateInTimezone(new Date(), barTimezone);
    const selectedRange = periodPreset === 'custom' ? customRange : getPeriodDateRange(periodPreset, today);
    const effectiveRange = capDateRangeAt(selectedRange, today);
    const { startDate, endDate } = effectiveRange ?? selectedRange;
    const previousRange = effectiveRange
        ? comparisonPreset === 'previous-period'
            ? getPreviousDateRange(periodPreset, effectiveRange)
            : getPreviousYearDateRange(effectiveRange)
        : null;
    const selectedPeriodLabel = periodPreset === 'custom'
        ? 'Custom'
        : PERIOD_OPTIONS.find((option) => option.value === periodPreset)?.label ?? 'This month';
    const selectedComparisonLabel = comparisonPreset === 'previous-period' ? 'Previous period' : 'Previous year';
    const previousPeriodRange = getPreviousDateRange(periodPreset, selectedRange);
    const previousYearRange = getPreviousYearDateRange(selectedRange);

    useEffect(() => {
        const closeMenus = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!periodMenuRef.current?.contains(target)) setPeriodMenuOpen(false);
            if (!comparisonMenuRef.current?.contains(target)) setComparisonMenuOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setPeriodMenuOpen(false);
                setComparisonMenuOpen(false);
            }
        };
        document.addEventListener('pointerdown', closeMenus);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeMenus);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    useEffect(() => {
        fetch('/api/bars/all')
            .then(async (response) => {
                if (!response.ok) throw new Error('Failed to load bars.');
                setBars(await response.json());
            })
            .catch(() => setError('Failed to load bars.'));
    }, []);

    useEffect(() => {
        if (!barId || !effectiveRange || !previousRange || !startDate || !endDate || startDate > endDate) {
            setReport(null);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        const params = new URLSearchParams({ barId, startDate, endDate, grouping });
        params.set('previousStartDate', previousRange.startDate);
        params.set('previousEndDate', previousRange.endDate);
        setLoading(true);
        setError('');
        fetch(`/api/sales-report?${params}`, { signal: controller.signal })
            .then(async (response) => {
                if (controller.signal.aborted) return;
                const body = await response.json();
                if (controller.signal.aborted) return;
                if (!response.ok) throw new Error(body.error ?? 'Failed to load sales report.');
                setReport(body);
            })
            .catch((cause: unknown) => {
                if (controller.signal.aborted) return;
                setReport(null);
                setError(cause instanceof Error ? cause.message : 'Failed to load sales report.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [barId, effectiveRange !== null, endDate, grouping, previousRange?.endDate, previousRange?.startDate, startDate]);

    const currentReport =
        effectiveRange !== null &&
            previousRange !== null &&
            report?.barId === barId &&
            report.startDate === startDate &&
            report.endDate === endDate &&
            report.grouping === grouping &&
            report.previous?.startDate === previousRange.startDate &&
            report.previous.endDate === previousRange.endDate
            ? report
            : null;
    const tillByBucket = new Map(currentReport?.tillBuckets.map((bucket) => [bucket.startDate, bucket]) ?? []);
    const reportTotals = currentReport
        ? summarizeReportTotals(currentReport.buckets, currentReport.tillBuckets)
        : null;
    const previousTotals = currentReport?.previous
        ? summarizeReportTotals(currentReport.previous.buckets, currentReport.previous.tillBuckets)
        : null;
    const hasSalesData = currentReport?.buckets.some((bucket) => bucket.hasData) ?? false;
    const hasPreviousSalesData = currentReport?.previous?.buckets.some((bucket) => bucket.hasData) ?? false;
    const hasTillData = currentReport?.tillBuckets.some((bucket) => bucket.hasData) ?? false;
    const hasPreviousTillData = currentReport?.previous?.tillBuckets.some((bucket) => bucket.hasData) ?? false;
    const chartData = (currentReport?.buckets ?? []).map((bucket) => {
        const till = tillByBucket.get(bucket.startDate);
        const sumupSalesMinor = vatMode === 'incl' ? bucket.salesInclTaxMinor : bucket.salesExclTaxMinor;
        const flopiTillMinor = till?.total ?? 0;
        return {
            ...bucket,
            sumupSalesMinor,
            flopiTillMinor,
            totalMinor: sumupSalesMinor + flopiTillMinor,
            source: sourceLabel(bucket.hasData, till?.hasData ?? false),
            label: rangeLabel(bucket),
        };
    });

    const totalMinor = reportTotals
        ? (vatMode === 'incl'
            ? reportTotals.totalInclTaxMinor
            : reportTotals.salesExclTaxMinor + reportTotals.tillTotalMinor)
        : 0;
    const previousTotalMinor = previousTotals
        ? (vatMode === 'incl'
            ? previousTotals.totalInclTaxMinor
            : previousTotals.salesExclTaxMinor + previousTotals.tillTotalMinor)
        : 0;
    const averageSpendMinor = reportTotals?.customerCount
        ? Math.round(totalMinor / reportTotals.customerCount)
        : null;
    const previousAverageSpendMinor = previousTotals?.customerCount
        ? Math.round(previousTotalMinor / previousTotals.customerCount)
        : null;

    function exportReport() {
        if (!currentReport || !reportTotals || !previousTotals) return;

        const comparisonRows = [
            ['Metric', 'Selected period', selectedComparisonLabel],
            ['Date range', `${startDate} - ${endDate}`, `${currentReport.previous?.startDate ?? ''} - ${currentReport.previous?.endDate ?? ''}`],
            [`Total (${vatMode === 'incl' ? 'incl.' : 'excl.'} VAT)`, totalMinor / 100, previousTotalMinor / 100],
            ['Average sales per customer', averageSpendMinor === null ? null : averageSpendMinor / 100, previousAverageSpendMinor === null ? null : previousAverageSpendMinor / 100],
            ['Customers', reportTotals.customerCount, previousTotals.customerCount],
        ];
        const detailRows = currentReport.buckets.map((bucket) => {
            const till = tillByBucket.get(bucket.startDate);
            const sumupInclMinor = bucket.hasData ? bucket.salesInclTaxMinor : 0;
            const sumupExclMinor = bucket.hasData ? bucket.salesExclTaxMinor : 0;
            const flopiMinor = till?.total ?? 0;
            const selectedSumUpMinor = vatMode === 'incl' ? sumupInclMinor : sumupExclMinor;
            const customers = bucket.customers + (till?.customerCount ?? 0);
            return {
                Period: rangeLabel(bucket),
                Source: sourceLabel(bucket.hasData, till?.hasData ?? false),
                Total: (selectedSumUpMinor + flopiMinor) / 100,
                'Average sales per customer': customers > 0 ? (selectedSumUpMinor + flopiMinor) / customers / 100 : null,
                Customers: customers,
                'SumUp incl. VAT': bucket.hasData ? sumupInclMinor / 100 : null,
                'SumUp excl. VAT': bucket.hasData ? sumupExclMinor / 100 : null,
                'SumUp customers': bucket.hasData ? bucket.customers : null,
                'Flopi cash': till?.hasData ? till.totalCash / 100 : null,
                'Flopi card': till?.hasData ? till.totalCard / 100 : null,
                'Flopi total': till?.hasData ? flopiMinor / 100 : null,
                'Flopi customers': till?.hasData ? till.customerCount : null,
            };
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(comparisonRows), 'Summary');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'Report');
        const barName = bars.find((bar) => bar.id === barId)?.name ?? 'sales';
        const filename = `${barName}-${startDate}-to-${endDate}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
        XLSX.writeFile(workbook, `${filename}.xlsx`);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
                    <p className="mt-1 text-sm text-gray-500">Total sales and average sales per customer</p>
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
                                <option key={bar.id} value={bar.id}>
                                    {bar.name}
                                </option>
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

            <section aria-label="Report filters" className="space-y-4 border-y border-gray-200 py-4">
                <div className="flex flex-wrap items-start gap-3">
                    <div ref={periodMenuRef} className="relative">
                        <button
                            type="button"
                            aria-label={`Date period: ${selectedPeriodLabel}`}
                            aria-expanded={periodMenuOpen}
                            aria-controls="sales-period-options"
                            onClick={() => setPeriodMenuOpen((open) => !open)}
                            className="inline-flex min-h-12 min-w-44 items-center justify-between gap-5 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                        >
                            {selectedPeriodLabel}
                            <PickerChevron open={periodMenuOpen} />
                        </button>
                        {periodMenuOpen && (
                            <fieldset
                                id="sales-period-options"
                                role="radiogroup"
                                aria-label="Date period"
                                className="absolute left-0 top-full z-30 mt-1 max-h-[min(70vh,34rem)] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
                            >
                                <legend className="sr-only">Date period</legend>
                                {PERIOD_OPTIONS.map((option) => (
                                    <RadioPickerOption
                                        key={option.value}
                                        name="sales-period-picker"
                                        value={option.value}
                                        selected={periodPreset === option.value}
                                        label={option.label}
                                        description={periodDescription(option.value, today)}
                                        onSelect={() => {
                                            setPeriodPreset(option.value);
                                            setPeriodMenuOpen(false);
                                        }}
                                    />
                                ))}
                                <RadioPickerOption
                                    name="sales-period-picker"
                                    value="custom"
                                    selected={periodPreset === 'custom'}
                                    label="Custom"
                                    description="Pick a custom day and time"
                                    onSelect={() => {
                                        setCustomRange(selectedRange);
                                        setPeriodPreset('custom');
                                        setPeriodMenuOpen(false);
                                    }}
                                />
                            </fieldset>
                        )}
                    </div>

                    <div ref={comparisonMenuRef} className="relative">
                        <button
                            type="button"
                            aria-label={`Comparison period: ${selectedComparisonLabel}`}
                            aria-expanded={comparisonMenuOpen}
                            aria-controls="sales-comparison-options"
                            onClick={() => setComparisonMenuOpen((open) => !open)}
                            className="inline-flex min-h-12 min-w-56 items-center justify-between gap-5 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                        >
                            {selectedComparisonLabel}
                            <PickerChevron open={comparisonMenuOpen} />
                        </button>
                        {comparisonMenuOpen && (
                            <fieldset
                                id="sales-comparison-options"
                                role="radiogroup"
                                aria-label="Comparison period"
                                className="absolute left-0 top-full z-30 mt-1 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
                            >
                                <legend className="sr-only">Comparison period</legend>
                                <RadioPickerOption
                                    name="sales-comparison-picker"
                                    value="previous-period"
                                    selected={comparisonPreset === 'previous-period'}
                                    label="Previous period"
                                    description={`${formatDateInput(previousPeriodRange.startDate)} - ${formatDateInput(previousPeriodRange.endDate)}`}
                                    onSelect={() => {
                                        setComparisonPreset('previous-period');
                                        setComparisonMenuOpen(false);
                                    }}
                                />
                                <RadioPickerOption
                                    name="sales-comparison-picker"
                                    value="previous-year"
                                    selected={comparisonPreset === 'previous-year'}
                                    label="Previous year"
                                    description={`${formatDateInput(previousYearRange.startDate)} - ${formatDateInput(previousYearRange.endDate)}`}
                                    onSelect={() => {
                                        setComparisonPreset('previous-year');
                                        setComparisonMenuOpen(false);
                                    }}
                                />
                            </fieldset>
                        )}
                    </div>
                </div>

                {periodPreset === 'custom' && (
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="grid gap-1 text-xs font-medium text-gray-600">
                            From
                            <input
                                aria-label="From date"
                                type="date"
                                value={startDate}
                                max={endDate}
                                onChange={(event) => setCustomRange({ startDate: event.target.value, endDate })}
                                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-gray-600">
                            To
                            <input
                                aria-label="To date"
                                type="date"
                                value={endDate}
                                min={startDate}
                                onChange={(event) => setCustomRange({ startDate, endDate: event.target.value })}
                                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            />
                        </label>
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-4">
                    <label className="grid gap-1 text-xs font-medium text-gray-600">
                        Group by
                        <select
                            aria-label="Group by"
                            value={grouping}
                            onChange={(event) => setGrouping(event.target.value as SalesGrouping)}
                            className="min-w-36 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                        >
                            {GROUPINGS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2 pb-2 text-sm font-medium text-gray-700">
                        <input
                            aria-label="Source"
                            role="switch"
                            type="checkbox"
                            checked={showSource}
                            onChange={(event) => setShowSource(event.target.checked)}
                            className="size-4 accent-teal-700"
                        />
                        Source
                    </label>
                    <fieldset className="grid gap-1">
                        <legend className="text-xs font-medium text-gray-600">SumUp VAT</legend>
                        <div role="radiogroup" aria-label="SumUp VAT basis" className="flex overflow-hidden rounded-md border border-gray-300">
                            {(['excl', 'incl'] as const).map((mode) => (
                                <label
                                    key={mode}
                                    className={`cursor-pointer px-3 py-2 text-sm ${vatMode === mode ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                >
                                    <input
                                        type="radio"
                                        name="vatMode"
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
                    <span className="pb-2 text-xs text-gray-500">
                        SumUp through {formatDateInput(SUMUP_SOURCE_END_DATE)}; Flopi from {formatDateInput(FLOPI_SOURCE_START_DATE)}.
                    </span>
                </div>
            </section>

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {!barId && <p className="text-sm text-gray-500">Select a bar to view its SumUp sales.</p>}
            {barId && !effectiveRange && (
                <p role="status" className="text-sm text-gray-500">
                    This selected period starts after today. There are no dates to show yet.
                </p>
            )}
            {barId && loading && <p className="text-sm text-gray-500">Loading sales…</p>}

            {currentReport && !loading && (
                <>
                    <p className="text-sm text-gray-600">
                        Showing {startDate} to {endDate} ({currentReport.timezone}). Total combines the available SumUp and Flopi records.
                    </p>
                    {selectedRange.endDate > today && (
                        <p className="text-sm text-gray-500">
                            Future dates are omitted; data is shown through {formatDateInput(today)}.
                        </p>
                    )}
                    {currentReport.previous && (
                        <p className="text-sm text-gray-600">
                            {selectedComparisonLabel}: {formatDateInput(currentReport.previous.startDate)} - {formatDateInput(currentReport.previous.endDate)}
                        </p>
                    )}
                    {reportTotals && previousTotals && currentReport.previous && (
                        <section aria-label="Period total comparison" className="grid gap-3 sm:grid-cols-3">
                            <article className="rounded-md border border-gray-200 bg-white p-4">
                                <h2 className="text-xs font-medium uppercase text-gray-500">Total</h2>
                                <p className="mt-2 text-xl font-semibold text-gray-900">
                                    {hasSalesData || hasTillData ? formatMoney(totalMinor, currentReport.currency) : 'No data'}
                                </p>
                                <p className="mt-1 text-sm text-gray-500">
                                    {selectedComparisonLabel}:{' '}
                                    {hasPreviousSalesData || hasPreviousTillData
                                        ? formatMoney(previousTotalMinor, currentReport.currency)
                                        : 'No data'}
                                </p>
                            </article>
                            <article className="rounded-md border border-gray-200 bg-white p-4">
                                <h2 className="text-xs font-medium uppercase text-gray-500">Av. sales per customer</h2>
                                <p className="mt-2 text-xl font-semibold text-gray-900">
                                    {averageSpendMinor === null ? 'No data' : formatMoney(averageSpendMinor, currentReport.currency)}
                                </p>
                                <p className="mt-1 text-sm text-gray-500">
                                    {selectedComparisonLabel}:{' '}
                                    {previousAverageSpendMinor === null
                                        ? 'No data'
                                        : formatMoney(previousAverageSpendMinor, currentReport.currency)}
                                </p>
                            </article>
                            <article className="rounded-md border border-gray-200 bg-white p-4">
                                <h2 className="text-xs font-medium uppercase text-gray-500">Customers</h2>
                                <p className="mt-2 text-xl font-semibold text-gray-900">
                                    {hasSalesData || hasTillData ? reportTotals.customerCount.toLocaleString() : 'No data'}
                                </p>
                                <p className="mt-1 text-sm text-gray-500">
                                    {selectedComparisonLabel}:{' '}
                                    {hasPreviousSalesData || hasPreviousTillData
                                        ? previousTotals.customerCount.toLocaleString()
                                        : 'No data'}
                                </p>
                            </article>
                        </section>
                    )}
                    <section aria-label="Gross sales chart" className="border-b border-gray-200 pb-5">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="font-semibold text-gray-900">Total</h2>
                            <p className="text-xs text-gray-500">Each bucket label is clipped to the selected range.</p>
                        </div>
                        <div className="h-80 w-full" role="img" aria-label={showSource ? 'Sales total by source' : 'Total sales'}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                                    <CartesianGrid vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                                    <YAxis
                                        width={88}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value: number) => formatMoney(value, currentReport.currency)}
                                    />
                                    <Tooltip
                                        labelFormatter={(_label, payload) => {
                                            const bucket = payload[0]?.payload as BucketRange | undefined;
                                            return bucket ? rangeLabel(bucket) : '';
                                        }}
                                        formatter={(value, name) => [
                                            formatMoney(Number(value), currentReport.currency),
                                            name,
                                        ]}
                                    />
                                    {showSource ? (
                                        <>
                                            <Legend />
                                            <Bar
                                                dataKey="sumupSalesMinor"
                                                name={`SumUp ${vatMode === 'incl' ? 'incl.' : 'excl.'} VAT`}
                                                fill="#087f8c"
                                                maxBarSize={40}
                                            />
                                            <Bar dataKey="flopiTillMinor" name="Flopi" fill="#d97706" maxBarSize={40} />
                                        </>
                                    ) : (
                                        <Bar dataKey="totalMinor" name="Total" fill="#087f8c" maxBarSize={40} />
                                    )}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section aria-label="Sales data table" className="overflow-x-auto">
                        <table className={`w-full ${showSource ? 'min-w-[640px]' : 'min-w-[420px]'} text-sm`}>
                            <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="px-3 py-3 font-medium">Selected dates</th>
                                    <th className="px-3 py-3 text-right font-medium">Total</th>
                                    <th className="px-3 py-3 text-right font-medium">Customers</th>
                                    <th className="px-3 py-3 text-right font-medium">Av. sales per customer</th>
                                    {showSource && <th className="px-3 py-3 text-right font-medium">Source</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {currentReport.buckets.map((bucket) => {
                                    const till = tillByBucket.get(bucket.startDate);
                                    const sumupSalesMinor = vatMode === 'incl'
                                        ? bucket.salesInclTaxMinor
                                        : bucket.salesExclTaxMinor;
                                    const flopiTotalMinor = till?.total ?? 0;
                                    const bucketTotalMinor = sumupSalesMinor + flopiTotalMinor;
                                    const customerCount = bucket.customers + (till?.customerCount ?? 0);
                                    return (
                                        <tr key={bucket.startDate} className="hover:bg-gray-50">
                                            <td className="px-3 py-3 text-gray-700">{rangeLabel(bucket)}</td>
                                            <td className="px-3 py-3 text-right font-medium text-gray-900">
                                                {bucket.hasData || till?.hasData
                                                    ? formatMoney(bucketTotalMinor, currentReport.currency)
                                                    : 'No data'}
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-700">
                                                {customerCount > 0 ? customerCount.toLocaleString() : 'No data'}
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-700">
                                                {customerCount > 0
                                                    ? formatMoney(Math.round(bucketTotalMinor / customerCount), currentReport.currency)
                                                    : 'No data'}
                                            </td>
                                            {showSource && (
                                                <td className="px-3 py-3 text-right text-gray-700">
                                                    {sourceLabel(bucket.hasData, till?.hasData ?? false)}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </section>
                </>
            )}
        </div>
    );
}