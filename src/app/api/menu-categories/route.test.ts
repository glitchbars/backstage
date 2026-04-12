import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    menuCategory: {
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
const mockFindMany = vi.mocked(prisma.menuCategory.findMany);
const mockCount = vi.mocked(prisma.menuCategory.count);
const mockCreate = vi.mocked(prisma.menuCategory.create);

const ADMIN_SESSION = { session: { user: { role: 'ADMIN' } } };
const UNAUTH_RESPONSE = { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

function makeRequest(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/menu-categories', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeRequest('http://localhost/api/menu-categories'));

    expect(res.status).toBe(401);
  });

  it('returns paginated results', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const fakeData = [{ id: '1', name: 'Drinks', bar: { name: 'Bar A' } }];
    mockFindMany.mockResolvedValue(fakeData as never);
    mockCount.mockResolvedValue(1);

    const res = await GET(makeRequest('http://localhost/api/menu-categories'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: fakeData, total: 1, page: 1, pageSize: 20 });
  });

  it('filters by barId when provided', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest('http://localhost/api/menu-categories?barId=bar-123'));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ barId: 'bar-123' }) }),
    );
  });

  it('clamps page to minimum 1 for invalid values', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0);

    const res = await GET(makeRequest('http://localhost/api/menu-categories?page=0'));
    const body = await res.json();

    expect(body.page).toBe(1);
  });

  it('respects custom page and pageSize', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0);

    const res = await GET(makeRequest('http://localhost/api/menu-categories?page=3&pageSize=5'));
    const body = await res.json();

    expect(body.page).toBe(3);
    expect(body.pageSize).toBe(5);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 5 }));
  });
});

describe('POST /api/menu-categories', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await POST(
      makeRequest('http://localhost/api/menu-categories', {
        method: 'POST',
        body: JSON.stringify({ barId: 'b1', name: 'Drinks' }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it('creates a category and returns 201', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const created = { id: 'cat-1', name: 'Drinks', barId: 'b1', sortOrder: 0, bar: { name: 'Bar A' } };
    mockCreate.mockResolvedValue(created as never);

    const res = await POST(
      makeRequest('http://localhost/api/menu-categories', {
        method: 'POST',
        body: JSON.stringify({ barId: 'b1', name: 'Drinks' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual(created);
  });

  it('defaults sortOrder to 0 when not provided', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCreate.mockResolvedValue({ id: 'cat-1', name: 'Food', sortOrder: 0, bar: { name: 'Bar A' } } as never);

    await POST(
      makeRequest('http://localhost/api/menu-categories', {
        method: 'POST',
        body: JSON.stringify({ barId: 'b1', name: 'Food' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) }),
    );
  });
});
