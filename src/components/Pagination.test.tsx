import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders nothing when there is only one page', () => {
    const { container } = render(
      <Pagination page={1} pageSize={20} total={10} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when total equals pageSize exactly', () => {
    const { container } = render(
      <Pagination page={1} pageSize={20} total={20} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when there are multiple pages', () => {
    render(<Pagination page={1} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('disables Previous button on first page', () => {
    render(<Pagination page={1} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('Previous')).toBeDisabled();
  });

  it('disables Next button on last page', () => {
    render(<Pagination page={3} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('calls onPageChange with page - 1 when Previous is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={20} total={50} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByText('Previous'));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange with page + 1 when Next is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={20} total={50} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByText('Next'));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('displays the correct range label', () => {
    render(<Pagination page={2} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('Showing 21–40 of 50')).toBeInTheDocument();
  });

  it('clamps the end of range to total on the last page', () => {
    render(<Pagination page={3} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('Showing 41–50 of 50')).toBeInTheDocument();
  });

  it('displays the current page and total pages', () => {
    render(<Pagination page={2} pageSize={20} total={60} onPageChange={vi.fn()} />);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });
});
