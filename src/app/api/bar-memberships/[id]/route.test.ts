import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { PUT, DELETE } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    barMembership: {
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockUpdate = vi.mocked(prisma.barMembership.update);
const mockDelete = vi.mocked(prisma.barMembership.delete);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

function makeRequest(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/bar-memberships/m1', {
    method,
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
}

const params = { params: Promise.resolve({ id: 'm1' }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PUT /api/bar-memberships/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await PUT(makeRequest('PUT', { role: 'OWNER' }), params);

    expect(res.status).toBe(401);
  });

  it('rejects a role outside BAR_ROLE', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const res = await PUT(makeRequest('PUT', { role: 'ADMIN' }), params);

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates the bar role', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUpdate.mockResolvedValue({ id: 'm1', role: 'OWNER' } as never);

    const res = await PUT(makeRequest('PUT', { role: 'OWNER' }), params);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' }, data: { role: 'OWNER' } }),
    );
  });
});

describe('DELETE /api/bar-memberships/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await DELETE(makeRequest('DELETE'), params);

    expect(res.status).toBe(401);
  });

  it('deletes the membership row and returns 204', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDelete.mockResolvedValue({ id: 'm1' } as never);

    const res = await DELETE(makeRequest('DELETE'), params);

    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });
});
