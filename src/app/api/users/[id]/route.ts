import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const USER_ROLES = ['ADMIN', 'USER'] as const;
type UserRole = (typeof USER_ROLES)[number];

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(user);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const { role, gamertag } = body as { role?: string; gamertag?: string | null };

  if (role !== undefined && !USER_ROLES.includes(role as UserRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isDemotion = role === 'USER' && target.role === 'ADMIN';

  // You cannot lock yourself out.
  if (isDemotion && id === guard.session.user.id) {
    return NextResponse.json({ error: 'You cannot remove your own admin access' }, { status: 400 });
  }

  // Nor can you leave Backstage with no way in.
  if (isDemotion) {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last remaining admin' },
        { status: 400 },
      );
    }
  }

  const data: { role?: UserRole; gamertag?: string | null } = {};
  if (role !== undefined) data.role = role as UserRole;
  // Clearing is valid: gamertag is optional, and MySQL allows many NULLs under a unique index.
  if (gamertag !== undefined) data.gamertag = gamertag?.trim() || null;

  let user;
  try {
    user = await prisma.user.update({ where: { id }, data, select: USER_SELECT });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'That gamertag is already taken' }, { status: 409 });
    }
    throw err;
  }

  // customSession re-reads role on every session read, so demotion already bites on the
  // next request. Dropping the rows makes "revoked" mean revoked regardless of that.
  if (isDemotion) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }

  return NextResponse.json(user);
}
