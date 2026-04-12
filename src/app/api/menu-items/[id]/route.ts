import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: {
      bar: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  if (!item || item.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const {
    barId,
    categoryId,
    name,
    description,
    priceAmountMinor,
    costAmountMinor,
    currency,
    taxRateBps,
    taxIncluded,
    active,
  } = body;

  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      barId,
      categoryId,
      name,
      description: description ?? null,
      priceAmountMinor,
      costAmountMinor,
      currency,
      taxRateBps,
      taxIncluded,
      active,
    },
    include: {
      bar: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  return NextResponse.json(item);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  await prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date() } });

  return new NextResponse(null, { status: 204 });
}
