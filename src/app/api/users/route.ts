import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  gamertag: true,
  role: true,
  createdAt: true,
  barMemberships: {
    select: {
      id: true,
      barId: true,
      role: true,
      bar: { select: { name: true } },
    },
  },
};

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim();
  const barId = searchParams.get('barId') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') ?? 20)));
  const skip = (page - 1) * pageSize;

  // Exact email match only. `email` is @unique so this is a single index hit,
  // and it keeps the page from becoming a browsable directory of every customer.
  const where = q
    ? { email: q }
    : barId
      ? { barMemberships: { some: { barId } } }
      : { OR: [{ role: 'ADMIN' as const }, { barMemberships: { some: {} } }] };

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}
