import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const category = await prisma.menuCategory.findUnique({
    where: { id },
    include: { bar: { select: { name: true } } },
  });

  if (!category || category.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(category);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const { barId, name, sortOrder } = body;

  const category = await prisma.menuCategory.update({
    where: { id },
    data: { barId, name, sortOrder },
    include: { bar: { select: { name: true } } },
  });

  return NextResponse.json(category);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;

  try {
    await prisma.menuCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return NextResponse.json(
        { error: 'Cannot delete a category that has active menu items.' },
        { status: 409 },
      );
    }
    throw err;
  }

  return new NextResponse(null, { status: 204 });
}
