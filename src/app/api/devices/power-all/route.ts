import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null) as { barId?: unknown; on?: unknown } | null;
  if (!body || typeof body.barId !== 'string' || !body.barId.trim() || typeof body.on !== 'boolean') {
    return NextResponse.json({ error: 'barId and on are required' }, { status: 400 });
  }

  const backendUrl = process.env.API_URL_BACKEND?.replace(/\/$/, '');
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend API is not configured' }, { status: 503 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${guard.session.session.token}`,
  };

  const response = await fetch(
    `${backendUrl}/api/protected-admin/devices/${encodeURIComponent(body.barId)}/power-all`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ on: body.on }),
      cache: 'no-store',
    },
  );
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      { error: result?.error?.message ?? result?.error ?? 'Device power command failed' },
      { status: response.status },
    );
  }

  return NextResponse.json(result);
}