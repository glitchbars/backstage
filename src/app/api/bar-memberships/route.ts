import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export const BAR_ROLES = ['BARBACK', 'MIXOLOGIST', 'OWNER', 'SUPERADMIN'] as const;
type BarRole = (typeof BAR_ROLES)[number];

const MEMBERSHIP_SELECT = {
  id: true,
  barId: true,
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, gamertag: true, role: true } },
  bar: { select: { name: true } },
};

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const barId = request.nextUrl.searchParams.get('barId') ?? undefined;

  const data = await prisma.barMembership.findMany({
    where: barId ? { barId } : {},
    select: MEMBERSHIP_SELECT,
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const body = await request.json();
  const { barId, userId, role } = body as { barId?: string; userId?: string; role?: string };

  if (!barId || !userId) {
    return NextResponse.json({ error: 'barId and userId are required' }, { status: 400 });
  }
  // BarMembership.role has no @default, so it must always be supplied.
  if (!role || !BAR_ROLES.includes(role as BarRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // At most one membership per user: the POS app resolves a user's bar with an
  // unordered findFirst, so a second row would non-deterministically change which
  // bar they are logged into. Assigning to a new bar therefore moves them.
  const membership = await prisma.$transaction(async (tx) => {
    await tx.barMembership.deleteMany({ where: { userId } });
    return tx.barMembership.create({
      data: { barId, userId, role: role as BarRole },
      select: MEMBERSHIP_SELECT,
    });
  });

  return NextResponse.json(membership, { status: 201 });
}
