import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const mesa = await prisma.mesa.findUnique({
    where: { id },
    include: { bar: { select: { name: true } } },
  });

  if (!mesa) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(mesa);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const { barId, name, posX, posY, taken } = body;

  const mesa = await prisma.mesa.update({
    where: { id },
    data: { barId, name, posX, posY, taken },
    include: { bar: { select: { name: true } } },
  });

  return NextResponse.json(mesa);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  await prisma.mesa.update({ where: { id }, data: { deletedAt: new Date() } });

  return new NextResponse(null, { status: 204 });
}
