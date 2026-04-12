import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { GET, PUT, DELETE } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    menuCategory: {
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
const mockFindUnique = vi.mocked(prisma.menuCategory.findUnique);
const mockUpdate = vi.mocked(prisma.menuCategory.update);

const ADMIN_SESSION = { session: { user: { role: 'ADMIN' } } };
const UNAUTH_RESPONSE = { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
const params = Promise.resolve({ id: 'cat-1' });

function makeRequest(method = 'GET', body?: object) {
  return new NextRequest(`http://localhost/api/menu-categories/cat-1`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/menu-categories/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when category not found', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('returns 404 when category is soft-deleted', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ id: 'cat-1', deletedAt: new Date() } as never);

    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('returns the category when found', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const category = { id: 'cat-1', name: 'Drinks', deletedAt: null, bar: { name: 'Bar A' } };
    mockFindUnique.mockResolvedValue(category as never);

    const res = await GET(makeRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(category);
  });
});

describe('PUT /api/menu-categories/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);
    const res = await PUT(makeRequest('PUT', { name: 'Updated' }), { params });
    expect(res.status).toBe(401);
  });

  it('updates and returns 200', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const updated = { id: 'cat-1', name: 'Updated', bar: { name: 'Bar A' } };
    mockUpdate.mockResolvedValue(updated as never);

    const res = await PUT(makeRequest('PUT', { barId: 'b1', name: 'Updated', sortOrder: 1 }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(updated);
  });
});

describe('DELETE /api/menu-categories/[id]', () => {
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

  it('returns 409 when category has active menu items (FK constraint)', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const fkError = new Prisma.PrismaClientKnownRequestError('FK constraint', {
      code: 'P2003',
      clientVersion: '5.0.0',
    });
    mockUpdate.mockRejectedValue(fkError);

    const res = await DELETE(makeRequest('DELETE'), { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/cannot delete/i);
  });
});
