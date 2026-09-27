import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, PUT, DELETE } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    employeeShift: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindUnique = vi.mocked(prisma.employeeShift.findUnique);
const mockFindFirst = vi.mocked(prisma.employeeShift.findFirst);
const mockUpdate = vi.mocked(prisma.employeeShift.update);
const mockDelete = vi.mocked(prisma.employeeShift.delete);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

const params = { params: Promise.resolve({ id: 'sh1' }) };
const URL = 'http://localhost/api/shifts/sh1';

function makeRequest(options?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(URL, options);
}

function putBody(overrides: Record<string, unknown> = {}) {
  return makeRequest({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      barId: 'bar-1',
      employeeId: 'user-1',
      scheduledStart: '2026-09-01T16:00:00.000Z',
      scheduledEnd: '2026-09-01T23:00:00.000Z',
      status: 'SCHEDULED',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/shifts/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeRequest(), params);

    expect(res.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown shift', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), params);

    expect(res.status).toBe(404);
  });

  it('returns the shift', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ id: 'sh1' } as never);

    const res = await GET(makeRequest(), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'sh1' });
  });
});

describe('PUT /api/shifts/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await PUT(putBody(), params);

    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates the shift', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' } as never);
    mockFindFirst.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ id: 'sh1' } as never);

    const res = await PUT(putBody({ status: 'COMPLETED', role: '', notes: '' }), params);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sh1' },
        data: expect.objectContaining({ status: 'COMPLETED', role: null, notes: null }),
      }),
    );
  });

  it('rejects an unknown status', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const res = await PUT(putBody({ status: 'NONSENSE' }), params);

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('excludes the shift itself from the clash check', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' } as never);
    mockFindFirst.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ id: 'sh1' } as never);

    await PUT(putBody(), params);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'sh1' } }),
      }),
    );
  });

  it('returns 409 when the new hours clash with another shift', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' } as never);
    mockFindFirst.mockResolvedValue({ id: 'sh-other' } as never);

    const res = await PUT(putBody(), params);

    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/shifts/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await DELETE(makeRequest({ method: 'DELETE' }), params);

    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('hard-deletes the shift and returns 204', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDelete.mockResolvedValue({ id: 'sh1' } as never);

    const res = await DELETE(makeRequest({ method: 'DELETE' }), params);

    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'sh1' } });
  });
});
