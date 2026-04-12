import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, PUT, DELETE } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    menuItem: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindUnique = vi.mocked(prisma.menuItem.findUnique);
const mockUpdate = vi.mocked(prisma.menuItem.update);

const ADMIN_SESSION = { session: { user: { role: 'ADMIN' } } };
const UNAUTH_RESPONSE = { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
const params = Promise.resolve({ id: 'item-1' });

function makeRequest(method = 'GET', body?: object) {
  return new NextRequest(`http://localhost/api/menu-items/item-1`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/menu-items/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when item not found', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('returns 404 when item is soft-deleted', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ id: 'item-1', deletedAt: new Date() } as never);

    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('returns the item when found', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const item = {
      id: 'item-1',
      name: 'Beer',
      deletedAt: null,
      bar: { name: 'Bar A' },
      category: { name: 'Drinks' },
    };
    mockFindUnique.mockResolvedValue(item as never);

    const res = await GET(makeRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(item);
  });
});

describe('PUT /api/menu-items/[id]', () => {
  const updateBody = {
    barId: 'b1',
    categoryId: 'cat-1',
    name: 'Draft Beer',
    priceAmountMinor: 600,
    costAmountMinor: 250,
    currency: 'USD',
    taxRateBps: 800,
    taxIncluded: true,
    active: true,
  };

  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);
    const res = await PUT(makeRequest('PUT', updateBody), { params });
    expect(res.status).toBe(401);
  });

  it('updates and returns 200', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const updated = { id: 'item-1', ...updateBody, bar: { name: 'Bar A' }, category: { name: 'Drinks' } };
    mockUpdate.mockResolvedValue(updated as never);

    const res = await PUT(makeRequest('PUT', updateBody), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(updated);
  });
});

describe('DELETE /api/menu-items/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);
    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(401);
  });

  it('soft-deletes and returns 204', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUpdate.mockResolvedValue({} as never);

    const res = await DELETE(makeRequest('DELETE'), { params });

    expect(res.status).toBe(204);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
  });
});
