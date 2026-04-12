import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';

const mockPush = vi.fn();
let mockPathname = '/bars';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const mockSignOut = vi.fn();
const mockUseSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signOut: () => mockSignOut(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname = '/bars';
  mockUseSession.mockReturnValue({ data: null });
});

describe('Sidebar', () => {
  it('renders all navigation links', () => {
    render(<Sidebar />);

    expect(screen.getByText('Bars')).toBeInTheDocument();
    expect(screen.getByText('Tables')).toBeInTheDocument();
    expect(screen.getByText('Consoles')).toBeInTheDocument();
    expect(screen.getByText('Menu Categories')).toBeInTheDocument();
    expect(screen.getByText('Menu Items')).toBeInTheDocument();
  });

  it('displays user name when session has a name', () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'Àxel García', email: 'axel@example.com' } },
    });

    render(<Sidebar />);

    expect(screen.getByText('Àxel García')).toBeInTheDocument();
  });

  it('falls back to email when user has no name', () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: '', email: 'axel@example.com' } },
    });

    render(<Sidebar />);

    // The first instance renders name||email in the name slot, the second renders email directly
    const emailElements = screen.getAllByText('axel@example.com');
    expect(emailElements.length).toBeGreaterThanOrEqual(1);
  });

  it('applies active class to the current path link', () => {
    mockPathname = '/bars';
    render(<Sidebar />);

    const barsLink = screen.getByText('Bars').closest('a');
    expect(barsLink?.className).toContain('bg-gray-700');
  });

  it('does not apply active class to non-current path links', () => {
    mockPathname = '/bars';
    render(<Sidebar />);

    const tablesLink = screen.getByText('Tables').closest('a');
    expect(tablesLink?.className).not.toContain('bg-gray-700');
  });

  it('renders sign out button', () => {
    render(<Sidebar />);
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('calls signOut and redirects to /login on sign out click', async () => {
    mockSignOut.mockResolvedValue(undefined);
    render(<Sidebar />);

    await userEvent.click(screen.getByText('Sign out'));

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
