// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BarFilterProvider } from '@/components/BarFilterContext';
import type { CocktailPerformanceReport, PerformanceMetrics } from '@/lib/cocktail-performance';
import Page from './page';

const metrics: PerformanceMetrics = {
    quantity: 10,
    salesInclTaxMinor: 10000,
    salesExclTaxMinor: 9000,
    discountMinor: 100,
    eligibleOrders: 8,
    repeatOrders: 2,
    repeatCount: 4,
    repeatRounds: 3,
    repeatDistribution: [
        { repeats: 0, orders: 6 },
        { repeats: 1, orders: 1 },
        { repeats: 2, orders: 1 },
    ],
    beerOrders: 1,
    repeatRate: 25,
    beerRate: 12.5,
    quantityRank: 1,
    salesInclRank: 1,
    salesExclRank: 1,
};
const cocktail = { key: 'menu:cocktail', name: 'Margarita', category: 'Cocktails' };
const beer = { key: 'menu:beer', name: 'Caña Estrella', category: 'Beer' };
const report: CocktailPerformanceReport = {
    barId: 'bar-1',
    timezone: 'Europe/Madrid',
    startDate: '2026-10-01',
    endDate: '2026-10-22',
    categories: ['Cocktails', 'Beer'],
    selectedCategories: ['Cocktails'],
    currencies: ['EUR'],
    choices: [cocktail, beer],
    comparisonBeers: [beer],
    cocktailOrders: { period: 8, allTime: 80 },
    combos: [
        {
            key: 'pair',
            drinks: [cocktail, beer],
            period: { orders: 2, share: 25 },
            allTime: { orders: 20, share: 25 },
        },
    ],
    salesAvailableFrom: '2026-01-01T00:00:00Z',
    repeatAvailableFrom: '2026-01-02T00:00:00Z',
    products: [
        {
            ...cocktail,
            period: metrics,
            allTime: { ...metrics, quantity: 100, repeatCount: 40, repeatRounds: 30 },
        },
    ],
};
const fetchMock = vi.fn();
function respond(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
}
function renderPage() {
    return render(
        <BarFilterProvider>
            <Page />
        </BarFilterProvider>,
    );
}
async function ready() {
    return screen.findByRole('region', { name: 'Repeats table' });
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('backstage.selectedBar.v1', 'bar-1');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: string) => {
        if (input === '/api/bars/all')
            return respond([
                { id: 'bar-1', name: 'First bar', timezone: 'Europe/Madrid' },
                { id: 'bar-2', name: 'Second bar', timezone: 'Europe/Madrid' },
            ]);
        const params = new URL(input, 'http://localhost').searchParams;
        const empty = params.get('categories') === '[]';
        return respond({
            ...report,
            barId: params.get('barId'),
            selectedCategories: empty ? [] : ['Cocktails'],
            products: empty ? [] : report.products,
        });
    });
});
afterEach(() => vi.unstubAllGlobals());

describe('Cocktail Performance page', () => {
    it('opens directly on repeat counts and a per-order breakdown without beer configuration', async () => {
        renderPage();
        const table = await ready();
        expect(screen.getByLabelText('Bar')).toHaveValue('bar-1');
        expect(within(table).getByText('Extra cocktails')).toBeInTheDocument();
        expect(within(table).getByText('Repeat rounds (estimated)')).toBeInTheDocument();
        expect(within(table).getByText('3')).toBeInTheDocument();
        expect(within(table).getByText('4')).toBeInTheDocument();
        const breakdown = within(table).getByRole('list', { name: 'Margarita repeat breakdown' });
        expect(within(breakdown).getByText('2 repeat rounds')).toBeInTheDocument();
        expect(within(breakdown).getAllByText('1 order')).toHaveLength(2);
        expect(screen.queryByLabelText('Beer products')).not.toBeInTheDocument();
        expect(screen.queryByText(/10 minutes/)).not.toBeInTheDocument();
        const params = new URL(fetchMock.mock.lastCall![0], 'http://localhost').searchParams;
        expect(params.has('categories')).toBe(false);
        expect(params.has('beerKeys')).toBe(false);
    });

    it('shows only the fixed caña comparison and lets users inspect popular pairs', async () => {
        renderPage();
        await ready();
        await userEvent.click(screen.getByRole('tab', { name: 'Caña follow-ups' }));
        expect(screen.getByText('Compared only with Caña Estrella.')).toBeInTheDocument();
        expect(screen.getByText('12.5%')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('tab', { name: 'Popular combos' }));
        const combos = screen.getByRole('region', { name: 'Popular combos table' });
        expect(within(combos).getByText('Margarita + Caña Estrella')).toBeInTheDocument();
        expect(within(combos).getByText('2')).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText('All time'));
        expect(within(combos).getByText('20')).toBeInTheDocument();
    });

    it('shows one later bulk round separately from eight extra cocktails', async () => {
        fetchMock.mockImplementation(async (input: string) =>
            input === '/api/bars/all'
                ? respond([{ id: 'bar-1', name: 'First bar', timezone: 'Europe/Madrid' }])
                : respond({
                    ...report,
                    products: [
                        {
                            ...report.products[0],
                            period: {
                                ...metrics,
                                eligibleOrders: 1,
                                repeatOrders: 1,
                                repeatRounds: 1,
                                repeatCount: 8,
                                repeatDistribution: [{ repeats: 1, orders: 1 }],
                            },
                        },
                    ],
                }),
        );
        renderPage();
        const table = await ready();
        const cells = within(table).getAllByRole('cell');
        expect(cells.slice(0, 4).map((cell) => cell.textContent)).toEqual(['1', '1', '1', '8']);
        expect(within(table).getByText('1 repeat round')).toBeInTheDocument();
        expect(screen.getByText(/within one minute of the round's first item/)).toBeInTheDocument();
    });

    it('keeps rankings available separately and supports rolling date ranges', async () => {
        renderPage();
        await ready();
        await userEvent.click(screen.getByRole('tab', { name: 'Sales & rankings' }));
        const sales = screen.getByRole('region', { name: 'Sales & rankings table' });
        expect(within(sales).getByText('Period rank')).toBeInTheDocument();
        expect(within(sales).getByText('All-time rank')).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText('All time'));
        expect(within(sales).getByText('100')).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText('Date period'), 'last-6-months');
        await screen.findByRole('region', { name: 'Sales & rankings table' });
        const params = new URL(fetchMock.mock.lastCall![0], 'http://localhost').searchParams;
        expect(params.get('startDate')! < params.get('endDate')!).toBe(true);
    });

    it('uses category checkboxes and resets their overrides when changing bars', async () => {
        renderPage();
        await ready();
        await userEvent.click(screen.getByText('Cocktail categories (1)'));
        await userEvent.click(screen.getByRole('checkbox', { name: 'Cocktails' }));
        await screen.findByText('No cocktail categories selected.');
        await userEvent.selectOptions(screen.getByLabelText('Bar'), 'bar-2');
        await ready();
        const params = new URL(fetchMock.mock.lastCall![0], 'http://localhost').searchParams;
        expect(params.has('categories')).toBe(false);
    });

    it('shows API errors with retry and rejects invalid custom ranges locally', async () => {
        renderPage();
        await ready();
        fetchMock.mockResolvedValueOnce(respond({ error: 'Report unavailable' }, 503));
        await userEvent.selectOptions(screen.getByLabelText('Date period'), 'last-2-months');
        expect(await screen.findByRole('alert')).toHaveTextContent('Report unavailable');
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await ready();
        await userEvent.selectOptions(screen.getByLabelText('Date period'), 'custom');
        fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2099-01-01' } });
        expect(screen.getByRole('alert')).toHaveTextContent('Enter valid dates');
    });

    it('does not display a late response under a newer date filter', async () => {
        renderPage();
        await ready();
        let resolveOld!: (response: Response) => void;
        fetchMock.mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    resolveOld = resolve;
                }),
        );
        await userEvent.selectOptions(screen.getByLabelText('Date period'), 'last-2-months');
        await userEvent.selectOptions(screen.getByLabelText('Date period'), 'last-3-months');
        await ready();
        resolveOld(
            respond({ ...report, products: [{ ...report.products[0], name: 'Stale cocktail' }] }),
        );
        await waitFor(() => expect(screen.queryByText('Stale cocktail')).not.toBeInTheDocument());
    });

    it('shows missing caña and empty-combo states without presenting another beer as a substitute', async () => {
        fetchMock.mockImplementation(async (input: string) =>
            input === '/api/bars/all'
                ? respond([{ id: 'bar-1', name: 'First bar', timezone: 'Europe/Madrid' }])
                : respond({ ...report, comparisonBeers: [], combos: [] }),
        );
        renderPage();
        await ready();
        await userEvent.click(screen.getByRole('tab', { name: 'Caña follow-ups' }));
        expect(screen.getByText(/Caña Estella was not found/)).toBeInTheDocument();
        expect(screen.queryByText('12.5%')).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('tab', { name: 'Popular combos' }));
        expect(screen.getByText('No cocktail combinations in this timeframe.')).toBeInTheDocument();
    });
});
