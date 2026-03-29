import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const consoleItem = await prisma.console.findUnique({
    where: { id },
    include: {
      bar: { select: { name: true } },
      mesa: { select: { name: true } },
    },
  });

  if (!consoleItem) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(consoleItem);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const { barId, mesaId, name, platform, active } = body;

  const consoleItem = await prisma.console.update({
    where: { id },
    data: { barId, mesaId: mesaId || null, name, platform, active },
    include: {
      bar: { select: { name: true } },
      mesa: { select: { name: true } },
    },
  });

  return NextResponse.json(consoleItem);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  await prisma.console.update({ where: { id }, data: { deletedAt: new Date() } });

  return new NextResponse(null, { status: 204 });
}
