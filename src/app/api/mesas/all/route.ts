import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

// Returns all non-deleted mesas for a given bar (for dropdown use)
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const barId = searchParams.get('barId') ?? undefined;

  const mesas = await prisma.mesa.findMany({
    where: { deletedAt: null, ...(barId ? { barId } : {}) },
    select: { id: true, name: true, barId: true, posX: true, posY: true, taken: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(mesas);
}
