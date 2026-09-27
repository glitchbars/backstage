import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    orderSession: {
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
const mockFindUnique = vi.mocked(prisma.orderSession.findUnique);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

const params = { params: Promise.resolve({ id: 's1' }) };

function makeRequest() {
  return new NextRequest('http://localhost/api/orders/s1');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/orders/[id]', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeRequest(), params);

    expect(res.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown order', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), params);

    expect(res.status).toBe(404);
  });

  it('returns the order with lines, payments and corrections', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const order = { id: 's1', lines: [], payments: [], paymentCorrections: [] };
    mockFindUnique.mockResolvedValue(order as never);

    const res = await GET(makeRequest(), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(order);
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }));
  });

  it('keeps voided lines so the detail view can show them', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ id: 's1' } as never);

    await GET(makeRequest(), params);

    const include = mockFindUnique.mock.calls[0][0]?.include as { lines: { where?: unknown } };
    expect(include.lines.where).toBeUndefined();
  });

  it('includes the line links needed to show what each payment covered', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue({ id: 's1' } as never);

    await GET(makeRequest(), params);

    const include = mockFindUnique.mock.calls[0][0]?.include as {
      payments: { include: { lineLinks: unknown } };
    };
    expect(include.payments.include.lineLinks).toEqual({ select: { orderLineId: true } });
  });
});
