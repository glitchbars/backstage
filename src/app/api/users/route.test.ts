import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindMany = vi.mocked(prisma.user.findMany);
const mockCount = vi.mocked(prisma.user.count);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

function makeRequest(url: string) {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([] as never);
  mockCount.mockResolvedValue(0);
});

describe('GET /api/users', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeRequest('http://localhost/api/users'));

    expect(res.status).toBe(401);
  });

  it('defaults to admins plus anyone holding a bar membership', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest('http://localhost/api/users'));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ role: 'ADMIN' }, { barMemberships: { some: {} } }] },
      }),
    );
  });

  it('scopes to a single bar when barId is given', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest('http://localhost/api/users?barId=bar-1'));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barMemberships: { some: { barId: 'bar-1' } } } }),
    );
  });

  it('searches by exact email, overriding the staff filter', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    await GET(makeRequest('http://localhost/api/users?q=nina%40glitchbars.com&barId=bar-1'));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'nina@glitchbars.com' } }),
    );
  });

  it('returns a paginated envelope', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const fakeData = [{ id: 'u1', email: 'a@b.com', role: 'ADMIN', barMemberships: [] }];
    mockFindMany.mockResolvedValue(fakeData as never);
    mockCount.mockResolvedValue(1);

    const res = await GET(makeRequest('http://localhost/api/users'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: fakeData, total: 1, page: 1, pageSize: 20 });
  });
});
