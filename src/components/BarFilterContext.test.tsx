// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BarFilterProvider, useBarFilter } from './BarFilterContext';

function Selection() {
    const { barId, setBarId } = useBarFilter();
    return (
        <select aria-label="Bar" value={barId} onChange={(event) => setBarId(event.target.value)}>
            <option value="">All bars</option>
            <option value="bar-1">First bar</option>
            <option value="bar-2">Second bar</option>
        </select>
    );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('bar persistence', () => {
    it('restores the last bar and persists changes and clearing', () => {
        localStorage.setItem('backstage.selectedBar.v1', 'bar-1');
        const view = render(
            <BarFilterProvider>
                <Selection />
            </BarFilterProvider>,
        );
        expect(screen.getByLabelText('Bar')).toHaveValue('bar-1');
        fireEvent.change(screen.getByLabelText('Bar'), { target: { value: 'bar-2' } });
        expect(localStorage.getItem('backstage.selectedBar.v1')).toBe('bar-2');
        view.unmount();
        render(
            <BarFilterProvider>
                <Selection />
            </BarFilterProvider>,
        );
        expect(screen.getByLabelText('Bar')).toHaveValue('bar-2');
        fireEvent.change(screen.getByLabelText('Bar'), { target: { value: '' } });
        expect(localStorage.getItem('backstage.selectedBar.v1')).toBe('');
    });

    it('keeps working when browser storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('Blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('Blocked');
        });
        render(
            <BarFilterProvider>
                <Selection />
            </BarFilterProvider>,
        );
        fireEvent.change(screen.getByLabelText('Bar'), { target: { value: 'bar-1' } });
        expect(screen.getByLabelText('Bar')).toHaveValue('bar-1');
    });
});
