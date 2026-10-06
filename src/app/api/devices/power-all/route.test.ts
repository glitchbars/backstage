import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/require-admin', () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from '@/lib/require-admin';
import { POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);

function request(body: unknown, headers?: HeadersInit) {
  return new NextRequest('http://localhost/api/devices/power-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.API_URL_BACKEND = 'https://backend.example';
});

describe('POST /api/devices/power-all', () => {
  it('requires an admin session', async () => {
    mockRequireAdmin.mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    expect((await POST(request({ barId: 'bar-1', on: true }))).status).toBe(401);
  });

  it('rejects malformed input before calling the backend', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { role: 'ADMIN' }, session: { token: 'session-value' } } } as never);
    const fetchMock = vi.spyOn(global, 'fetch');

    expect((await POST(request({ barId: 'bar-1', on: 'true' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the bearer session and only the power payload', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { role: 'ADMIN' }, session: { token: 'session-value' } } } as never);
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      on: false,
      results: [{ deviceId: 'device-1', status: 'fulfilled' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const response = await POST(request({ barId: 'bar-1', on: false }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/protected-admin/devices/bar-1/power-all',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer session-value' }),
        body: JSON.stringify({ on: false }),
      }),
    );
  });
});