import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const BAR_ROLES = ['BARBACK', 'MIXOLOGIST', 'OWNER', 'SUPERADMIN'] as const;
type BarRole = (typeof BAR_ROLES)[number];

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const { role } = body as { role?: string };

  if (!role || !BAR_ROLES.includes(role as BarRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const membership = await prisma.barMembership.update({
    where: { id },
    data: { role: role as BarRole },
    select: {
      id: true,
      barId: true,
      userId: true,
      role: true,
      user: { select: { id: true, name: true, email: true, gamertag: true, role: true } },
    },
  });

  return NextResponse.json(membership);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  // A real delete, unlike every other entity here: BarMembership is a join table
  // and nothing references its rows. Users themselves are never deleted.
  await prisma.barMembership.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
