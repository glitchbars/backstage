import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

// Returns all menu categories (no pagination) for use in dropdowns
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const barId = searchParams.get('barId') ?? undefined;

  const categories = await prisma.menuCategory.findMany({
    where: { deletedAt: null, ...(barId ? { barId } : {}) },
    select: { id: true, name: true, barId: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json(categories);
}
