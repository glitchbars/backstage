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
    prisma.console.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        bar: { select: { name: true } },
        mesa: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.console.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const body = await request.json();
  const { barId, mesaId, name, platform, active } = body;

  const console = await prisma.console.create({
    data: { barId, mesaId: mesaId || null, name, platform, active: active ?? true },
    include: {
      bar: { select: { name: true } },
      mesa: { select: { name: true } },
    },
  });

  return NextResponse.json(console, { status: 201 });
}
