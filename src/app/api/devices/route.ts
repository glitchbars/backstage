import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';
import { parseDeviceBody } from './validation';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const barId = searchParams.get('barId') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') ?? 20)));
  const skip = (page - 1) * pageSize;

  const where = barId ? { barId } : {};

  const [data, total] = await Promise.all([
    prisma.barDevice.findMany({
      where,
      skip,
      take: pageSize,
      include: { bar: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.barDevice.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const parsed = parseDeviceBody(await request.json());
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const duplicate = await prisma.barDevice.findFirst({
    where: { barId: parsed.value.barId, externalDeviceId: parsed.value.externalDeviceId },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: 'A device with that external ID already exists for this bar' },
      { status: 409 },
    );
  }

  const device = await prisma.barDevice.create({
    data: parsed.value,
    include: { bar: { select: { name: true } } },
  });

  return NextResponse.json(device, { status: 201 });
}
