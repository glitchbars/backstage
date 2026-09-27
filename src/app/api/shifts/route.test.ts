import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    employeeShift: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
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
const mockFindMany = vi.mocked(prisma.employeeShift.findMany);
const mockCount = vi.mocked(prisma.employeeShift.count);
const mockFindFirst = vi.mocked(prisma.employeeShift.findFirst);
const mockCreate = vi.mocked(prisma.employeeShift.create);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);

const ADMIN_SESSION = { session: { user: { id: 'admin-1', role: 'ADMIN' } } } as never;
const UNAUTH_RESPONSE = {
  error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
} as never;

const BASE_URL = 'http://localhost/api/shifts';

function makeRequest(url = BASE_URL, options?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, options);
}

function postBody(overrides: Record<string, unknown> = {}) {
  return makeRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      barId: 'bar-1',
      employeeId: 'user-1',
      scheduledStart: '2026-09-01T16:00:00.000Z',
      scheduledEnd: '2026-09-01T23:00:00.000Z',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/shifts', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('returns a paginated page of shifts', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const shifts = [{ id: 'sh1' }];
    mockFindMany.mockResolvedValue(shifts as never);
    mockCount.mockResolvedValue(1);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: shifts, total: 1, page: 1, pageSize: 20 });
  });

  it('filters by bar, employee and status together', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest(`${BASE_URL}?barId=bar-1&employeeId=user-1&status=COMPLETED`));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { barId: 'bar-1', employeeId: 'user-1', status: 'COMPLETED' },
      }),
    );
  });

  it('ignores an unknown status', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest(`${BASE_URL}?status=NONSENSE`));

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('turns from and to into a scheduledStart range', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest(`${BASE_URL}?from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z`));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scheduledStart: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-09-02T00:00:00.000Z'),
          },
        },
      }),
    );
  });
});

describe('POST /api/shifts', () => {
  it('returns 401 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESPONSE);

    const res = await POST(postBody());

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates the shift and stamps the admin as its author', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' } as never);
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sh1' } as never);

    const res = await POST(postBody({ breakMinutes: 30, role: 'MIXOLOGIST', notes: ' late ' }));

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barId: 'bar-1',
          employeeId: 'user-1',
          breakMinutes: 30,
          role: 'MIXOLOGIST',
          notes: 'late',
          status: 'SCHEDULED',
          createdById: 'admin-1',
        }),
      }),
    );
  });

  it('rejects a shift that ends before it starts', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const res = await POST(
      postBody({
        scheduledStart: '2026-09-01T23:00:00.000Z',
        scheduledEnd: '2026-09-01T16:00:00.000Z',
      }),
    );

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects a break at least as long as the shift', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const res = await POST(postBody({ breakMinutes: 420 }));

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when the employee does not exist', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(postBody());

    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 409 when the employee is already scheduled then', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' } as never);
    mockFindFirst.mockResolvedValue({ id: 'sh-existing' } as never);

    const res = await POST(postBody());

    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('looks for clashes on the employee, ignoring cancelled shifts', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' } as never);
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sh1' } as never);

    await POST(postBody());

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: 'user-1',
          status: { not: 'CANCELLED' },
          scheduledStart: { lt: new Date('2026-09-01T23:00:00.000Z') },
          scheduledEnd: { gt: new Date('2026-09-01T16:00:00.000Z') },
        }),
      }),
    );
  });

  it('requires a bar and an employee', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const res = await POST(postBody({ employeeId: '' }));

    expect(res.status).toBe(400);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
});
