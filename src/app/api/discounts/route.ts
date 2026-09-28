import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const barId = searchParams.get('barId') ?? undefined;
  const q = searchParams.get('q')?.trim();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') ?? 20)));
  const skip = (page - 1) * pageSize;

  const where = {
    deletedAt: null,
    ...(barId ? { barId } : {}),
    ...(q ? { name: { contains: q } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.discount.findMany({
      where,
      skip,
      take: pageSize,
      include: { bar: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.discount.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const body = await request.json();
  const { barId, name, percentBps, active } = body;

  if (!barId || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'barId and name are required' }, { status: 400 });
  }

  if (!Number.isInteger(percentBps) || percentBps <= 0 || percentBps > 10000) {
    return NextResponse.json(
      { error: 'percentBps must be an integer between 1 and 10000' },
      { status: 400 },
    );
  }

  const discount = await prisma.discount.create({
    data: {
      barId,
      name: name.trim(),
      percentBps,
      active: active ?? true,
    },
    include: { bar: { select: { name: true } } },
  });

  return NextResponse.json(discount, { status: 201 });
}
