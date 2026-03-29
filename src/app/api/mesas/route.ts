import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const barId = searchParams.get('barId') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') ?? 20)));
  const skip = (page - 1) * pageSize;

  const where = { deletedAt: null, ...(barId ? { barId } : {}) };

  const [data, total] = await Promise.all([
    prisma.mesa.findMany({
      where,
      skip,
      take: pageSize,
      include: { bar: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.mesa.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const body = await request.json();
  const { barId, name, posX, posY, taken } = body;

  const mesa = await prisma.mesa.create({
    data: { barId, name, posX, posY, taken: taken ?? false },
    include: { bar: { select: { name: true } } },
  });

  return NextResponse.json(mesa, { status: 201 });
}
