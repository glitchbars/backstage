import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from './route';

const txBarMembership = {
  deleteMany: vi.fn(),
  create: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  prisma: {
    barMembership: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindMany = vi.mocked(prisma.barMembership.findMany);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

function makeGet(url: string) {
  return new NextRequest(url);
}

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/bar-memberships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  txBarMembership.deleteMany.mockResolvedValue({ count: 0 });
  txBarMembership.create.mockResolvedValue({ id: 'm1' });
  // Run the interactive transaction callback against a stub client.
  mockTransaction.mockImplementation(((fn: (tx: unknown) => unknown) =>
    fn({ barMembership: txBarMembership })) as never);
});

describe('GET /api/bar-memberships', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeGet('http://localhost/api/bar-memberships'));

    expect(res.status).toBe(401);
  });

  it('filters by barId', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);

    await GET(makeGet('http://localhost/api/bar-memberships?barId=bar-1'));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barId: 'bar-1' } }),
    );
  });
});

describe('POST /api/bar-memberships', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await POST(makePost({ barId: 'b1', userId: 'u1', role: 'BARBACK' }));

    expect(res.status).toBe(401);
  });

  it('rejects a missing role', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const res = await POST(makePost({ barId: 'b1', userId: 'u1' }));

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects a role outside BAR_ROLE', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const res = await POST(makePost({ barId: 'b1', userId: 'u1', role: 'ADMIN' }));

    expect(res.status).toBe(400);
  });

  it('returns 404 when the user does not exist', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue(null as never);

    const res = await POST(makePost({ barId: 'b1', userId: 'nope', role: 'BARBACK' }));

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('removes any existing membership before creating the new one', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: 'u1' } as never);

    const res = await POST(makePost({ barId: 'b2', userId: 'u1', role: 'MIXOLOGIST' }));

    expect(res.status).toBe(201);
    expect(txBarMembership.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(txBarMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { barId: 'b2', userId: 'u1', role: 'MIXOLOGIST' } }),
    );
    // The delete has to happen first, or the unique [barId, userId] pair can collide.
    expect(txBarMembership.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      txBarMembership.create.mock.invocationCallOrder[0],
    );
  });
});
