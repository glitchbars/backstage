import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    menuItem: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindMany = vi.mocked(prisma.menuItem.findMany);
const mockCount = vi.mocked(prisma.menuItem.count);
const mockCreate = vi.mocked(prisma.menuItem.create);

const ADMIN_SESSION = { session: { user: { role: 'ADMIN' } } };
const UNAUTH_RESPONSE = { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

function makeRequest(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

const BASE_URL = 'http://localhost/api/menu-items';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/menu-items', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);
    const res = await GET(makeRequest(BASE_URL));
    expect(res.status).toBe(401);
  });

  it('returns paginated results with bar and category', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const fakeItems = [
      { id: 'i1', name: 'Beer', bar: { name: 'Bar A' }, category: { name: 'Drinks' } },
    ];
    mockFindMany.mockResolvedValue(fakeItems as never);
    mockCount.mockResolvedValue(1);

    const res = await GET(makeRequest(BASE_URL));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: fakeItems, total: 1, page: 1, pageSize: 20 });
  });

  it('filters by barId when provided', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest(`${BASE_URL}?barId=bar-xyz`));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ barId: 'bar-xyz' }) }),
    );
  });

  it('does not filter by barId when absent', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest(BASE_URL));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
});

describe('POST /api/menu-items', () => {
  const validBody = {
    barId: 'b1',
    categoryId: 'cat-1',
    name: 'Beer',
    priceAmountMinor: 500,
    costAmountMinor: 200,
    currency: 'USD',
    taxRateBps: 800,
  };

  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);
    const res = await POST(
      makeRequest(BASE_URL, { method: 'POST', body: JSON.stringify(validBody) }),
    );
    expect(res.status).toBe(401);
  });

  it('creates item and returns 201', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const created = { id: 'i1', ...validBody, bar: { name: 'Bar A' }, category: { name: 'Drinks' } };
    mockCreate.mockResolvedValue(created as never);

    const res = await POST(
      makeRequest(BASE_URL, {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual(created);
  });

  it('defaults taxIncluded to true and active to true', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCreate.mockResolvedValue({ id: 'i1' } as never);

    await POST(
      makeRequest(BASE_URL, {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxIncluded: true, active: true }),
      }),
    );
  });

  it('defaults description to null when not provided', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCreate.mockResolvedValue({ id: 'i1' } as never);

    await POST(
      makeRequest(BASE_URL, {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: null }),
      }),
    );
  });
});
