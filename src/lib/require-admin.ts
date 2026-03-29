import { NextRequest, NextResponse } from 'next/server';
import { auth } from './auth';

export async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session || session.user.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { session };
}
