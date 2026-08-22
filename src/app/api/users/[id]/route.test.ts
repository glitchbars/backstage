import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { PUT } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockUpdate = vi.mocked(prisma.user.update);
const mockCount = vi.mocked(prisma.user.count);
const mockSessionDeleteMany = vi.mocked(prisma.session.deleteMany);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/users/u1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = (id = 'u1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue({ id: 'u1' } as never);
  mockSessionDeleteMany.mockResolvedValue({ count: 0 } as never);
});

describe('PUT /api/users/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await PUT(makeRequest({ role: 'ADMIN' }), params());

    expect(res.status).toBe(401);
  });

  it('rejects an unknown role', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const res = await PUT(makeRequest({ role: 'SUPERUSER' }), params());

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(null as never);

    const res = await PUT(makeRequest({ role: 'ADMIN' }), params());

    expect(res.status).toBe(404);
  });

  it('refuses to let an admin demote themselves', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ role: 'ADMIN' } as never);

    const res = await PUT(makeRequest({ role: 'USER' }), params('admin-1'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/your own admin access/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses to demote the last remaining admin', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ role: 'ADMIN' } as never);
    mockCount.mockResolvedValue(1);

    const res = await PUT(makeRequest({ role: 'USER' }), params('u1'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/last remaining admin/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('deletes the user sessions when demoting', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ role: 'ADMIN' } as never);
    mockCount.mockResolvedValue(3);

    const res = await PUT(makeRequest({ role: 'USER' }), params('u1'));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { role: 'USER' } }),
    );
    expect(mockSessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('does not touch sessions when promoting', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ role: 'USER' } as never);

    const res = await PUT(makeRequest({ role: 'ADMIN' }), params('u1'));

    expect(res.status).toBe(200);
    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
  });

  it('stores an empty gamertag as null', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ role: 'USER' } as never);

    await PUT(makeRequest({ gamertag: '   ' }), params('u1'));

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { gamertag: null } }));
  });

  it('returns 409 when the gamertag is already taken', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ role: 'USER' } as never);
    mockUpdate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }) as never);

    const res = await PUT(makeRequest({ gamertag: 'taken' }), params('u1'));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already taken/i);
  });

  it('rethrows errors that are not unique-constraint violations', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ role: 'USER' } as never);
    mockUpdate.mockRejectedValue(new Error('connection lost') as never);

    await expect(PUT(makeRequest({ gamertag: 'nina' }), params('u1'))).rejects.toThrow(
      'connection lost',
    );
  });
});
